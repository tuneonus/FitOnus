import {
  inspectSafeBase64Payload,
  isSupportedAudioMime,
  MAX_AUDIO_BASE64_CHARS,
} from '../../../../shared/ai/audio-input.js';
import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { defaultAiMetrics } from '../../../../shared/ai/ai-metrics.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { VoiceMealParseInput, VoiceMealParseResult } from '../../domain/voice-meal.types.js';
import type { VoiceMealParser } from '../ports.js';

export class ParseVoiceMealUseCase {
  constructor(
    private readonly voiceMealService: VoiceMealParser,
    private readonly aiUsageGate: AiUsageGate,
  ) {}

  async execute(input: VoiceMealParseInput): Promise<VoiceMealParseResult> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }

    const hasTranscript = Boolean(input.transcript && input.transcript.trim());
    const hasAudio = Boolean(input.audioBase64 && input.audioBase64.trim());

    if (!hasTranscript && !hasAudio) {
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        'Either spoken audio data or transcript text must be provided.',
      );
    }

    if (hasAudio) {
      const valStart = performance.now();
      const approxBytes = Math.floor(((input.audioBase64?.length ?? 0) * 3) / 4);
      const recordValidationReject = (reason: string) => {
        try {
          defaultAiMetrics.recordMultimodalProcessing({
            modality: 'audio',
            durationMs: Math.round(performance.now() - valStart),
            validationDurationMs: Math.round(performance.now() - valStart),
            validationFailed: true,
            validationReason: reason,
            byteSize: approxBytes,
          });
        } catch {
          // Fail-open observability
        }
      };

      if ((input.audioBase64?.length ?? 0) > MAX_AUDIO_BASE64_CHARS) {
        recordValidationReject('oversize');
        throw new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'Audio size exceeds the 15MB limit.');
      }

      const mimeType = input.mimeType || 'audio/m4a';
      if (!isSupportedAudioMime(mimeType)) {
        recordValidationReject('invalid_mime');
        throw new AppError(
          'bad_request',
          'BAD_REQUEST',
          `Unsupported audio format (${mimeType}). Supported formats: m4a, mp4, aac, wav, webm, ogg.`,
        );
      }

      const audioInspection = inspectSafeBase64Payload(input.audioBase64!, 'audio');
      if (!audioInspection.ok) {
        recordValidationReject(audioInspection.reason === 'empty' ? 'empty_payload' : 'polyglot');
        throw new AppError(
          'validation',
          'VALIDATION_FAILED',
          audioInspection.reason === 'empty'
            ? 'Audio data is empty or unreadable.'
            : 'Audio payload contains unsupported or unsafe content.',
        );
      }

      // Validation above is free; only an admitted request is charged (see AiUsageGate).
      return this.aiUsageGate.run({ userId: input.userId, action: 'voice_meal' }, () =>
        this.voiceMealService.parseVoiceMeal({
          audio: { mimeType, base64: input.audioBase64! },
          transcript: input.transcript,
          lang: input.lang,
          mealType: input.mealType,
        }),
      );
    }

    // Transcript-only requests also call Gemini (text generation), so they are metered too.
    return this.aiUsageGate.run({ userId: input.userId, action: 'voice_meal' }, () =>
      this.voiceMealService.parseVoiceMeal({
        transcript: input.transcript,
        lang: input.lang,
        mealType: input.mealType,
      }),
    );
  }
}

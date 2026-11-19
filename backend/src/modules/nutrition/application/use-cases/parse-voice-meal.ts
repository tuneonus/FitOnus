import { isSupportedAudioMime, MAX_AUDIO_BASE64_CHARS } from '../../../../shared/ai/audio-input.js';
import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type {
  VoiceMealParseInput,
  VoiceMealParseResult,
} from '../../domain/voice-meal.types.js';
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
      if ((input.audioBase64?.length ?? 0) > MAX_AUDIO_BASE64_CHARS) {
        throw new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'Audio size exceeds the 15MB limit.');
      }

      const mimeType = input.mimeType || 'audio/m4a';
      if (!isSupportedAudioMime(mimeType)) {
        throw new AppError(
          'bad_request',
          'BAD_REQUEST',
          `Unsupported audio format (${mimeType}). Supported formats: m4a, mp4, aac, wav, webm, ogg.`,
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

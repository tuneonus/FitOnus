import { AppError } from '../../../../shared/errors/app-error.js';
import type {
  VoiceMealParseInput,
  VoiceMealParseResult,
} from '../../domain/voice-meal.types.js';
import type { GeminiVoiceMealService } from '../../infrastructure/gemini-voice-meal-service.js';

export class ParseVoiceMealUseCase {
  constructor(private readonly voiceMealService: GeminiVoiceMealService) {}

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
      if ((input.audioBase64?.length ?? 0) > 15 * 1024 * 1024) {
        throw new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'Audio size exceeds the 15MB limit.');
      }

      const mimeType = input.mimeType || 'audio/m4a';
      const supportedMimes = [
        'audio/m4a',
        'audio/mp4',
        'audio/aac',
        'audio/wav',
        'audio/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/3gpp',
      ];

      if (!supportedMimes.some((m) => mimeType.includes(m.replace('audio/', '')))) {
        throw new AppError(
          'bad_request',
          'BAD_REQUEST',
          `Unsupported audio format (${mimeType}). Supported formats: m4a, mp4, aac, wav, webm, ogg.`,
        );
      }

      return this.voiceMealService.parseVoiceMeal({
        audio: { mimeType, base64: input.audioBase64! },
        transcript: input.transcript,
        lang: input.lang,
        mealType: input.mealType,
      });
    }

    return this.voiceMealService.parseVoiceMeal({
      transcript: input.transcript,
      lang: input.lang,
      mealType: input.mealType,
    });
  }
}

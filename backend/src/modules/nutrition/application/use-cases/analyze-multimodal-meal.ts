import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type {
  MultimodalMealAnalysisInput,
  MultimodalMealAnalysisResult,
} from '../../domain/multimodal-meal.types.js';
import type { MultimodalMealAnalyzer } from '../ports.js';
import { validateAudioMediaInput, validateImageMediaInput } from '../media-validation.js';

/**
 * Orchestrates combined image, voice audio, and text meal analysis.
 * Validates all media payloads and caller cancellation before billing quota via AiUsageGate.
 */
export class AnalyzeMultimodalMealUseCase {
  constructor(
    private readonly multimodalMealService: MultimodalMealAnalyzer,
    private readonly aiUsageGate: AiUsageGate,
  ) {}

  async execute(input: MultimodalMealAnalysisInput): Promise<MultimodalMealAnalysisResult> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }

    const hasImage = Boolean(input.imageBase64 && input.imageBase64.trim());
    const hasAudio = Boolean(input.audioBase64 && input.audioBase64.trim());
    const hasTranscript = Boolean(input.transcript && input.transcript.trim());

    if (!hasImage && !hasAudio && !hasTranscript) {
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        'At least one of image, audio, or transcript must be provided.',
      );
    }

    const image = hasImage ? validateImageMediaInput(input.imageBase64!, input.imageMimeType) : undefined;
    const audio = hasAudio ? validateAudioMediaInput(input.audioBase64!, input.audioMimeType) : undefined;
    const transcript = hasTranscript ? input.transcript!.trim() : undefined;

    if (input.signal?.aborted) {
      throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'Request was cancelled before analysis started.');
    }

    // Meter against existing DB-supported AI actions without requiring schema changes.
    const action = hasImage ? 'meal_photo' : 'voice_meal';
    return this.aiUsageGate.run({ userId: input.userId, action }, () =>
      this.multimodalMealService.analyzeMultimodal({
        ...(image ? { image } : {}),
        ...(audio ? { audio } : {}),
        ...(transcript ? { transcript } : {}),
        ...(input.context ? { context: input.context } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      }),
    );
  }
}

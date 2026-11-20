import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { MAX_IMAGE_BASE64_CHARS } from '../../../../shared/ai/body-limits.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type {
  MealPhotoAnalysisInput,
  MealPhotoAnalysisResult,
} from '../../domain/meal-photo.types.js';
import type { MealPhotoAnalyzer } from '../ports.js';

export class AnalyzeMealPhotoUseCase {
  constructor(
    private readonly mealPhotoService: MealPhotoAnalyzer,
    private readonly aiUsageGate: AiUsageGate,
  ) {}

  async execute(input: MealPhotoAnalysisInput): Promise<MealPhotoAnalysisResult> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }

    if (!input.imageBase64 || !input.imageBase64.trim()) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Image data is required.');
    }

    // Limit image payload to max ~10MB base64 (the route's request body limit is derived from this same cap)
    if (input.imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      throw new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'Image size exceeds the 10MB limit.');
    }

    const mimeType = input.mimeType || 'image/jpeg';
    const supportedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!supportedMimes.includes(mimeType)) {
      throw new AppError(
        'bad_request',
        'BAD_REQUEST',
        `Unsupported image format. Allowed formats: ${supportedMimes.join(', ')}`,
      );
    }

    // Validation above is free; only an admitted request is charged (see AiUsageGate).
    return this.aiUsageGate.run({ userId: input.userId, action: 'meal_photo' }, () =>
      this.mealPhotoService.analyzePhoto(
        { mimeType, base64: input.imageBase64 },
        input.mealType,
        input.notes,
      ),
    );
  }
}

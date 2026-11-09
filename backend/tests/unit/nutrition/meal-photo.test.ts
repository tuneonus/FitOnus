import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzeMealPhotoUseCase } from '../../../src/modules/nutrition/application/use-cases/analyze-meal-photo.js';
import type { GeminiMealPhotoService } from '../../../src/modules/nutrition/infrastructure/gemini-meal-photo-service.js';
import type { MealPhotoAnalysisResult } from '../../../src/modules/nutrition/domain/meal-photo.types.js';

describe('AnalyzeMealPhotoUseCase', () => {
  let mockService: GeminiMealPhotoService;
  let useCase: AnalyzeMealPhotoUseCase;

  const samplePhotoResult: MealPhotoAnalysisResult = {
    isFood: true,
    summary: 'Grilled salmon with brown rice and asparagus',
    overallConfidence: 0.9,
    items: [
      {
        id: 'ai-food-1',
        name: 'Grilled Salmon Fillet',
        brand: 'AI Estimate',
        serving: '150g fillet',
        servingWeightG: 150,
        servingUnit: 'fillet',
        servingSize: 1,
        kcal: 312,
        protein: 34.2,
        carbs: 0,
        fat: 18.5,
        fiber: 0,
        confidence: 'high',
        isAiEstimated: true,
      },
      {
        id: 'ai-food-2',
        name: 'Cooked Brown Rice',
        brand: 'AI Estimate',
        serving: '1 cup (195g)',
        servingWeightG: 195,
        servingUnit: 'cup',
        servingSize: 1,
        kcal: 218,
        protein: 4.5,
        carbs: 45.8,
        fat: 1.6,
        fiber: 3.5,
        confidence: 'high',
        isAiEstimated: true,
      },
    ],
    totalKcal: 530,
    totalProteinGrams: 38.7,
    totalCarbsGrams: 45.8,
    totalFatGrams: 20.1,
    totalFiberGrams: 3.5,
    analyzedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      analyzePhoto: vi.fn().mockResolvedValue(samplePhotoResult),
    } as unknown as GeminiMealPhotoService;
    useCase = new AnalyzeMealPhotoUseCase(mockService);
  });

  it('successfully analyzes a meal photo and returns structured estimated nutrients', async () => {
    const result = await useCase.execute({
      userId: 'user-123',
      imageBase64: 'validBase64DataString',
      mimeType: 'image/jpeg',
      mealType: 'lunch',
    });

    expect(mockService.analyzePhoto).toHaveBeenCalledWith(
      { mimeType: 'image/jpeg', base64: 'validBase64DataString' },
      'lunch',
      undefined,
    );
    expect(result.isFood).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.isAiEstimated).toBe(true);
    expect(result.totalKcal).toBe(530);
  });

  it('rejects unauthenticated requests without userId', async () => {
    await expect(
      useCase.execute({
        userId: '',
        imageBase64: 'data',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toThrow('Authentication is required');
  });

  it('rejects requests with missing image data', async () => {
    await expect(
      useCase.execute({
        userId: 'user-123',
        imageBase64: '',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toThrow('Image data is required');
  });

  it('rejects unsupported image mime types', async () => {
    await expect(
      useCase.execute({
        userId: 'user-123',
        imageBase64: 'data',
        mimeType: 'image/gif' as any,
      }),
    ).rejects.toThrow('Unsupported image format');
  });

  it('rejects oversized base64 payloads exceeding 10MB', async () => {
    const hugeBase64 = 'A'.repeat(11 * 1024 * 1024);
    await expect(
      useCase.execute({
        userId: 'user-123',
        imageBase64: hugeBase64,
        mimeType: 'image/jpeg',
      }),
    ).rejects.toThrow('Image size exceeds the 10MB limit');
  });

  it('handles non-food images gracefully', async () => {
    vi.mocked(mockService.analyzePhoto).mockResolvedValueOnce({
      isFood: false,
      summary: 'No food detected',
      items: [],
      overallConfidence: 0,
      totalKcal: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      totalFiberGrams: 0,
      unclearReason: 'The image contains no recognizable food items.',
      analyzedAt: new Date().toISOString(),
    });

    const result = await useCase.execute({
      userId: 'user-123',
      imageBase64: 'emptyDeskPhoto',
      mimeType: 'image/png',
    });

    expect(result.isFood).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(result.unclearReason).toContain('no recognizable food items');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParseVoiceMealUseCase } from '../../../src/modules/nutrition/application/use-cases/parse-voice-meal.js';
import type { GeminiVoiceMealService } from '../../../src/modules/nutrition/infrastructure/gemini-voice-meal-service.js';
import type { VoiceMealParseResult } from '../../../src/modules/nutrition/domain/voice-meal.types.js';

describe('ParseVoiceMealUseCase', () => {
  let mockService: GeminiVoiceMealService;
  let useCase: ParseVoiceMealUseCase;

  const sampleEnglishResult: VoiceMealParseResult = {
    transcript: 'Two rotis with a bowl of dal and 100g paneer tikka',
    detectedLanguage: 'en',
    confidence: 'high',
    items: [
      {
        id: 'voice-food-1',
        name: 'Whole Wheat Roti',
        brand: 'AI Voice Estimate',
        serving: '2 pieces · 80 g',
        servingWeightG: 80,
        servingUnit: 'piece',
        servingSize: 2,
        kcal: 240,
        protein: 8,
        carbs: 40,
        fat: 6,
        fiber: 6,
        confidence: 'high',
        isAiEstimated: true,
      },
      {
        id: 'voice-food-2',
        name: 'Dal Tadka',
        brand: 'AI Voice Estimate',
        serving: '1 bowl · 200 g',
        servingWeightG: 200,
        servingUnit: 'bowl',
        servingSize: 1,
        kcal: 230,
        protein: 12,
        carbs: 30,
        fat: 7,
        fiber: 8,
        confidence: 'high',
        isAiEstimated: true,
      },
    ],
    totalKcal: 470,
    totalProteinGrams: 20,
    totalCarbsGrams: 70,
    totalFatGrams: 13,
    totalFiberGrams: 14,
    parsedAt: new Date().toISOString(),
  };

  const sampleTamilResult: VoiceMealParseResult = {
    transcript: 'rendu dosai sambar konjam chutney',
    detectedLanguage: 'tanglish',
    confidence: 'high',
    items: [
      {
        id: 'voice-food-tamil-1',
        name: 'Plain Dosa',
        brand: 'AI Voice Estimate',
        serving: '2 pieces · 160 g',
        servingWeightG: 160,
        servingUnit: 'piece',
        servingSize: 2,
        kcal: 266,
        protein: 6,
        carbs: 45,
        fat: 7,
        fiber: 2,
        confidence: 'high',
        isAiEstimated: true,
      },
      {
        id: 'voice-food-tamil-2',
        name: 'Sambar',
        brand: 'AI Voice Estimate',
        serving: '1 small bowl · 150 g',
        servingWeightG: 150,
        servingUnit: 'bowl',
        servingSize: 1,
        kcal: 110,
        protein: 4,
        carbs: 18,
        fat: 3,
        fiber: 4,
        confidence: 'high',
        isAiEstimated: true,
      },
    ],
    totalKcal: 376,
    totalProteinGrams: 10,
    totalCarbsGrams: 63,
    totalFatGrams: 10,
    totalFiberGrams: 6,
    parsedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      parseVoiceMeal: vi.fn().mockResolvedValue(sampleEnglishResult),
    } as unknown as GeminiVoiceMealService;
    useCase = new ParseVoiceMealUseCase(mockService);
  });

  it('successfully parses meal items from English transcript text', async () => {
    const result = await useCase.execute({
      userId: 'user-123',
      transcript: 'Two rotis with a bowl of dal and 100g paneer tikka',
      mealType: 'lunch',
    });

    expect(mockService.parseVoiceMeal).toHaveBeenCalledWith({
      transcript: 'Two rotis with a bowl of dal and 100g paneer tikka',
      lang: undefined,
      mealType: 'lunch',
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.isAiEstimated).toBe(true);
    expect(result.totalKcal).toBe(470);
  });

  it('successfully parses Tamil / Tanglish transcript text', async () => {
    vi.mocked(mockService.parseVoiceMeal).mockResolvedValueOnce(sampleTamilResult);

    const result = await useCase.execute({
      userId: 'user-123',
      transcript: 'rendu dosai sambar konjam chutney',
      lang: 'ta',
      mealType: 'breakfast',
    });

    expect(result.detectedLanguage).toBe('tanglish');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.name).toBe('Plain Dosa');
    expect(result.totalKcal).toBe(376);
  });

  it('successfully processes audio base64 payload', async () => {
    const result = await useCase.execute({
      userId: 'user-123',
      audioBase64: 'audioBase64EncodedStringData',
      mimeType: 'audio/m4a',
      mealType: 'dinner',
    });

    expect(mockService.parseVoiceMeal).toHaveBeenCalledWith({
      audio: { mimeType: 'audio/m4a', base64: 'audioBase64EncodedStringData' },
      transcript: undefined,
      lang: undefined,
      mealType: 'dinner',
    });
    expect(result.items).toHaveLength(2);
  });

  it('rejects unauthenticated requests without userId', async () => {
    await expect(
      useCase.execute({
        userId: '',
        transcript: 'one apple',
      }),
    ).rejects.toThrow('Authentication is required');
  });

  it('rejects requests with neither transcript nor audio', async () => {
    await expect(
      useCase.execute({
        userId: 'user-123',
        transcript: '',
      }),
    ).rejects.toThrow('Either spoken audio data or transcript text must be provided');
  });

  it('rejects oversized audio payloads exceeding 15MB', async () => {
    const hugeAudio = 'A'.repeat(16 * 1024 * 1024);
    await expect(
      useCase.execute({
        userId: 'user-123',
        audioBase64: hugeAudio,
        mimeType: 'audio/m4a',
      }),
    ).rejects.toThrow('Audio size exceeds the 15MB limit');
  });

  it('handles unclear or non-food speech gracefully', async () => {
    vi.mocked(mockService.parseVoiceMeal).mockResolvedValueOnce({
      transcript: 'hello how are you doing today',
      detectedLanguage: 'en',
      items: [],
      confidence: 'low',
      totalKcal: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      unclearReason: 'Could not identify any food items. Please say what you ate.',
      parsedAt: new Date().toISOString(),
    });

    const result = await useCase.execute({
      userId: 'user-123',
      transcript: 'hello how are you doing today',
    });

    expect(result.items).toHaveLength(0);
    expect(result.confidence).toBe('low');
    expect(result.unclearReason).toContain('Could not identify any food items');
  });
});

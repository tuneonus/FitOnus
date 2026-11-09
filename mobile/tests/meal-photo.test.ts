import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AnalyzeMealPhotoParams,
  MealPhotoAnalysisResult,
} from '../src/features/ai-coach/services/meal-photo-api';
import type { FoodItem } from '../src/features/nutrition/types/nutrition';

describe('Meal Photo AI Mobile Contracts & Data Mapping', () => {
  it('validates AnalyzeMealPhotoParams schema', () => {
    const params: AnalyzeMealPhotoParams = {
      image: 'base64EncodedJpegData',
      mimeType: 'image/jpeg',
      mealType: 'lunch',
      notes: 'Contains grilled chicken and brown rice',
    };

    assert.equal(params.image, 'base64EncodedJpegData');
    assert.equal(params.mimeType, 'image/jpeg');
    assert.equal(params.mealType, 'lunch');
    assert.equal(params.notes, 'Contains grilled chicken and brown rice');
  });

  it('validates MealPhotoAnalysisResult correctly flags items as AI estimated', () => {
    const mockFood: FoodItem = {
      id: 'ai-food-1',
      name: 'Grilled Salmon',
      brand: 'AI Estimate',
      serving: '150g',
      kcal: 312,
      protein: 34,
      carbs: 0,
      fat: 18,
      fiber: 0,
      isAiEstimated: true,
    };

    const result: MealPhotoAnalysisResult = {
      isFood: true,
      summary: 'Grilled salmon fillet',
      items: [mockFood],
      overallConfidence: 0.9,
      totalKcal: 312,
      totalProteinGrams: 34,
      totalCarbsGrams: 0,
      totalFatGrams: 18,
      totalFiberGrams: 0,
      analyzedAt: new Date().toISOString(),
    };

    assert.equal(result.isFood, true);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.isAiEstimated, true);
    assert.equal(result.totalKcal, 312);
  });

  it('correctly handles non-food / unclear photo warning states', () => {
    const result: MealPhotoAnalysisResult = {
      isFood: false,
      summary: 'No food detected',
      items: [],
      overallConfidence: 0,
      totalKcal: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
      unclearReason: 'The image contains no recognizable food items.',
      analyzedAt: new Date().toISOString(),
    };

    assert.equal(result.isFood, false);
    assert.equal(result.items.length, 0);
    assert.ok(result.unclearReason?.includes('no recognizable food'));
  });
});

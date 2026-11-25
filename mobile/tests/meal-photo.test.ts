import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../src/services/api-client';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { queryClient } from '../src/providers/query-provider';
import {
  MealPhotoApi,
  mapMealPhotoResponse,
  type MealPhotoBackendResponse,
} from '../src/features/ai-coach/services/meal-photo-api';
import {
  LOW_CONFIDENCE_THRESHOLD,
  confidenceToScore,
  mapDetectedFoodItem,
  type DetectedFoodItemDto,
} from '../src/features/nutrition/utils/detected-food';
import {
  MEAL_PHOTO_DIMENSIONS_MESSAGE,
  MEAL_PHOTO_MAX_DIMENSION_PX,
  normalizeMealPhotoNotes,
  prepareMealPhoto,
} from '../src/features/nutrition/utils/meal-photo-upload';
import { mealPhotoResponseSchema } from '../../backend/src/modules/nutrition/interface/meal-photo.schemas';

const salmon = (overrides: Partial<DetectedFoodItemDto> = {}): DetectedFoodItemDto => ({
  id: 'ai-food-1',
  name: 'Grilled Salmon',
  brand: 'AI Estimate',
  serving: '150g fillet',
  servingWeightG: 150,
  servingUnit: 'fillet',
  servingSize: 1,
  kcal: 312,
  protein: 34,
  carbs: 0,
  fat: 18,
  fiber: 0,
  confidence: 'high',
  isAiEstimated: true,
  ...overrides,
});

const response = (items: DetectedFoodItemDto[], extra: Partial<MealPhotoBackendResponse> = {}) => ({
  isFood: items.length > 0,
  summary: items.length ? 'Grilled salmon fillet' : 'No food detected',
  items,
  overallConfidence: items.length ? 0.9 : 0,
  totalKcal: items.reduce((sum, item) => sum + item.kcal, 0),
  totalProteinGrams: items.reduce((sum, item) => sum + item.protein, 0),
  totalCarbsGrams: 0,
  totalFatGrams: items.reduce((sum, item) => sum + item.fat, 0),
  totalFiberGrams: 0,
  analyzedAt: '2026-11-05T10:00:00.000Z',
  ...extra,
});

describe('AI confidence: the model says high / medium / low, the UI needs a 0..1 score', () => {
  it('maps each word to one fixed score, and only "low" is below the warning threshold', () => {
    assert.equal(confidenceToScore('high'), 0.95);
    assert.equal(confidenceToScore('medium'), 0.8);
    assert.equal(confidenceToScore('low'), 0.6);
    assert.ok(confidenceToScore('high')! >= LOW_CONFIDENCE_THRESHOLD);
    assert.ok(confidenceToScore('medium')! >= LOW_CONFIDENCE_THRESHOLD);
    assert.ok(confidenceToScore('low')! < LOW_CONFIDENCE_THRESHOLD);
  });

  it('passes a numeric score through (clamped) and treats anything else as unknown', () => {
    assert.equal(confidenceToScore(0.42), 0.42);
    assert.equal(confidenceToScore(7), 1);
    assert.equal(confidenceToScore(-1), 0);
    assert.equal(confidenceToScore(undefined), undefined);
    assert.equal(confidenceToScore('certain' as never), undefined);
    assert.equal(confidenceToScore(Number.NaN), undefined);
  });

  it('every mapped score can be shown as a percentage (the old screen showed "NaN% confidence")', () => {
    for (const word of ['high', 'medium', 'low'] as const) {
      const item = mapDetectedFoodItem(salmon({ confidence: word }));
      assert.ok(
        Number.isFinite(Math.round(item.confidence! * 100)),
        `${word} must be a finite percentage`,
      );
    }
  });
});

describe('mapDetectedFoodItem', () => {
  it('flags the item as an estimate, keeps the AI label, and has no catalog food behind it', () => {
    const item = mapDetectedFoodItem(salmon());
    assert.equal(item.estimated, true);
    assert.equal(item.brand, 'AI Estimate');
    assert.equal(item.foodId, null);
    assert.equal(item.kcal, 312);
    assert.equal(item.servingWeightG, 150);
  });

  it('fills a missing fiber with 0 and leaves confidence out when the model gave none', () => {
    const item = mapDetectedFoodItem(salmon({ fiber: undefined, confidence: undefined }));
    assert.equal(item.fiber, 0);
    assert.equal('confidence' in item, false);
  });
});

describe('MealPhotoApi (real client, canned HTTP)', () => {
  const original = apiClient.defaults.adapter;
  let posted: { url?: string; body: Record<string, unknown> } | null = null;

  beforeEach(() => {
    useAuthStore
      .getState()
      .setAuth({ id: 'u1', name: 'U', email: 'u@example.test', isEmailVerified: true });
    posted = null;
  });
  afterEach(() => {
    apiClient.defaults.adapter = original;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  });

  const reply = (data: unknown) => {
    apiClient.defaults.adapter = (async (config: { url?: string; data?: unknown }) => {
      posted = { url: config.url, body: JSON.parse(String(config.data)) };
      return { config, status: 200, statusText: 'OK', headers: {}, data: { success: true, data } };
    }) as never;
  };

  it('posts the photo and maps a reply that satisfies the real backend contract', async () => {
    // The reply is checked against the backend's own response schema, so this test breaks if the contract moves.
    reply(
      mealPhotoResponseSchema.parse(
        response([salmon(), salmon({ id: 'ai-food-2', confidence: 'low' })]),
      ),
    );

    const result = await MealPhotoApi.analyzeMealPhoto({ image: 'aGVsbG8=', mealType: 'snacks' });

    assert.equal(posted!.url, '/nutrition/meal-photo/analyze');
    assert.deepEqual(posted!.body, {
      image: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      mealType: 'snacks',
    });
    assert.deepEqual(
      result.items.map((item) => item.confidence),
      [0.95, 0.6],
    );
    assert.ok(result.items.every((item) => item.estimated === true));
    assert.equal(result.totalKcal, 624);
  });

  it('a non-food photo comes back with no items and the reason', async () => {
    reply(response([], { isFood: false, unclearReason: 'No clear food detected in image.' }));

    const result = await MealPhotoApi.analyzeMealPhoto({ image: 'aGVsbG8=' });

    assert.equal(result.isFood, false);
    assert.deepEqual(result.items, []);
    assert.equal(result.unclearReason, 'No clear food detected in image.');
  });

  it('mapMealPhotoResponse keeps the totals untouched', () => {
    const mapped = mapMealPhotoResponse(response([salmon()]));
    assert.equal(mapped.overallConfidence, 0.9);
    assert.equal(mapped.totalProteinGrams, 34);
    assert.equal(mapped.items.length, 1);
  });

  it('rejects an empty reply instead of showing an empty review screen', async () => {
    apiClient.defaults.adapter = (async (config: unknown) => ({
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true },
    })) as never;

    await assert.rejects(MealPhotoApi.analyzeMealPhoto({ image: 'aGVsbG8=' }), /Invalid response/);
  });

  it('supports optional correction notes and blocks oversized image dimensions', async () => {
    reply(response([salmon()]));
    const cleaned = normalizeMealPhotoNotes('  cooked\nwith "ghee"\t ');
    assert.equal(cleaned, "cooked with 'ghee'");

    await MealPhotoApi.analyzeMealPhoto({
      image: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      mealType: 'dinner',
      notes: cleaned,
    });
    assert.equal(posted!.body.notes, "cooked with 'ghee'");

    assert.deepEqual(
      prepareMealPhoto({
        base64: 'aGVsbG8=',
        mimeType: 'image/jpeg',
        width: MEAL_PHOTO_MAX_DIMENSION_PX + 10,
        height: 500,
      }),
      { ok: false, message: MEAL_PHOTO_DIMENSIONS_MESSAGE },
    );
  });
});

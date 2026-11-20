import { z } from 'zod';
import { currentAiRequestContext } from '../../../shared/ai/ai-usage.js';
import { callPythonAi, pythonUsageSchema, requireGateUserId } from '../../../shared/ai/python-ai-call.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { MealPhotoAnalyzer } from '../application/ports.js';
import { pythonDetectedFoodItemsSchema, pythonTotals } from './python-detected-food.js';
import type { DetectedFoodItem, MealPhotoAnalysisResult } from '../domain/meal-photo.types.js';

/** Token scope Python requires for this endpoint. */
export const MEAL_PHOTO_SCOPE = 'ai:meals:photo';
export const MEAL_PHOTO_PATH = '/internal/v1/ai/meals/analyze-photo';

/** The mobile app gives up on meal photo after 30 s, so our HTTP timeout must stay below that. */
export const MEAL_PHOTO_MAX_TIMEOUT_MS = 27_000;
/** Python's Gemini deadline is set this much below our HTTP timeout so Python can answer first. */
const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

/** Same wording the app has always received when image analysis fails. */
export const MEAL_PHOTO_UNAVAILABLE_MESSAGE = 'Unable to analyze meal image right now. Please try again.';

/** Python's reply, validated and bounded before anything is trusted. Mirrors ai-backend/src/onusfit_ai/features/meals/domain/photo.py. */
const pythonMealPhotoResponseSchema = z.object({
  outcome: z.enum(['ok', 'no_food', 'parse_failed']),
  result: z.object({
    isFood: z.boolean(),
    summary: z.string().max(300),
    items: pythonDetectedFoodItemsSchema,
    overallConfidence: z.number().min(0).max(1),
    totalKcal: pythonTotals.kcal,
    totalProteinGrams: pythonTotals.macroG,
    totalCarbsGrams: pythonTotals.macroG,
    totalFatGrams: pythonTotals.macroG,
    totalFiberGrams: pythonTotals.fiberG,
    unclearReason: z.string().max(300).nullish(),
    analyzedAt: z.string(),
  }),
  usage: pythonUsageSchema,
  traceId: z.string(),
});

export interface PythonMealPhotoDeps {
  client: PythonAiClient;
  /** Primary/fallback Gemini model names for `meal_photo` from the admin console. */
  resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  usageRecorder?: AiUsageRecorder;
  /** HTTP timeout for the call to Python (capped at {@link MEAL_PHOTO_MAX_TIMEOUT_MS}). */
  pythonTimeoutMs: number;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * Meal photo analysis (photo -> detected food items and totals), served only by the Python AI
 * backend. Implements the `MealPhotoAnalyzer` port, so `AnalyzeMealPhotoUseCase` (validation, 10 MB
 * cap, mime allow-list, the AI quota gate) is unchanged. Nothing is persisted by this feature.
 */
export class PythonMealPhotoService implements MealPhotoAnalyzer {
  constructor(private readonly deps: PythonMealPhotoDeps) {}

  async analyzePhoto(
    image: { mimeType: string; base64: string },
    mealType?: string,
    notes?: string,
  ): Promise<MealPhotoAnalysisResult> {
    // Identity comes from the server-side request context set by the AI usage gate, never from input.
    const userId = requireGateUserId(currentAiRequestContext()?.userId);

    const models = await this.deps.resolveModels();
    const timeoutMs = Math.min(this.deps.pythonTimeoutMs, MEAL_PHOTO_MAX_TIMEOUT_MS);
    const { result } = await callPythonAi({
      client: this.deps.client,
      path: MEAL_PHOTO_PATH,
      scope: MEAL_PHOTO_SCOPE,
      userId,
      requestId: `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timeoutMs,
      body: {
        image: { mimeType: image.mimeType, base64: image.base64 },
        // Optional fields that are undefined are dropped by JSON.stringify.
        mealType,
        notes,
        model: { primary: models.primary, fallback: models.fallback },
        deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
      },
      schema: pythonMealPhotoResponseSchema,
      feature: 'meal_photo',
      usageRecorder: this.deps.usageRecorder,
      logger: this.deps.logger,
      label: 'Python meal photo',
      unavailableMessage: MEAL_PHOTO_UNAVAILABLE_MESSAGE,
    });

    // The exact shape the mobile app has always received (optional keys are absent, never null).
    const items: DetectedFoodItem[] = result.items.map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.brand ? { brand: item.brand } : {}),
      serving: item.serving,
      ...(typeof item.servingWeightG === 'number' ? { servingWeightG: item.servingWeightG } : {}),
      ...(typeof item.servingUnit === 'string' ? { servingUnit: item.servingUnit } : {}),
      ...(typeof item.servingSize === 'number' ? { servingSize: item.servingSize } : {}),
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      ...(typeof item.fiber === 'number' ? { fiber: item.fiber } : {}),
      confidence: item.confidence,
      isAiEstimated: item.isAiEstimated,
    }));
    return {
      isFood: result.isFood,
      summary: result.summary,
      items,
      overallConfidence: result.overallConfidence,
      totalKcal: result.totalKcal,
      totalProteinGrams: result.totalProteinGrams,
      totalCarbsGrams: result.totalCarbsGrams,
      totalFatGrams: result.totalFatGrams,
      totalFiberGrams: result.totalFiberGrams,
      ...(result.unclearReason ? { unclearReason: result.unclearReason } : {}),
      analyzedAt: result.analyzedAt,
    };
  }
}

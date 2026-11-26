import { z } from 'zod';
import { currentAiRequestContext } from '../../../shared/ai/ai-usage.js';
import { callPythonAi, pythonUsageSchema, requireGateUserId } from '../../../shared/ai/python-ai-call.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { MultimodalMealAnalyzer } from '../application/ports.js';
import type { MultimodalContextHint, MultimodalMealAnalysisResult } from '../domain/multimodal-meal.types.js';
import { AI_ESTIMATE_LIMITS } from '../domain/nutrition-limits.js';
import {
  mapPythonDetectedFoodItems,
  pythonConfidence,
  pythonDetectedFoodItemsSchema,
  pythonTotals,
} from './python-detected-food.js';

export const MULTIMODAL_MEAL_SCOPE = 'ai:meals:multimodal';
export const MULTIMODAL_MEAL_PATH = '/internal/v1/ai/meals/analyze-multimodal';

export const MULTIMODAL_MEAL_MAX_TIMEOUT_MS = 27_000;
const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

export const MULTIMODAL_MEAL_UNAVAILABLE_MESSAGE =
  'Unable to analyze meal right now. Please try again shortly.';

/** Bounded schema matching ai-backend/src/onusfit_ai/features/meals/domain/multimodal.py. */
const pythonMultimodalResponseSchema = z.object({
  outcome: z.enum(['ok', 'no_food', 'parse_failed']),
  result: z.object({
    modalitiesUsed: z
      .array(z.enum(['text', 'audio', 'image']))
      .min(1)
      .max(3),
    isFood: z.boolean(),
    summary: z.string().max(300),
    transcript: z.string().max(AI_ESTIMATE_LIMITS.transcriptLength),
    detectedLanguage: z.string().max(AI_ESTIMATE_LIMITS.hintLength),
    items: pythonDetectedFoodItemsSchema,
    overallConfidence: z.number().min(0).max(1),
    confidence: pythonConfidence,
    totalKcal: pythonTotals.kcal,
    totalProteinGrams: pythonTotals.macroG,
    totalCarbsGrams: pythonTotals.macroG,
    totalFatGrams: pythonTotals.macroG,
    totalFiberGrams: pythonTotals.fiberG,
    unclearReason: z.string().max(300).nullish(),
    uncertaintyNote: z.string().max(300).nullish(),
    medicalDisclaimer: z.string().min(1).max(500),
    analyzedAt: z.string(),
  }),
  usage: pythonUsageSchema,
  traceId: z.string(),
});

export interface PythonMultimodalMealDeps {
  client: PythonAiClient;
  resolveModels: (
    feature: 'meal_photo' | 'voice_meal',
  ) => Promise<{ primary: string; fallback: string | null }>;
  usageRecorder?: AiUsageRecorder;
  pythonTimeoutMs: number;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * Python AI backend adapter for fused image + voice audio + text meal analysis.
 */
export class PythonMultimodalMealService implements MultimodalMealAnalyzer {
  constructor(private readonly deps: PythonMultimodalMealDeps) {}

  async analyzeMultimodal(params: {
    image?: { mimeType: string; base64: string };
    audio?: { mimeType: string; base64: string };
    transcript?: string;
    context?: MultimodalContextHint;
    signal?: AbortSignal;
  }): Promise<MultimodalMealAnalysisResult> {
    const userId = requireGateUserId(currentAiRequestContext()?.userId);
    const feature: 'meal_photo' | 'voice_meal' = params.image ? 'meal_photo' : 'voice_meal';
    const models = await this.deps.resolveModels(feature);
    const timeoutMs = Math.min(this.deps.pythonTimeoutMs, MULTIMODAL_MEAL_MAX_TIMEOUT_MS);

    const hasContext = Boolean(
      params.context &&
      (params.context.mealType ||
        params.context.lang ||
        params.context.notes ||
        params.context.dietaryGoal ||
        params.context.allergies?.length ||
        params.context.dailyCalorieTarget !== undefined),
    );

    const { result } = await callPythonAi({
      client: this.deps.client,
      path: MULTIMODAL_MEAL_PATH,
      scope: MULTIMODAL_MEAL_SCOPE,
      userId,
      requestId: `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timeoutMs,
      signal: params.signal,
      body: {
        audio: params.audio ? { mimeType: params.audio.mimeType, base64: params.audio.base64 } : undefined,
        image: params.image ? { mimeType: params.image.mimeType, base64: params.image.base64 } : undefined,
        transcript: params.transcript,
        context: hasContext ? params.context : undefined,
        model: { primary: models.primary, fallback: models.fallback },
        deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
      },
      schema: pythonMultimodalResponseSchema,
      feature,
      usageRecorder: this.deps.usageRecorder,
      logger: this.deps.logger,
      label: 'Python multimodal meal',
      unavailableMessage: MULTIMODAL_MEAL_UNAVAILABLE_MESSAGE,
    });

    return {
      modalitiesUsed: result.modalitiesUsed,
      isFood: result.isFood,
      summary: result.summary,
      transcript: result.transcript,
      detectedLanguage: result.detectedLanguage,
      items: mapPythonDetectedFoodItems(result.items),
      overallConfidence: result.overallConfidence,
      confidence: result.confidence,
      totalKcal: result.totalKcal,
      totalProteinGrams: result.totalProteinGrams,
      totalCarbsGrams: result.totalCarbsGrams,
      totalFatGrams: result.totalFatGrams,
      totalFiberGrams: result.totalFiberGrams,
      ...(result.unclearReason ? { unclearReason: result.unclearReason } : {}),
      ...(result.uncertaintyNote ? { uncertaintyNote: result.uncertaintyNote } : {}),
      medicalDisclaimer: result.medicalDisclaimer,
      analyzedAt: result.analyzedAt,
    };
  }
}

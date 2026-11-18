import { z } from 'zod';
import { currentAiRequestContext, markAiRequestDispatched } from '../../../shared/ai/ai-usage.js';
import { toPublicAiError } from '../../../shared/ai/python-ai-errors.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import { PythonAiError } from '../../../shared/ai/python-ai-client.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { VoiceMealParser } from '../application/ports.js';
import type { DetectedFoodItem } from '../domain/meal-photo.types.js';
import type { VoiceMealParseResult } from '../domain/voice-meal.types.js';

/** Token scope Python requires for this endpoint. */
export const VOICE_MEAL_SCOPE = 'ai:meals:voice';
export const VOICE_MEAL_PATH = '/internal/v1/ai/meals/parse-voice';

/** The mobile app gives up on voice meal after 25 s, so our HTTP timeout must stay below that. */
export const VOICE_MEAL_MAX_TIMEOUT_MS = 22_000;
/** Python's Gemini deadline is set this much below our HTTP timeout so Python can answer first. */
const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

export const VOICE_MEAL_UNAVAILABLE_MESSAGE = 'Voice meal parsing is temporarily unavailable. Please try again shortly.';

const confidence = z.enum(['high', 'medium', 'low']);
const intNumber = z.number().int().nonnegative();

/** Python's reply, validated before anything is trusted. Mirrors ai-backend/contracts/voice_meal.py. */
const pythonVoiceResponseSchema = z.object({
  outcome: z.enum(['ok', 'no_food', 'parse_failed']),
  result: z.object({
    transcript: z.string(),
    detectedLanguage: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        brand: z.string().nullish(),
        serving: z.string(),
        servingWeightG: z.number().nullish(),
        servingUnit: z.string().nullish(),
        servingSize: z.number().nullish(),
        kcal: z.number(),
        protein: z.number(),
        carbs: z.number(),
        fat: z.number(),
        fiber: z.number().nullish(),
        confidence,
        isAiEstimated: z.boolean(),
      }),
    ),
    confidence,
    totalKcal: z.number(),
    totalProteinGrams: z.number(),
    totalCarbsGrams: z.number(),
    totalFatGrams: z.number(),
    totalFiberGrams: z.number().nullish(),
    unclearReason: z.string().nullish(),
    parsedAt: z.string(),
  }),
  usage: z.object({
    model: z.string(),
    isFallback: z.boolean(),
    inputTokens: intNumber,
    outputTokens: intNumber,
    cachedTokens: intNumber,
    thinkingTokens: intNumber,
    totalTokens: intNumber,
    durationMs: intNumber,
  }),
  traceId: z.string(),
});

export interface PythonVoiceMealDeps {
  client: PythonAiClient;
  /** Primary/fallback Gemini model names for `voice_meal` from the admin console. */
  resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  usageRecorder?: AiUsageRecorder;
  /** HTTP timeout for the call to Python (capped at {@link VOICE_MEAL_MAX_TIMEOUT_MS}). */
  pythonTimeoutMs: number;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * Voice meal parsing (typed/spoken meal description -> food items), served only by the Python AI
 * backend. Implements the `VoiceMealParser` port, so `ParseVoiceMealUseCase` (validation, 15 MB audio
 * cap, mime allow-list, the AI quota gate) is unchanged. Nothing is persisted by this feature.
 */
export class PythonVoiceMealService implements VoiceMealParser {
  constructor(private readonly deps: PythonVoiceMealDeps) {}

  async parseVoiceMeal(params: {
    transcript?: string;
    audio?: { mimeType: string; base64: string };
    lang?: string;
    mealType?: string;
  }): Promise<VoiceMealParseResult> {
    // Identity comes from the server-side request context set by the AI usage gate, never from input.
    const aiContext = currentAiRequestContext();
    if (!aiContext) throw new AppError('internal', 'INTERNAL_ERROR', 'AI request context is missing.');

    const requestId = `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      return await this.callPython(params, aiContext.userId, requestId);
    } catch (error) {
      const failure =
        error instanceof PythonAiError
          ? error
          : new PythonAiError('server_error', 'Unexpected error preparing the AI backend call.', {
              dispatched: false,
            });
      // If Gemini may have been called, the quota unit stays consumed; otherwise the gate refunds it.
      if (failure.dispatched) markAiRequestDispatched();
      this.deps.logger?.error(
        { kind: failure.kind, status: failure.info.status, code: failure.info.code, requestId },
        'Python voice meal failed',
      );
      throw toPublicAiError(failure, VOICE_MEAL_UNAVAILABLE_MESSAGE);
    }
  }

  private async callPython(
    params: {
      transcript?: string;
      audio?: { mimeType: string; base64: string };
      lang?: string;
      mealType?: string;
    },
    userId: string,
    requestId: string,
  ): Promise<VoiceMealParseResult> {
    const models = await this.deps.resolveModels();
    const timeoutMs = Math.min(this.deps.pythonTimeoutMs, VOICE_MEAL_MAX_TIMEOUT_MS);

    const raw = await this.deps.client.postJson({
      path: VOICE_MEAL_PATH,
      scope: VOICE_MEAL_SCOPE,
      userId,
      requestId,
      timeoutMs,
      body: {
        // Optional fields that are undefined are dropped by JSON.stringify.
        transcript: params.transcript,
        audio: params.audio ? { mimeType: params.audio.mimeType, base64: params.audio.base64 } : undefined,
        lang: params.lang,
        mealType: params.mealType,
        model: { primary: models.primary, fallback: models.fallback },
        deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
      },
    });

    // The request definitely reached Python, so Gemini may have been billed.
    markAiRequestDispatched();

    const parsed = pythonVoiceResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new PythonAiError('invalid_response', 'AI backend response did not match the contract.', {
        dispatched: true,
      });
    }
    const { result, usage, outcome } = parsed.data;

    this.deps.usageRecorder
      ?.recordExternalUsage({
        requestId,
        userId,
        feature: 'voice_meal',
        model: usage.model,
        isFallback: usage.isFallback,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        totalTokens: usage.totalTokens,
        durationMs: usage.durationMs,
      })
      .catch(() => undefined);
    this.deps.logger?.info(
      { requestId, outcome, model: usage.model, fallbackModel: usage.isFallback, items: result.items.length },
      'Python voice meal served',
    );

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
      transcript: result.transcript,
      detectedLanguage: result.detectedLanguage,
      items,
      confidence: result.confidence,
      totalKcal: result.totalKcal,
      totalProteinGrams: result.totalProteinGrams,
      totalCarbsGrams: result.totalCarbsGrams,
      totalFatGrams: result.totalFatGrams,
      ...(typeof result.totalFiberGrams === 'number' ? { totalFiberGrams: result.totalFiberGrams } : {}),
      ...(result.unclearReason ? { unclearReason: result.unclearReason } : {}),
      parsedAt: result.parsedAt,
    };
  }
}

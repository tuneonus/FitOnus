import { z } from 'zod';
import { currentAiRequestContext } from '../../../shared/ai/ai-usage.js';
import { callPythonAi, pythonUsageSchema, requireGateUserId } from '../../../shared/ai/python-ai-call.js';
import type { AiUsageRecorder, PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { CoachInsightsService } from '../application/ports.js';
import {
  buildDeterministicInsights,
  buildWelcomeInsights,
  hasSufficientInsightsData,
} from '../domain/coach-insights.js';
import type { CoachInsightsResponse, UserFitnessContext } from '../domain/coach.types.js';

/** Token scope Python requires for this endpoint. */
export const COACH_INSIGHTS_SCOPE = 'ai:coach:insights';
export const COACH_INSIGHTS_PATH = '/internal/v1/ai/coach/insights';

/** The app gives up on insights after 25 s, so our HTTP timeout must stay below that. */
export const COACH_INSIGHTS_MAX_TIMEOUT_MS = 22_000;
/** Python's Gemini deadline is set this much below our HTTP timeout so Python can answer first. */
const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

/** Never shown to a user (every failure becomes deterministic insights); used for log context only. */
const UNAVAILABLE_MESSAGE = 'Coach insights are temporarily unavailable.';

/** Python's reply, validated before anything is trusted. Mirrors ai-backend/contracts/coach_insights.py. */
const pythonInsightsResponseSchema = z.object({
  outcome: z.enum(['ok', 'unusable']),
  result: z
    .object({
      greeting: z.string(),
      recommendation: z.string().nullish(),
      insights: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          category: z.enum(['workout', 'nutrition', 'hydration', 'goal', 'recovery']),
          priority: z.enum(['high', 'medium', 'low']),
          severity: z.enum(['positive', 'watch', 'info']),
          action: z.string(),
          question: z.string(),
          evidence: z.array(z.string()),
          confidence: z.enum(['high', 'medium', 'low']),
          requiresDevice: z.boolean(),
        }),
      ),
      generatedAt: z.string(),
      hasSufficientData: z.boolean(),
    })
    .nullish(),
  usage: pythonUsageSchema,
  traceId: z.string(),
});

export interface PythonCoachInsightsDeps {
  client: PythonAiClient;
  /** Primary/fallback Gemini model names for coach insights from the admin console. */
  resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  usageRecorder?: AiUsageRecorder;
  /** HTTP timeout for the call to Python (capped at {@link COACH_INSIGHTS_MAX_TIMEOUT_MS}). */
  pythonTimeoutMs: number;
  logger?: Pick<Logger, 'info' | 'error'>;
}

/**
 * Coach insights text generation, served by the Python AI backend: the ONLY AI path (no Node
 * Gemini). It implements the `CoachInsightsService` port, so `GetCoachInsightsUseCase` (kill switch,
 * 10-minute cache, in-flight de-duplication, the `coach_chat` quota gate, loading the user's data) is
 * unchanged.
 *
 * What stays in Node, exactly as before:
 *  - a user with no data gets a welcome answer without any AI call,
 *  - ANY failure of the AI path (Python down, timeout, Gemini error, unusable reply) is answered with
 *    deterministic, data-backed insights and HTTP 200. The error is logged, never shown. Because it is
 *    swallowed here, the quota gate sees a success: the unit stays consumed, as it always did.
 */
export class PythonCoachInsightsService implements CoachInsightsService {
  constructor(private readonly deps: PythonCoachInsightsDeps) {}

  async generateInsights(context: UserFitnessContext, lang?: string): Promise<CoachInsightsResponse> {
    if (!hasSufficientInsightsData(context)) return buildWelcomeInsights(context, lang);

    try {
      return await this.generateWithPython(context, lang);
    } catch {
      // callPythonAi has already logged the cause (kind, status, code) without any user data.
      return buildDeterministicInsights(context, lang);
    }
  }

  private async generateWithPython(context: UserFitnessContext, lang?: string): Promise<CoachInsightsResponse> {
    // Identity comes from the server-side request context set by the AI usage gate, never from input.
    const userId = requireGateUserId(currentAiRequestContext()?.userId);

    const models = await this.deps.resolveModels();
    const timeoutMs = Math.min(this.deps.pythonTimeoutMs, COACH_INSIGHTS_MAX_TIMEOUT_MS);
    const { outcome, result } = await callPythonAi({
      client: this.deps.client,
      path: COACH_INSIGHTS_PATH,
      scope: COACH_INSIGHTS_SCOPE,
      userId,
      requestId: `insights-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timeoutMs,
      body: {
        // The complete context Node loaded, unchanged (same payload coach chat receives).
        context,
        lang,
        model: { primary: models.primary, fallback: models.fallback },
        deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
      },
      schema: pythonInsightsResponseSchema,
      feature: 'coach_insights',
      usageRecorder: this.deps.usageRecorder,
      logger: this.deps.logger,
      label: 'Python coach insights',
      unavailableMessage: UNAVAILABLE_MESSAGE,
    });

    // The model answered but not with usable insights: Node's deterministic ones replace them.
    if (outcome !== 'ok' || !result || result.insights.length === 0) {
      return buildDeterministicInsights(context, lang);
    }
    return {
      greeting: result.greeting,
      recommendation: result.recommendation ?? null,
      insights: result.insights,
      generatedAt: result.generatedAt,
      hasSufficientData: result.hasSufficientData,
    };
  }
}

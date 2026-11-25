import { currentTraceContext } from '../logging/request-correlation.js';
import type { GeminiFeature } from './gemini-feature.js';
import type { PythonAiError } from './python-ai-client.js';

/**
 * Privacy-safe AI observability: the vocabulary (error categories, event names) and the typed builders
 * for every AI log event. Nothing here can carry user content, on purpose:
 *
 *  - every field is a number, a boolean or a value from a closed list (a feature, a category, an
 *    outcome) - never a free-text message, a prompt, a reply, a context, an image or an audio clip;
 *  - provider and Python error TEXT is never logged, only the category and Python's machine code;
 *  - there is no user id (the usage ledger already attributes tokens to users for support).
 *
 * The Python AI backend writes the same field names, so one filter works across both services.
 */

/**
 * Why an AI call failed, in the words an operator needs. The same names are used by the Python AI
 * backend (`onusfit_ai/shared/observability/observability.py`).
 */
export const AI_ERROR_CATEGORIES = [
  /** Gemini did not answer within the deadline. */
  'gemini_timeout',
  /** Gemini answered 429 (requests per minute). Retrying shortly may work. */
  'gemini_rate_limited',
  /** Gemini's daily quota is used up. Needs a human (billing / quota). */
  'gemini_quota_exhausted',
  /** Gemini is overloaded or down (503), or both configured models failed. */
  'gemini_unavailable',
  /** Gemini rejected our API key, or the key is missing in the Python service. */
  'gemini_auth',
  /** Any other Gemini failure. */
  'gemini_error',
  /** The Python service could not be reached or answered 502/503/504 (down, restarting, cold start). */
  'python_unavailable',
  /** The Python service did not answer before our HTTP deadline. */
  'python_timeout',
  /** The service-to-service token was rejected, or Python has no secret configured. */
  'auth_failure',
  /** Python's reply broke the contract, or the model's output could not be used. */
  'invalid_ai_response',
  /** Python rejected our request body (contract mismatch between the two services). */
  'invalid_request',
  /** Anything else, such as a bug in either service. */
  'internal_error',
] as const;
export type AiErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];

/**
 * Python outcomes that mean "the model answered but its output was not usable". `no_food` is NOT one
 * of them: "this photo has no food" is a valid answer. Must match `INVALID_OUTPUT_OUTCOMES` in
 * ai-backend/src/onusfit_ai/shared/observability/observability.py.
 */
export const INVALID_OUTPUT_OUTCOMES: ReadonlySet<string> = new Set([
  'unusable',
  'parse_failed',
  'unstructured',
]);

/** Server-side statuses that mean "the Python service itself is not there" rather than "it has a bug". */
const PYTHON_UNAVAILABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Maps a failed Python call to its category. Pure: looks at the error's kind, status and code only. */
export function classifyPythonAiError(error: PythonAiError): AiErrorCategory {
  switch (error.kind) {
    case 'provider_timeout':
      return 'gemini_timeout';
    case 'provider_rate_limited':
      return 'gemini_rate_limited';
    case 'provider_quota_exhausted':
      return 'gemini_quota_exhausted';
    case 'provider_unavailable':
      return 'gemini_unavailable';
    case 'provider_error':
      return 'gemini_error';
    case 'unreachable':
      return 'python_unavailable';
    case 'timeout':
      return 'python_timeout';
    case 'auth':
      return 'auth_failure';
    case 'misconfigured':
      // Python says which secret is missing or rejected: ours (service token) or Gemini's key.
      return error.info.code === 'AUTH_NOT_CONFIGURED' ? 'auth_failure' : 'gemini_auth';
    case 'invalid_request':
      return 'invalid_request';
    case 'invalid_response':
      return 'invalid_ai_response';
    case 'server_error':
      return error.info.status !== undefined && PYTHON_UNAVAILABLE_STATUSES.has(error.info.status)
        ? 'python_unavailable'
        : 'internal_error';
  }
}

// --- Carrying observability facts alongside objects we must not change -------------------------------
// The public error and the public insights response have fixed shapes. WeakMaps let us remember "why did
// this fail" and "where did this answer come from" without adding a field to either.

const categoryByError = new WeakMap<object, AiErrorCategory>();

/** Remembers the category of the public error thrown for a failed AI call. Returns the same error. */
export function tagAiErrorCategory<E extends object>(error: E, category: AiErrorCategory): E {
  categoryByError.set(error, category);
  return error;
}

/** The category recorded by `tagAiErrorCategory`, or `internal_error` for an error we did not classify. */
export function aiErrorCategoryOf(error: unknown): AiErrorCategory {
  return (
    (typeof error === 'object' && error !== null ? categoryByError.get(error) : undefined) ?? 'internal_error'
  );
}

/** Where an answer came from. `welcome` is the no-data greeting (no AI call at all). */
export type AiResponseSource = 'ai' | 'deterministic_fallback' | 'welcome';

const sourceByResponse = new WeakMap<object, AiResponseSource>();

/** Labels an answer with its origin so a later cache hit can say what it served. Returns the same object. */
export function tagResponseSource<T extends object>(response: T, source: AiResponseSource): T {
  sourceByResponse.set(response, source);
  return response;
}

export const responseSourceOf = (response: object): AiResponseSource | 'unknown' =>
  sourceByResponse.get(response) ?? 'unknown';

// --- Event builders -----------------------------------------------------------------------------------

/**
 * Strings that come from the Python service's JSON (a model name, an outcome, an error code) are logged
 * only if they look like an identifier. Python is trusted and internal, but "metadata only" is made true
 * by construction: anything else (free text, a long value) is replaced, never printed.
 */
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
export const safeLabel = (value: string): string => (SAFE_LABEL.test(value) ? value : 'invalid');

export const AI_EVENTS = {
  callCompleted: 'ai.call.completed',
  callFailed: 'ai.call.failed',
  cache: 'ai.cache',
  deterministicFallback: 'ai.deterministic_fallback',
  ragRetrieval: 'ai.rag.retrieval',
  ragGrounding: 'ai.rag.grounding',
  agentExecution: 'ai.agent.execution',
  multimodalProcessing: 'ai.multimodal.processing',
  monitoringAlert: 'ai.monitoring.alert',
} as const;

/** Active distributed trace IDs from AsyncLocalStorage, if bound. */
export function traceMetadataFields(): {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
} {
  const ctx = currentTraceContext();
  if (!ctx) return {};
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    ...(ctx.parentSpanId ? { parentSpanId: ctx.parentSpanId } : {}),
  };
}

/** The ids that join a log line to everything else about the same request. */
export interface AiCorrelation {
  /** The HTTP request id (pino-http `req.id`, the `X-Request-Id` the app received). Absent outside HTTP. */
  correlationId?: string | undefined;
  /** The id of this one AI call: usage ledger `request_id`, the Python service's `aiRequestId`. */
  aiRequestId: string;
}

const correlationFields = (ids: AiCorrelation) => ({
  ...(ids.correlationId ? { correlationId: ids.correlationId } : {}),
  aiRequestId: ids.aiRequestId,
});

export interface PythonUsageForLog {
  model: string;
  isFallback: boolean;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  durationMs: number;
}

/** A Python call that returned a valid reply. `success` is false when the model's output was unusable. */
export function aiCallCompletedFields(input: {
  ids: AiCorrelation;
  feature: GeminiFeature;
  /** The internal Python route (a constant such as `/internal/v1/ai/speech/transcribe`, never user input). */
  endpoint: string;
  outcome: string;
  usage: PythonUsageForLog;
  /** Round trip as Node saw it (signing + network + Python + Gemini). */
  durationMs: number;
}) {
  const unusable = INVALID_OUTPUT_OUTCOMES.has(input.outcome);
  return {
    event: AI_EVENTS.callCompleted,
    feature: input.feature,
    endpoint: input.endpoint,
    ...correlationFields(input.ids),
    success: !unusable,
    outcome: safeLabel(input.outcome),
    errorCategory: unusable ? ('invalid_ai_response' as const) : null,
    model: safeLabel(input.usage.model),
    modelFallbackUsed: input.usage.isFallback,
    durationMs: input.durationMs,
    geminiDurationMs: input.usage.durationMs,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cachedTokens: input.usage.cachedTokens,
    thinkingTokens: input.usage.thinkingTokens,
    totalTokens: input.usage.totalTokens,
  };
}

/** A Python call that failed. Carries codes and categories, never the error's text. */
export function aiCallFailedFields(input: {
  ids: AiCorrelation;
  feature: GeminiFeature;
  endpoint: string;
  error: PythonAiError;
  durationMs: number;
}) {
  const { error } = input;
  return {
    event: AI_EVENTS.callFailed,
    feature: input.feature,
    endpoint: input.endpoint,
    ...correlationFields(input.ids),
    success: false,
    errorCategory: classifyPythonAiError(error),
    errorKind: error.kind,
    ...(error.info.code ? { errorCode: safeLabel(error.info.code) } : {}),
    ...(error.info.status !== undefined ? { httpStatus: error.info.status } : {}),
    ...(error.info.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: error.info.retryAfterSeconds }
      : {}),
    /** True when Gemini may have been called: the quota unit stays consumed (see callPythonAi). */
    dispatched: error.dispatched,
    durationMs: input.durationMs,
  };
}

export type InsightsCacheResult = 'hit' | 'joined_inflight' | 'miss' | 'stored';

/** A coach-insights cache decision. `servedFrom` says what the cache entry holds (AI answer or fallback). */
export function insightsCacheFields(input: {
  correlationId?: string | undefined;
  cache: InsightsCacheResult;
  /** Why a miss happened, or the entry's age on a hit. */
  reason?: 'absent' | 'expired' | 'force_refresh';
  servedFrom?: AiResponseSource | 'unknown';
  cacheAgeMs?: number;
}) {
  return {
    event: AI_EVENTS.cache,
    feature: 'coach_insights' as const,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    cache: input.cache,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.servedFrom ? { servedFrom: input.servedFrom } : {}),
    ...(input.cacheAgeMs !== undefined ? { cacheAgeMs: input.cacheAgeMs } : {}),
  };
}

export type DeterministicFallbackReason = 'insufficient_data' | 'ai_call_failed' | 'unusable_ai_output';

/** Insights were answered by Node's own deterministic builder instead of by a model answer. */
export function deterministicFallbackFields(input: {
  correlationId?: string | undefined;
  aiRequestId?: string | undefined;
  reason: DeterministicFallbackReason;
  errorCategory?: AiErrorCategory;
}) {
  return {
    event: AI_EVENTS.deterministicFallback,
    feature: 'coach_insights' as const,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.aiRequestId ? { aiRequestId: input.aiRequestId } : {}),
    reason: input.reason,
    /** False for `insufficient_data`: no Python call was made. */
    aiCalled: input.reason !== 'insufficient_data',
    ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
  };
}

/** Metadata-only RAG retrieval log fields (never includes query text or chunk contents). */
export function ragRetrievalFields(input: {
  correlationId?: string | undefined;
  mode: 'vector' | 'lexical' | 'hybrid' | 'reranked';
  durationMs: number;
  candidateCount: number;
  returnedCount: number;
  topScore?: number | undefined;
  avgScore?: number | undefined;
  reranked?: boolean | undefined;
  grounded?: boolean | undefined;
  citationsCount?: number | undefined;
  success: boolean;
  errorCategory?: AiErrorCategory | undefined;
}) {
  const emptyResult = input.success && input.returnedCount === 0;
  return {
    event: AI_EVENTS.ragRetrieval,
    feature: 'rag' as const,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...traceMetadataFields(),
    mode: input.mode,
    durationMs: Math.round(Math.max(0, input.durationMs) * 100) / 100,
    candidateCount: Math.max(0, input.candidateCount),
    returnedCount: Math.max(0, input.returnedCount),
    emptyResult,
    reranked: Boolean(input.reranked),
    grounded: Boolean(input.grounded ?? input.returnedCount > 0),
    citationsCount: Math.max(0, input.citationsCount ?? 0),
    success: input.success,
    ...(input.topScore !== undefined ? { topScore: Math.round(input.topScore * 10_000) / 10_000 } : {}),
    ...(input.avgScore !== undefined ? { avgScore: Math.round(input.avgScore * 10_000) / 10_000 } : {}),
    ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
  };
}

/** Metadata-only RAG context grounding and token-budget log fields. */
export function ragGroundingFields(input: {
  correlationId?: string | undefined;
  inputChunks: number;
  keptChunks: number;
  citationsCount: number;
  totalTokens: number;
}) {
  return {
    event: AI_EVENTS.ragGrounding,
    feature: 'rag' as const,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...traceMetadataFields(),
    inputChunks: Math.max(0, input.inputChunks),
    keptChunks: Math.max(0, input.keptChunks),
    droppedChunks: Math.max(0, input.inputChunks - input.keptChunks),
    citationsCount: Math.max(0, input.citationsCount),
    grounded: input.keptChunks > 0,
    totalTokens: Math.max(0, input.totalTokens),
  };
}

/** Metadata-only agent orchestration log fields. */
export function agentExecutionFields(input: {
  correlationId?: string | undefined;
  aiRequestId: string;
  engine: 'native' | 'langgraph' | 'multi_agent' | 'workout_planner';
  routingDecision: string;
  durationMs: number;
  toolCallsCount: number;
  toolFailuresCount: number;
  iterations: number;
  replans: number;
  limitHit?: string | undefined;
  fallbackUsed: boolean;
  success: boolean;
  errorCategory?: AiErrorCategory | undefined;
}) {
  return {
    event: AI_EVENTS.agentExecution,
    feature: 'coach_agent' as const,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...traceMetadataFields(),
    aiRequestId: input.aiRequestId,
    engine: input.engine,
    routingDecision: safeLabel(input.routingDecision),
    durationMs: Math.round(Math.max(0, input.durationMs) * 100) / 100,
    toolCallsCount: Math.max(0, input.toolCallsCount),
    toolFailuresCount: Math.max(0, input.toolFailuresCount),
    iterations: Math.max(0, input.iterations),
    replans: Math.max(0, input.replans),
    ...(input.limitHit ? { limitHit: safeLabel(input.limitHit) } : {}),
    fallbackUsed: input.fallbackUsed,
    success: input.success,
    ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
  };
}

/** Metadata-only multimodal processing log fields (never includes raw bytes or transcripts). */
export function multimodalProcessingFields(input: {
  correlationId?: string | undefined;
  aiRequestId: string;
  modality: 'image' | 'audio' | 'multimodal';
  feature: GeminiFeature | 'transcribe';
  model?: string | undefined;
  durationMs: number;
  validationDurationMs?: number | undefined;
  validationFailed: boolean;
  validationReason?: string | undefined;
  byteSize: number;
  success: boolean;
  errorCategory?: AiErrorCategory | undefined;
}) {
  return {
    event: AI_EVENTS.multimodalProcessing,
    feature: input.feature,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...traceMetadataFields(),
    aiRequestId: input.aiRequestId,
    modality: input.modality,
    ...(input.model ? { model: safeLabel(input.model) } : {}),
    durationMs: Math.round(Math.max(0, input.durationMs) * 100) / 100,
    ...(input.validationDurationMs !== undefined
      ? { validationDurationMs: Math.round(Math.max(0, input.validationDurationMs) * 100) / 100 }
      : {}),
    validationFailed: input.validationFailed,
    ...(input.validationReason ? { validationReason: safeLabel(input.validationReason) } : {}),
    byteSize: Math.max(0, input.byteSize),
    success: input.success,
    ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
  };
}

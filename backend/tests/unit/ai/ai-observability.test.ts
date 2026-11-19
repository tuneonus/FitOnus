import { describe, expect, it } from 'vitest';
import {
  AI_ERROR_CATEGORIES,
  AI_EVENTS,
  INVALID_OUTPUT_OUTCOMES,
  aiCallCompletedFields,
  aiCallFailedFields,
  aiErrorCategoryOf,
  classifyPythonAiError,
  deterministicFallbackFields,
  insightsCacheFields,
  responseSourceOf,
  safeLabel,
  tagAiErrorCategory,
  tagResponseSource,
  type AiErrorCategory,
} from '../../../src/shared/ai/ai-observability.js';
import { PythonAiError, type PythonAiErrorKind } from '../../../src/shared/ai/python-ai-client.js';

const error = (
  kind: PythonAiErrorKind,
  info: { status?: number; code?: string; retryAfterSeconds?: number } = {},
) => new PythonAiError(kind, 'provider said something', { dispatched: true, ...info });

const USAGE = {
  model: 'gemini-3.5-flash-lite',
  isFallback: false,
  inputTokens: 900,
  outputTokens: 120,
  cachedTokens: 10,
  thinkingTokens: 30,
  totalTokens: 1050,
  durationMs: 1234,
};
const ENDPOINT = '/internal/v1/ai/coach/chat';
const IDS = { correlationId: 'req-1234-abcd', aiRequestId: 'chat-abc-123' };

describe('classifyPythonAiError: the six categories operators asked for', () => {
  it('Gemini timeout', () => {
    expect(classifyPythonAiError(error('provider_timeout', { status: 504, code: 'PROVIDER_TIMEOUT' }))).toBe(
      'gemini_timeout',
    );
  });

  it('Gemini rate limit (per-minute and daily quota are told apart)', () => {
    expect(classifyPythonAiError(error('provider_rate_limited', { status: 429 }))).toBe(
      'gemini_rate_limited',
    );
    expect(classifyPythonAiError(error('provider_quota_exhausted', { status: 429 }))).toBe(
      'gemini_quota_exhausted',
    );
  });

  it('Gemini service unavailable', () => {
    expect(
      classifyPythonAiError(error('provider_unavailable', { status: 503, code: 'AI_UNAVAILABLE' })),
    ).toBe('gemini_unavailable');
    expect(
      classifyPythonAiError(error('provider_unavailable', { status: 503, code: 'PROVIDER_UNAVAILABLE' })),
    ).toBe('gemini_unavailable');
  });

  it('Python service unavailable: unreachable, a proxy 502/503/504 while it restarts, or our own deadline', () => {
    expect(classifyPythonAiError(error('unreachable'))).toBe('python_unavailable');
    for (const status of [502, 503, 504]) {
      expect(classifyPythonAiError(error('server_error', { status }))).toBe('python_unavailable');
    }
    expect(classifyPythonAiError(error('timeout'))).toBe('python_timeout');
  });

  it('invalid AI response (reply broke the contract)', () => {
    expect(classifyPythonAiError(error('invalid_response'))).toBe('invalid_ai_response');
  });

  it('authentication failure: our service token rejected, or no secret configured in Python', () => {
    expect(classifyPythonAiError(error('auth', { status: 401, code: 'AUTH_INVALID_TOKEN' }))).toBe(
      'auth_failure',
    );
    expect(classifyPythonAiError(error('misconfigured', { status: 503, code: 'AUTH_NOT_CONFIGURED' }))).toBe(
      'auth_failure',
    );
  });
});

describe('classifyPythonAiError: everything else', () => {
  it.each<[PythonAiErrorKind, { status?: number; code?: string }, AiErrorCategory]>([
    ['provider_error', { status: 503, code: 'PROVIDER_ERROR' }, 'gemini_error'],
    // Gemini's own key rejected / missing in Python is NOT a service-token problem.
    ['misconfigured', { status: 503, code: 'PROVIDER_AUTH_ERROR' }, 'gemini_auth'],
    ['misconfigured', { status: 503, code: 'PROVIDER_NOT_CONFIGURED' }, 'gemini_auth'],
    ['invalid_request', { status: 422, code: 'INVALID_REQUEST' }, 'invalid_request'],
    // A 500 from Python is a bug, not "the service is away".
    ['server_error', { status: 500 }, 'internal_error'],
    ['server_error', {}, 'internal_error'],
  ])('%s %j -> %s', (kind, info, expected) => {
    expect(classifyPythonAiError(error(kind, info))).toBe(expected);
  });

  it('only ever returns a documented category', () => {
    const kinds: PythonAiErrorKind[] = [
      'unreachable',
      'timeout',
      'auth',
      'misconfigured',
      'invalid_request',
      'invalid_response',
      'server_error',
      'provider_rate_limited',
      'provider_quota_exhausted',
      'provider_unavailable',
      'provider_timeout',
      'provider_error',
    ];
    for (const kind of kinds) expect(AI_ERROR_CATEGORIES).toContain(classifyPythonAiError(error(kind)));
  });
});

describe('ai.call.completed', () => {
  it('has exactly the documented metadata (so nothing else can slip in)', () => {
    expect(
      aiCallCompletedFields({
        ids: IDS,
        feature: 'coach_chat',
        endpoint: ENDPOINT,
        outcome: 'ok',
        usage: USAGE,
        durationMs: 1500,
      }),
    ).toEqual({
      event: AI_EVENTS.callCompleted,
      feature: 'coach_chat',
      endpoint: ENDPOINT,
      correlationId: 'req-1234-abcd',
      aiRequestId: 'chat-abc-123',
      success: true,
      outcome: 'ok',
      errorCategory: null,
      model: 'gemini-3.5-flash-lite',
      modelFallbackUsed: false,
      durationMs: 1500,
      geminiDurationMs: 1234,
      inputTokens: 900,
      outputTokens: 120,
      cachedTokens: 10,
      thinkingTokens: 30,
      totalTokens: 1050,
    });
  });

  it('reports the backup model and omits the correlation id outside an HTTP request', () => {
    const fields = aiCallCompletedFields({
      ids: { correlationId: undefined, aiRequestId: 'chat-x' },
      feature: 'voice_meal',
      endpoint: ENDPOINT,
      outcome: 'ok',
      usage: { ...USAGE, model: 'backup-model', isFallback: true },
      durationMs: 10,
    });
    expect(fields).toMatchObject({ model: 'backup-model', modelFallbackUsed: true });
    expect(fields).not.toHaveProperty('correlationId');
  });

  it.each([...INVALID_OUTPUT_OUTCOMES])(
    'outcome "%s" (unusable model output) is success:false / invalid_ai_response',
    (outcome) => {
      expect(
        aiCallCompletedFields({
          ids: IDS,
          feature: 'coach_insights',
          endpoint: ENDPOINT,
          outcome,
          usage: USAGE,
          durationMs: 1,
        }),
      ).toMatchObject({
        success: false,
        errorCategory: 'invalid_ai_response',
        outcome,
      });
    },
  );

  it('"no_food" is a valid answer, not a failure', () => {
    expect(
      aiCallCompletedFields({
        ids: IDS,
        feature: 'meal_photo',
        endpoint: ENDPOINT,
        outcome: 'no_food',
        usage: USAGE,
        durationMs: 1,
      }),
    ).toMatchObject({
      success: true,
      errorCategory: null,
    });
  });
});

describe('ai.call.failed', () => {
  it('carries category, kind, code, status and whether Gemini may have been called, never the message', () => {
    const fields = aiCallFailedFields({
      ids: IDS,
      feature: 'meal_photo',
      endpoint: ENDPOINT,
      error: new PythonAiError('provider_rate_limited', 'Resource exhausted for key AIzaSyFAKE-user-text', {
        dispatched: true,
        status: 429,
        code: 'PROVIDER_RATE_LIMITED',
        retryAfterSeconds: 25,
      }),
      durationMs: 800,
    });
    expect(fields).toEqual({
      event: AI_EVENTS.callFailed,
      feature: 'meal_photo',
      endpoint: ENDPOINT,
      correlationId: 'req-1234-abcd',
      aiRequestId: 'chat-abc-123',
      success: false,
      errorCategory: 'gemini_rate_limited',
      errorKind: 'provider_rate_limited',
      errorCode: 'PROVIDER_RATE_LIMITED',
      httpStatus: 429,
      retryAfterSeconds: 25,
      dispatched: true,
      durationMs: 800,
    });
    expect(JSON.stringify(fields)).not.toContain('AIza');
  });

  it('a request that never left Node is marked dispatched:false (the quota unit is refunded)', () => {
    const fields = aiCallFailedFields({
      ids: IDS,
      feature: 'coach_chat',
      endpoint: ENDPOINT,
      error: new PythonAiError('unreachable', 'AI backend is unreachable.', { dispatched: false }),
      durationMs: 5,
    });
    expect(fields).toMatchObject({ dispatched: false, errorCategory: 'python_unavailable' });
    expect(fields).not.toHaveProperty('httpStatus');
  });
});

describe('coach insights cache and fallback events', () => {
  it('a cache hit says what the cached answer is, so a cached fallback is distinguishable from a cached AI answer', () => {
    const base = { correlationId: 'req-1234-abcd', cache: 'hit' as const, cacheAgeMs: 4_000 };
    expect(insightsCacheFields({ ...base, servedFrom: 'ai' })).toEqual({
      event: AI_EVENTS.cache,
      feature: 'coach_insights',
      correlationId: 'req-1234-abcd',
      cache: 'hit',
      servedFrom: 'ai',
      cacheAgeMs: 4_000,
    });
    expect(insightsCacheFields({ ...base, servedFrom: 'deterministic_fallback' })).toMatchObject({
      cache: 'hit',
      servedFrom: 'deterministic_fallback',
    });
  });

  it('a deterministic fallback is its own event, with the reason and whether an AI call was made', () => {
    expect(
      deterministicFallbackFields({
        correlationId: 'req-1234-abcd',
        aiRequestId: 'insights-abc',
        reason: 'ai_call_failed',
        errorCategory: 'python_unavailable',
      }),
    ).toEqual({
      event: AI_EVENTS.deterministicFallback,
      feature: 'coach_insights',
      correlationId: 'req-1234-abcd',
      aiRequestId: 'insights-abc',
      reason: 'ai_call_failed',
      aiCalled: true,
      errorCategory: 'python_unavailable',
    });
    expect(deterministicFallbackFields({ reason: 'insufficient_data' })).toMatchObject({ aiCalled: false });
  });

  it('cache and fallback events have different names', () => {
    expect(AI_EVENTS.cache).not.toBe(AI_EVENTS.deterministicFallback);
  });
});

describe('out-of-band tags (public shapes stay untouched)', () => {
  it('remembers the category of an error without adding a property to it', () => {
    const publicError = new Error('x');
    expect(aiErrorCategoryOf(publicError)).toBe('internal_error');
    expect(tagAiErrorCategory(publicError, 'gemini_timeout')).toBe(publicError);
    expect(aiErrorCategoryOf(publicError)).toBe('gemini_timeout');
    expect(Object.keys(publicError)).toEqual([]);
    expect(aiErrorCategoryOf('not an object')).toBe('internal_error');
  });

  it('remembers where an answer came from without changing its serialization', () => {
    const response = { greeting: 'Hi', insights: [] };
    expect(responseSourceOf(response)).toBe('unknown');
    tagResponseSource(response, 'deterministic_fallback');
    expect(responseSourceOf(response)).toBe('deterministic_fallback');
    expect(JSON.stringify(response)).toBe('{"greeting":"Hi","insights":[]}');
  });
});

describe('values that come from the Python reply are logged only if they look like identifiers', () => {
  const hostile = 'my knee hurts after surgery, sk-ABCDEF Bearer abc.def';

  it('safeLabel keeps model names, outcomes and error codes, and replaces anything else', () => {
    for (const ok of [
      'gemini-3.5-flash-lite',
      'ok',
      'PROVIDER_RATE_LIMITED',
      'parse_failed',
      'gemini-3.1-flash-lite',
    ]) {
      expect(safeLabel(ok)).toBe(ok);
    }
    for (const bad of [hostile, '', ' leading', 'a'.repeat(65), 'line\nbreak', '{"a":1}']) {
      expect(safeLabel(bad)).toBe('invalid');
    }
  });

  it('a hostile model, outcome or error code never reaches an event', () => {
    const completed = aiCallCompletedFields({
      ids: IDS,
      feature: 'coach_chat',
      endpoint: ENDPOINT,
      outcome: hostile,
      usage: { ...USAGE, model: hostile },
      durationMs: 1,
    });
    const failed = aiCallFailedFields({
      ids: IDS,
      feature: 'coach_chat',
      endpoint: ENDPOINT,
      error: new PythonAiError('provider_error', 'x', { dispatched: true, code: hostile, status: 503 }),
      durationMs: 1,
    });
    expect(completed).toMatchObject({ outcome: 'invalid', model: 'invalid' });
    expect(failed).toMatchObject({ errorCode: 'invalid' });
    expect(JSON.stringify([completed, failed])).not.toMatch(/knee|Bearer|sk-ABC/);
  });
});

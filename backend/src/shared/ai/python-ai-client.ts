import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { AppError } from '../errors/app-error.js';
import type { GeminiFeature } from './gemini-feature.js';

/**
 * HTTP client for the internal Python AI backend (`ai-backend/`).
 *
 * Responsibilities, and nothing more:
 *  - sign a short-lived service token for every call (the user id travels ONLY inside the token),
 *  - enforce a hard timeout,
 *  - turn every failure into a `PythonAiError` that says (a) what happened and (b) whether the
 *    request may already have reached Gemini (`dispatched`), which decides quota refund and
 *    whether falling back to the Node Gemini implementation is safe.
 *
 * It knows nothing about coaching; feature adapters (e.g. `PythonCoachChatService`) build the
 * request body and interpret the response.
 */

export const PYTHON_AI_TOKEN_ISSUER = 'onusfit-node-api';
export const PYTHON_AI_TOKEN_AUDIENCE = 'onusfit-ai-backend';
const TOKEN_TTL = '30s';

export type PythonAiErrorKind =
  /** Could not connect (Python down, DNS, refused). Nothing was sent. */
  | 'unreachable'
  /** Our HTTP deadline passed. Python may still be calling Gemini. */
  | 'timeout'
  /** Python rejected our service token. */
  | 'auth'
  /** Python is missing its secret / Gemini key / Gemini key rejected. */
  | 'misconfigured'
  /** Python rejected the request body (contract mismatch). */
  | 'invalid_request'
  /** Python answered 2xx but the body did not match the contract. */
  | 'invalid_response'
  /** Any other 5xx / unexpected status. */
  | 'server_error'
  /** Gemini failures that Python already handled (it tried its own fallback model). */
  | 'provider_rate_limited'
  | 'provider_quota_exhausted'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_error';

/** Failures where Python itself is the problem, so the Node implementation can safely answer instead. */
const FALLBACK_ELIGIBLE: ReadonlySet<PythonAiErrorKind> = new Set([
  'unreachable',
  'timeout',
  'auth',
  'misconfigured',
  'invalid_request',
  'invalid_response',
  'server_error',
]);

export class PythonAiError extends Error {
  override readonly name = 'PythonAiError';

  constructor(
    readonly kind: PythonAiErrorKind,
    message: string,
    readonly info: {
      /** True when Gemini may already have been called (so quota must not be refunded). */
      dispatched: boolean;
      status?: number;
      /** Python's machine-readable error code, e.g. `PROVIDER_RATE_LIMITED`. */
      code?: string;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
  }

  get dispatched(): boolean {
    return this.info.dispatched;
  }

  get fallbackEligible(): boolean {
    return FALLBACK_ELIGIBLE.has(this.kind);
  }
}

export interface PythonAiClientConfig {
  baseUrl: string;
  /** Shared HS256 secret, >= 32 characters. Never logged, never sent to mobile. */
  serviceSecret: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface PythonAiRequest {
  /** Endpoint path, e.g. `/internal/v1/ai/coach/chat`. */
  path: string;
  /** Token scope; Python rejects a token whose scope differs from the endpoint's. */
  scope: string;
  /** The authenticated user, taken from the server-side request context. Goes into `sub` only. */
  userId: string;
  requestId: string;
  body: unknown;
  timeoutMs: number;
}

/** Records tokens/cost of a Python-served call in the existing `gemini_usage_events` ledger. */
export interface AiUsageRecorder {
  recordExternalUsage(event: {
    requestId: string;
    userId: string | null;
    feature: GeminiFeature;
    model: string;
    isFallback: boolean;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    durationMs: number;
  }): Promise<void>;
}

/** Errors that mean "the TCP connection was never established", so no request reached Python. */
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);

function errorCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

const SAFE_MESSAGE_MAX = 300;

/** Maps a non-2xx Python response (our own JSON error shape) to a typed error. */
function errorFromResponse(status: number, payload: unknown): PythonAiError {
  const error =
    typeof payload === 'object' && payload !== null && 'error' in payload
      ? ((payload as { error: Record<string, unknown> | null }).error)
      : null;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  const message =
    typeof error?.message === 'string' ? error.message.slice(0, SAFE_MESSAGE_MAX) : `AI backend returned HTTP ${status}`;
  const retryAfterSeconds = typeof error?.retryAfterSeconds === 'number' ? error.retryAfterSeconds : undefined;
  // If Python did not say, assume Gemini may have been called: the safe choice for billing.
  const dispatched = typeof error?.dispatched === 'boolean' ? error.dispatched : status >= 500;
  const info = {
    dispatched,
    status,
    ...(code ? { code } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };

  switch (code) {
    case 'AUTH_INVALID_TOKEN':
      return new PythonAiError('auth', message, info);
    case 'AUTH_NOT_CONFIGURED':
    case 'PROVIDER_NOT_CONFIGURED':
    case 'PROVIDER_AUTH_ERROR':
      return new PythonAiError('misconfigured', message, info);
    case 'INVALID_REQUEST':
      return new PythonAiError('invalid_request', message, info);
    case 'PROVIDER_RATE_LIMITED':
      return new PythonAiError('provider_rate_limited', message, info);
    case 'PROVIDER_QUOTA_EXHAUSTED':
      return new PythonAiError('provider_quota_exhausted', message, info);
    case 'PROVIDER_UNAVAILABLE':
    case 'AI_UNAVAILABLE':
      return new PythonAiError('provider_unavailable', message, info);
    case 'PROVIDER_TIMEOUT':
      return new PythonAiError('provider_timeout', message, info);
    case 'PROVIDER_ERROR':
      return new PythonAiError('provider_error', message, info);
    default:
      if (status === 401 || status === 403) return new PythonAiError('auth', message, info);
      if (status === 422 || status === 413) return new PythonAiError('invalid_request', message, info);
      return new PythonAiError('server_error', message, info);
  }
}

export class PythonAiClient {
  private readonly baseUrl: string;
  private readonly secretKey: Uint8Array;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PythonAiClientConfig) {
    if (config.serviceSecret.length < 32) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'AI backend service secret must be at least 32 characters.');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.secretKey = new TextEncoder().encode(config.serviceSecret);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** Sends one signed JSON request. Resolves with the parsed 2xx JSON body; throws `PythonAiError` otherwise. */
  async postJson(request: PythonAiRequest): Promise<unknown> {
    const token = await new SignJWT({ scope: request.scope, rid: request.requestId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(PYTHON_AI_TOKEN_ISSUER)
      .setAudience(PYTHON_AI_TOKEN_AUDIENCE)
      .setSubject(request.userId)
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .setJti(randomUUID())
      .sign(this.secretKey);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${request.path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'x-request-id': request.requestId,
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new PythonAiError('timeout', 'AI backend request timed out.', { dispatched: true });
      }
      const code = errorCode(error);
      throw new PythonAiError('unreachable', 'AI backend is unreachable.', {
        dispatched: !(code && NOT_SENT_CODES.has(code)),
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isTimeout(error)) throw new PythonAiError('timeout', 'AI backend request timed out.', { dispatched: true });
      payload = undefined;
    }

    if (!response.ok) throw errorFromResponse(response.status, payload);
    if (payload === undefined) {
      throw new PythonAiError('invalid_response', 'AI backend returned a non-JSON body.', {
        dispatched: true,
        status: response.status,
      });
    }
    return payload;
  }
}

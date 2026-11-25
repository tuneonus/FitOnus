import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { markAiRequestDispatched } from './ai-usage.js';
import {
  PYTHON_AI_TOKEN_AUDIENCE,
  PYTHON_AI_TOKEN_ISSUER,
  PythonAiError,
  type PythonAiClientConfig,
  type PythonAiErrorKind,
} from './python-ai-client.js';
import {
  currentCorrelationId,
  currentTraceContext,
  formatTraceparent,
  isSafeCorrelationId,
} from '../logging/request-correlation.js';

const TOKEN_TTL = '60s';
const MAX_SSE_BUFFER_BYTES = 512 * 1024;
const SAFE_MESSAGE_MAX = 300;
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);

function errorCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

export interface RawSseFrame {
  readonly event: string;
  readonly data: string;
  readonly id?: string | undefined;
}

export interface StreamPythonAiInput {
  readonly path: string;
  readonly scope: string;
  readonly subject: string;
  readonly requestId?: string | undefined;
  readonly body: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly onFrame: (frame: RawSseFrame) => Promise<void> | void;
  readonly onDispatched?: () => void;
}

function classifyPreStreamError(
  status: number,
  code: string | undefined,
  explicitDispatched: boolean | undefined,
): { kind: PythonAiErrorKind; dispatched: boolean } {
  switch (code) {
    case 'AUTH_INVALID_TOKEN':
      return { kind: 'auth', dispatched: false };
    case 'AUTH_NOT_CONFIGURED':
    case 'PROVIDER_NOT_CONFIGURED':
    case 'PROVIDER_AUTH_ERROR':
      return { kind: 'misconfigured', dispatched: false };
    case 'FEATURE_DISABLED':
    case 'INVALID_REQUEST':
      return { kind: 'invalid_request', dispatched: false };
    case 'PROVIDER_RATE_LIMITED':
      return { kind: 'provider_rate_limited', dispatched: explicitDispatched ?? false };
    case 'PROVIDER_QUOTA_EXHAUSTED':
      return { kind: 'provider_quota_exhausted', dispatched: explicitDispatched ?? false };
    case 'PROVIDER_UNAVAILABLE':
    case 'AI_UNAVAILABLE':
      return { kind: 'provider_unavailable', dispatched: explicitDispatched ?? true };
    case 'PROVIDER_TIMEOUT':
    case 'DEADLINE_EXCEEDED':
      return { kind: 'provider_timeout', dispatched: explicitDispatched ?? true };
    case 'PROVIDER_ERROR':
      return { kind: 'provider_error', dispatched: explicitDispatched ?? true };
    default:
      if (status === 401 || status === 403) return { kind: 'auth', dispatched: false };
      if (status === 400 || status === 422 || status === 413) {
        return { kind: 'invalid_request', dispatched: false };
      }
      if (status === 429) return { kind: 'provider_rate_limited', dispatched: explicitDispatched ?? false };
      if (status === 504) return { kind: 'timeout', dispatched: explicitDispatched ?? true };
      return { kind: 'server_error', dispatched: explicitDispatched ?? status >= 500 };
  }
}

function parseSseChunkText(chunkText: string): RawSseFrame | null {
  const lines = chunkText.split('\n');
  let eventName = 'message';
  let frameId: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value || 'message';
    else if (field === 'id') frameId = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0 && eventName === 'message') {
    return null;
  }
  return {
    event: eventName,
    data: dataLines.join('\n'),
    ...(frameId !== undefined ? { id: frameId } : {}),
  };
}

/**
 * Opens an authenticated SSE stream from the internal Python AI backend.
 * Signs short-lived HS256 service JWTs (`jose`), propagates correlation & W3C traceparent
 * headers, enforces timeouts & client disconnect aborts, and applies backpressure across
 * sequential frame handling.
 */
export async function streamPythonAi(
  config: PythonAiClientConfig,
  input: StreamPythonAiInput,
): Promise<void> {
  if (config.serviceSecret.length < 32) {
    throw new PythonAiError('misconfigured', 'AI backend service secret must be at least 32 characters.', {
      dispatched: false,
    });
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}${input.path.startsWith('/') ? '' : '/'}${input.path}`;
  const correlation = currentCorrelationId();
  const trace = currentTraceContext();
  const requestId = input.requestId ?? correlation ?? randomUUID();

  const token = await new SignJWT({ scope: input.scope, rid: requestId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(PYTHON_AI_TOKEN_ISSUER)
    .setAudience(PYTHON_AI_TOKEN_AUDIENCE)
    .setSubject(input.subject)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(config.serviceSecret));

  const headers: Record<string, string> = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-request-id': requestId,
    ...(correlation && isSafeCorrelationId(correlation) ? { 'x-correlation-id': correlation } : {}),
    ...(trace ? { traceparent: formatTraceparent(trace) } : {}),
    ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
  };

  if (input.signal?.aborted) {
    throw new PythonAiError('timeout', 'AI backend request was cancelled.', { dispatched: false });
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('AI_STREAM_TIMEOUT'));
  }, Math.max(500, input.timeoutMs));

  const onParentAbort = (): void => {
    controller.abort(input.signal?.reason ?? new Error('CLIENT_DISCONNECTED'));
  };
  if (input.signal) {
    input.signal.addEventListener('abort', onParentAbort, { once: true });
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(input.body),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) {
        throw new PythonAiError('timeout', 'AI request timed out. Please try again.', {
          dispatched: true,
        });
      }
      if (input.signal?.aborted) {
        throw new PythonAiError('timeout', 'AI backend stream was cancelled.', {
          dispatched: false,
        });
      }
      const sysCode = errorCode(err);
      if (sysCode && NOT_SENT_CODES.has(sysCode)) {
        throw new PythonAiError('unreachable', 'The AI Coach is temporarily unavailable.', {
          dispatched: false,
          code: sysCode,
        });
      }
      throw new PythonAiError('server_error', 'The AI Coach is temporarily unavailable.', {
        dispatched: false,
      });
    }

    if (!response.ok) {
      let code: string | undefined;
      let message = `AI backend returned HTTP ${response.status}`;
      let explicitDispatched: boolean | undefined;
      let retryAfterSeconds: number | undefined;
      let usage: unknown;
      try {
        const parsed = (await response.json()) as {
          error?: {
            code?: unknown;
            message?: unknown;
            dispatched?: unknown;
            retryAfterSeconds?: unknown;
            usage?: unknown;
          };
          detail?: unknown;
        };
        if (typeof parsed.error?.code === 'string') code = parsed.error.code;
        if (typeof parsed.error?.message === 'string') {
          message = parsed.error.message.slice(0, SAFE_MESSAGE_MAX);
        } else if (typeof parsed.detail === 'string') {
          message = parsed.detail.slice(0, SAFE_MESSAGE_MAX);
        }
        if (typeof parsed.error?.dispatched === 'boolean') {
          explicitDispatched = parsed.error.dispatched;
        }
        if (typeof parsed.error?.retryAfterSeconds === 'number') {
          retryAfterSeconds = parsed.error.retryAfterSeconds;
        }
        if (typeof parsed.error?.usage === 'object' && parsed.error.usage !== null) {
          usage = parsed.error.usage;
        }
      } catch {
        // Non-JSON upstream error body; keep safe default message.
      }
      const { kind, dispatched } = classifyPreStreamError(response.status, code, explicitDispatched);
      if (dispatched) {
        markAiRequestDispatched();
        input.onDispatched?.();
      }
      throw new PythonAiError(kind, message, {
        status: response.status,
        ...(code ? { code } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        ...(usage !== undefined ? { usage } : {}),
        dispatched,
      });
    }

    if (!response.body) {
      throw new PythonAiError('invalid_response', 'Streaming response body missing from AI backend.', {
        dispatched: false,
      });
    }

    markAiRequestDispatched();
    input.onDispatched?.();

    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      if (input.signal?.aborted) {
        throw new PythonAiError('timeout', 'AI backend stream was cancelled.', { dispatched: true });
      }
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        if (Buffer.byteLength(buffer, 'utf-8') > MAX_SSE_BUFFER_BYTES) {
          throw new PythonAiError('invalid_response', 'Upstream stream frame exceeded maximum buffer size.', {
            dispatched: true,
          });
        }
        let splitIdx = buffer.indexOf('\n\n');
        while (splitIdx !== -1) {
          const block = buffer.slice(0, splitIdx);
          buffer = buffer.slice(splitIdx + 2);
          const frame = parseSseChunkText(block);
          if (frame) {
            await input.onFrame(frame);
          }
          splitIdx = buffer.indexOf('\n\n');
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const frame = parseSseChunkText(trailing);
      if (frame) {
        await input.onFrame(frame);
      }
    }
  } catch (err) {
    if (err instanceof PythonAiError) throw err;
    if (timedOut) {
      throw new PythonAiError('timeout', 'AI request timed out. Please try again.', {
        dispatched: true,
      });
    }
    if (input.signal?.aborted) {
      throw new PythonAiError('timeout', 'AI backend stream was cancelled.', {
        dispatched: true,
      });
    }
    throw new PythonAiError('server_error', 'Stream interrupted before completion.', {
      dispatched: true,
    });
  } finally {
    clearTimeout(timer);
    if (input.signal) {
      input.signal.removeEventListener('abort', onParentAbort);
    }
    if (reader) {
      await reader.cancel().catch(() => undefined);
    }
  }
}

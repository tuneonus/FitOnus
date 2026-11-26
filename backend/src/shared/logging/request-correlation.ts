import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

/**
 * The correlation id ties every log line of ONE user request together: the HTTP access line, the AI
 * events, and (through the `X-Correlation-Id` header) the Python AI backend's lines. It is the same
 * value as pino-http's `req.id`, the `X-Request-Id` response header the app receives, and the
 * `requestId` in the error envelope, so a user can quote one id and support can find everything.
 *
 * It lives in AsyncLocalStorage (like the AI usage context) so deep code such as the Python AI client
 * can read it without every use case and port having to pass it along.
 */
const storage = new AsyncLocalStorage<{ readonly correlationId: string }>();

/** Ids we accept from outside (a client's X-Request-Id) or put into a header ourselves. */
export const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

export const isSafeCorrelationId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_CORRELATION_ID.test(value);

export const runWithCorrelationId = <T>(correlationId: string, work: () => T): T =>
  storage.run({ correlationId }, work);

/** The current request's correlation id, or undefined outside an HTTP request (jobs, some tests). */
export const currentCorrelationId = (): string | undefined => storage.getStore()?.correlationId;

// --- Distributed W3C traceparent context --------------------------------------------------------------

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
  readonly traceFlags: '01' | '00';
}

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);

const traceStorage = new AsyncLocalStorage<TraceContext>();

export const newTraceId = (): string => randomBytes(16).toString('hex');
export const newSpanId = (): string => randomBytes(8).toString('hex');

/** Parses a W3C `traceparent` header into a child server-side TraceContext, or undefined if invalid. */
export function parseTraceparent(header: unknown): TraceContext | undefined {
  if (typeof header !== 'string') return undefined;
  const match = TRACEPARENT_RE.exec(header.trim().toLowerCase());
  if (!match) return undefined;
  const [, traceId, parentSpanId, flags] = match;
  if (!traceId || !parentSpanId || traceId === ZERO_TRACE_ID || parentSpanId === ZERO_SPAN_ID) {
    return undefined;
  }
  return {
    traceId,
    spanId: newSpanId(),
    parentSpanId,
    traceFlags: flags === '00' ? '00' : '01',
  };
}

export function formatTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags}`;
}

export function createRootTraceContext(incomingTraceparent?: unknown): TraceContext {
  return (
    parseTraceparent(incomingTraceparent) ?? {
      traceId: newTraceId(),
      spanId: newSpanId(),
      traceFlags: '01',
    }
  );
}

export function createChildTraceContext(
  parent: TraceContext | undefined = currentTraceContext(),
): TraceContext {
  if (!parent) {
    return createRootTraceContext();
  }
  return {
    traceId: parent.traceId,
    spanId: newSpanId(),
    parentSpanId: parent.spanId,
    traceFlags: parent.traceFlags,
  };
}

export const runWithTraceContext = <T>(context: TraceContext, work: () => T): T =>
  traceStorage.run(context, work);

export const currentTraceContext = (): TraceContext | undefined => traceStorage.getStore();

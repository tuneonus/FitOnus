import {
  createChildTraceContext,
  currentCorrelationId,
  currentTraceContext,
  formatTraceparent,
  runWithTraceContext,
  type TraceContext,
} from '../logging/request-correlation.js';
import { LOG_SERVICE_NAME, redactSensitiveText } from '../logging/logger.js';

export interface AiSpanRecord {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
  readonly service: string;
  readonly operation: string;
  readonly status: 'ok' | 'error';
  readonly durationMs: number;
  readonly correlationId?: string | undefined;
  readonly errorCategory?: string | undefined;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

const SENSITIVE_ATTR_KEYS = new Set([
  'prompt',
  'message',
  'messages',
  'text',
  'reply',
  'context',
  'memories',
  'notes',
  'query',
  'transcript',
  'base64',
  'image',
  'audio',
  'email',
  'phone',
  'userid',
  'sub',
  'token',
  'apikey',
  'authorization',
  'secret',
]);

const DEFAULT_MAX_SPANS = 500;

function sanitizeAttributes(
  attrs: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> {
  if (!attrs) return {};
  const cleaned: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [key, value] of Object.entries(attrs)) {
    if (count >= 24) break;
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_ATTR_KEYS.has(norm)) {
      cleaned[key] = '[redacted]';
    } else if (typeof value === 'string') {
      cleaned[key] = redactSensitiveText(value, 120);
    } else if (typeof value === 'number') {
      cleaned[key] = Number.isFinite(value) ? value : 0;
    } else if (typeof value === 'boolean') {
      cleaned[key] = value;
    }
    count++;
  }
  return cleaned;
}

/** Bounded in-memory span ring buffer for distributed AI trace inspection and offline testing. */
export class AiTracer {
  private readonly spans: AiSpanRecord[] = [];
  private readonly maxSpans: number;

  constructor(maxSpans = DEFAULT_MAX_SPANS) {
    this.maxSpans = Math.max(1, maxSpans);
  }

  record(span: AiSpanRecord): void {
    if (this.spans.length >= this.maxSpans) {
      this.spans.shift();
    }
    this.spans.push(span);
  }

  recentSpans(traceId?: string, limit = 100): readonly AiSpanRecord[] {
    const filtered = traceId ? this.spans.filter((s) => s.traceId === traceId) : this.spans;
    return limit > 0 ? filtered.slice(-limit) : filtered;
  }

  count(): number {
    return this.spans.length;
  }

  clear(): void {
    this.spans.length = 0;
  }
}

export const defaultAiTracer = new AiTracer();

export interface SpanOptions {
  readonly service?: string;
  readonly attributes?: Record<string, string | number | boolean>;
  readonly tracer?: AiTracer;
}

export interface SpanController {
  readonly context: TraceContext;
  setAttribute(key: string, value: string | number | boolean): void;
  markError(category: string): void;
}

/**
 * Executes `work` inside a child `TraceContext` and records a bounded span.
 * Observability errors never mask or break application work.
 */
export async function withAiSpan<T>(
  operation: string,
  options: SpanOptions,
  work: (span: SpanController) => Promise<T>,
): Promise<T> {
  const tracer = options.tracer ?? defaultAiTracer;
  const child = createChildTraceContext();
  const correlationId = currentCorrelationId();
  const attrs: Record<string, string | number | boolean> = { ...(options.attributes ?? {}) };
  let status = 'ok' as 'ok' | 'error';
  let errorCategory: string | undefined;

  const controller: SpanController = {
    context: child,
    setAttribute(key, value) {
      if (Object.keys(attrs).length < 24) {
        attrs[key] = value;
      }
    },
    markError(category) {
      status = 'error';
      errorCategory = category;
    },
  };

  const startedAt = performance.now();
  try {
    return await runWithTraceContext(child, () => work(controller));
  } catch (error) {
    if (status !== 'error') {
      status = 'error';
      errorCategory = error instanceof Error ? error.name : 'unknown_error';
    }
    throw error;
  } finally {
    try {
      tracer.record({
        traceId: child.traceId,
        spanId: child.spanId,
        ...(child.parentSpanId ? { parentSpanId: child.parentSpanId } : {}),
        service: options.service ?? LOG_SERVICE_NAME,
        operation: operation.slice(0, 80),
        status,
        durationMs: Math.round(Math.max(0, performance.now() - startedAt) * 100) / 100,
        ...(correlationId ? { correlationId } : {}),
        ...(errorCategory ? { errorCategory } : {}),
        attributes: sanitizeAttributes(attrs),
      });
    } catch {
      // Fail-open: observability must never fail user requests.
    }
  }
}

/** Builds safe W3C `traceparent` + `X-Correlation-Id` outbound headers if active. */
export function buildOutboundTraceHeaders(
  correlationId: string | undefined = currentCorrelationId(),
  traceContext: TraceContext | undefined = currentTraceContext(),
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (traceContext) {
    headers['traceparent'] = formatTraceparent(traceContext);
  }
  if (correlationId) {
    headers['x-correlation-id'] = correlationId;
  }
  return headers;
}

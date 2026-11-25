import { z } from 'zod';
import { currentAiRequestContext } from '../../../shared/ai/ai-usage.js';
import { pythonUsageSchema, requireGateUserId } from '../../../shared/ai/python-ai-call.js';
import {
  PythonAiError,
  type AiUsageRecorder,
  type PythonAiClientConfig,
} from '../../../shared/ai/python-ai-client.js';
import { streamPythonAi, type RawSseFrame } from '../../../shared/ai/python-ai-stream-client.js';
import {
  nodeStreamMetrics,
  type NodeStreamMetricsCollector,
} from '../../../shared/ai/streaming-observability.js';
import type { Logger } from '../../../shared/logging/logger.js';
import type { CoachChatStreamRequest, CoachChatStreamService } from '../application/stream-ports.js';
import {
  redactUnsafeStreamText,
  sanitizeStreamError,
  type CoachStreamEvent,
} from '../domain/coach-stream.types.js';
import type { Block } from '../domain/coach.types.js';

export const COACH_CHAT_STREAM_SCOPE = 'ai:coach:chat';
export const COACH_CHAT_STREAM_PATH = '/internal/v1/ai/coach/chat/stream';

const DEADLINE_MARGIN_MS = 1_500;
const MIN_DEADLINE_MS = 1_000;

const streamStageSchema = z.enum([
  'validating',
  'loading_context',
  'routing',
  'agent_planning',
  'tool_calling',
  'agent_working',
  'synthesizing',
  'finalizing',
]);

const startEventSchema = z.object({
  type: z.literal('start'),
  traceId: z.string(),
  requestId: z.string().nullish(),
  seq: z.number().int().nonnegative().nullish(),
  model: z.string(),
  mode: z.enum(['direct', 'agent_native', 'agent_langgraph', 'multi_agent']).default('direct'),
  conversationId: z.string().nullish(),
  timestamp: z.string().nullish(),
});

const statusEventSchema = z.object({
  type: z.literal('status'),
  traceId: z.string(),
  seq: z.number().int().nonnegative().nullish(),
  stage: streamStageSchema,
  message: z.string(),
  toolName: z.string().nullish(),
  agentRole: z.string().nullish(),
  timestamp: z.string().nullish(),
});

const deltaEventSchema = z
  .object({
    type: z.literal('delta'),
    traceId: z.string(),
    seq: z.number().int().nonnegative().nullish(),
    sequence: z.number().int().nonnegative().nullish(),
    textDelta: z.string().nullish(),
    delta: z.string().nullish(),
    timestamp: z.string().nullish(),
  })
  .refine((v) => typeof v.textDelta === 'string' || typeof v.delta === 'string', {
    message: 'Delta event must contain delta or textDelta',
  });

const completeResultSchema = z.object({
  text: z.string(),
  followUps: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  medicalNote: z.boolean().nullish(),
  blocks: z.array(z.record(z.string(), z.unknown())).nullish(),
  toolCalls: z.array(z.string()).nullish(),
  citations: z
    .array(
      z.object({
        documentSlug: z.string(),
        documentTitle: z.string(),
        category: z.string().nullish(),
        chunkIndex: z.number().nullish(),
        citation: z.string(),
      }),
    )
    .nullish(),
});

const completeEventSchema = z.object({
  type: z.literal('complete'),
  traceId: z.string(),
  seq: z.number().int().nonnegative().nullish(),
  outcome: z.enum(['ok', 'unstructured']).nullish(),
  result: completeResultSchema,
  usage: pythonUsageSchema.nullish(),
  timestamp: z.string().nullish(),
});

const errorEventSchema = z.object({
  type: z.literal('error'),
  traceId: z.string(),
  seq: z.number().int().nonnegative().nullish(),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().default(false),
  usage: pythonUsageSchema.nullish(),
  timestamp: z.string().nullish(),
});

const heartbeatEventSchema = z.object({
  type: z.literal('heartbeat'),
  traceId: z.string(),
  seq: z.number().int().nonnegative().nullish(),
  timestamp: z.string().nullish(),
});

export interface PythonCoachStreamDeps {
  readonly clientConfig: PythonAiClientConfig;
  readonly resolveModels: () => Promise<{ primary: string; fallback: string | null }>;
  readonly usageRecorder?: AiUsageRecorder | undefined;
  readonly pythonTimeoutMs: number;
  readonly logger?: Pick<Logger, 'info' | 'warn' | 'error'> | undefined;
  readonly metrics?: NodeStreamMetricsCollector | undefined;
}

function mapPythonErrorCodeToPublic(error: PythonAiError): string {
  switch (error.kind) {
    case 'timeout':
    case 'provider_timeout':
      return 'PROVIDER_TIMEOUT';
    case 'provider_rate_limited':
      return 'PROVIDER_RATE_LIMITED';
    case 'provider_quota_exhausted':
      return 'PROVIDER_QUOTA_EXHAUSTED';
    case 'invalid_request':
      return error.info.code ?? 'INVALID_REQUEST';
    case 'auth':
    case 'misconfigured':
      return 'PROVIDER_AUTH_ERROR';
    default:
      return error.info.code ?? 'AI_UNAVAILABLE';
  }
}

/**
 * Infrastructure adapter streaming Coach responses from Python `/internal/v1/ai/coach/chat/stream`.
 * Validates every SSE event with Zod, enforces idempotent single usage ledger writes per stream,
 * tolerates malformed non-critical frames without crashing, and propagates backpressure.
 */
export class PythonCoachStreamService implements CoachChatStreamService {
  constructor(private readonly deps: PythonCoachStreamDeps) {}

  async streamReply(
    request: CoachChatStreamRequest,
    onEvent: (event: CoachStreamEvent) => Promise<void>,
  ): Promise<void> {
    const userId = requireGateUserId(currentAiRequestContext()?.userId ?? request.userId);
    const models = await this.deps.resolveModels();
    const timeoutMs = this.deps.pythonTimeoutMs;
    const metrics = this.deps.metrics ?? nodeStreamMetrics;

    let usageRecorded = false;
    let terminalSent = false;
    let firstEventReceived = false;
    let eventCounter = 0;
    const resolveSeq = (rawSeq?: number | null): number => {
      eventCounter += 1;
      return typeof rawSeq === 'number' ? rawSeq : eventCounter;
    };
    const resolveTimestamp = (rawTs?: string | null): string =>
      rawTs && rawTs.trim() ? rawTs : new Date().toISOString();

    const recordUsageOnce = async (
      status: 'success' | 'failed',
      usage: z.output<typeof pythonUsageSchema> | null | undefined,
      errorCategory?: string | null,
    ): Promise<void> => {
      if (usageRecorded || !this.deps.usageRecorder || !usage) return;
      usageRecorded = true;
      try {
        await this.deps.usageRecorder.recordExternalUsage({
          requestId: request.requestId,
          userId,
          feature: 'coach_chat',
          model: usage.model,
          status,
          isFallback: usage.isFallback,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
          totalTokens: usage.totalTokens,
          durationMs: usage.durationMs,
          errorCategory: errorCategory ?? (usage.isFallback ? 'FALLBACK_SUCCESS' : null),
        });
      } catch (err) {
        this.deps.logger?.warn(
          {
            event: 'stream_ledger_persistence_failed',
            requestId: request.requestId,
            errorCategory: err instanceof Error ? err.name : 'unknown',
          },
          'Failed to persist streaming Gemini usage event',
        );
      }
    };

    const handleFrame = async (frame: RawSseFrame): Promise<void> => {
      let decodedJson: unknown;
      try {
        decodedJson = JSON.parse(frame.data);
      } catch {
        metrics.recordMalformedEvent();
        this.deps.logger?.warn(
          { event: 'ai.stream.malformed_json', requestId: request.requestId, sseEvent: frame.event },
          'Skipped malformed JSON SSE frame from Python AI backend',
        );
        return;
      }

      if (frame.event === 'start') {
        const parsed = startEventSchema.safeParse(decodedJson);
        if (!parsed.success) {
          metrics.recordMalformedEvent();
          return;
        }
        firstEventReceived = true;
        await onEvent({
          type: 'start',
          traceId: parsed.data.traceId,
          seq: resolveSeq(parsed.data.seq),
          model: parsed.data.model,
          mode: parsed.data.mode,
          ...(parsed.data.conversationId ? { conversationId: parsed.data.conversationId } : {}),
          timestamp: resolveTimestamp(parsed.data.timestamp),
        });
        return;
      }

      if (frame.event === 'status') {
        const parsed = statusEventSchema.safeParse(decodedJson);
        if (!parsed.success) {
          metrics.recordMalformedEvent();
          return;
        }
        firstEventReceived = true;
        await onEvent({
          type: 'status',
          traceId: parsed.data.traceId,
          seq: resolveSeq(parsed.data.seq),
          stage: parsed.data.stage,
          message: parsed.data.message,
          ...(parsed.data.toolName ? { toolName: parsed.data.toolName } : {}),
          ...(parsed.data.agentRole ? { agentRole: parsed.data.agentRole } : {}),
          timestamp: resolveTimestamp(parsed.data.timestamp),
        });
        return;
      }

      if (frame.event === 'delta') {
        const parsed = deltaEventSchema.safeParse(decodedJson);
        if (!parsed.success) {
          metrics.recordMalformedEvent();
          return;
        }
        firstEventReceived = true;
        const rawDelta = parsed.data.textDelta ?? parsed.data.delta ?? '';
        const safeDelta = redactUnsafeStreamText(rawDelta);
        if (!safeDelta) return;
        await onEvent({
          type: 'delta',
          traceId: parsed.data.traceId,
          seq: resolveSeq(parsed.data.seq ?? parsed.data.sequence),
          textDelta: safeDelta,
          timestamp: resolveTimestamp(parsed.data.timestamp),
        });
        return;
      }

      if (frame.event === 'heartbeat') {
        const parsed = heartbeatEventSchema.safeParse(decodedJson);
        if (!parsed.success) {
          metrics.recordMalformedEvent();
          return;
        }
        firstEventReceived = true;
        await onEvent({
          type: 'heartbeat',
          traceId: parsed.data.traceId,
          seq: resolveSeq(parsed.data.seq),
          timestamp: resolveTimestamp(parsed.data.timestamp),
        });
        return;
      }

      if (frame.event === 'complete') {
        const parsed = completeEventSchema.safeParse(decodedJson);
        if (!parsed.success) {
          metrics.recordMalformedEvent();
          return;
        }
        firstEventReceived = true;
        terminalSent = true;
        const r = parsed.data.result;
        const u = parsed.data.usage ?? undefined;
        await recordUsageOnce('success', u);

        await onEvent({
          type: 'complete',
          traceId: parsed.data.traceId,
          seq: resolveSeq(parsed.data.seq),
          response: {
            text: redactUnsafeStreamText(r.text),
            followUps: r.followUps,
            sources: r.sources,
            ...(r.toolCalls && r.toolCalls.length > 0 ? { toolCalls: r.toolCalls } : {}),
            ...(typeof r.medicalNote === 'boolean' ? { medicalNote: r.medicalNote } : {}),
            ...(r.blocks ? { blocks: r.blocks as unknown as Block[] } : {}),
            ...(r.citations && r.citations.length > 0
              ? {
                  citations: r.citations.map((c) => ({
                    documentSlug: c.documentSlug,
                    documentTitle: c.documentTitle,
                    ...(c.category ? { category: c.category } : {}),
                    ...(typeof c.chunkIndex === 'number' ? { chunkIndex: c.chunkIndex } : {}),
                    citation: c.citation,
                  })),
                }
              : {}),
          },
          ...(u
            ? {
                usage: {
                  model: u.model,
                  isFallback: u.isFallback,
                  inputTokens: u.inputTokens,
                  outputTokens: u.outputTokens,
                  cachedTokens: u.cachedTokens,
                  thinkingTokens: u.thinkingTokens,
                  totalTokens: u.totalTokens,
                  durationMs: u.durationMs,
                },
              }
            : {}),
          timestamp: resolveTimestamp(parsed.data.timestamp),
        });
        return;
      }

      if (frame.event === 'error') {
        const parsed = errorEventSchema.safeParse(decodedJson);
        if (!parsed.success) {
          metrics.recordMalformedEvent();
          return;
        }
        firstEventReceived = true;
        terminalSent = true;
        const safe = sanitizeStreamError(parsed.data.code, parsed.data.message);
        await recordUsageOnce('failed', parsed.data.usage, safe.code);
        await onEvent({
          type: 'error',
          traceId: parsed.data.traceId,
          seq: resolveSeq(parsed.data.seq),
          code: safe.code,
          message: safe.message,
          retryable: safe.retryable,
          timestamp: resolveTimestamp(parsed.data.timestamp),
        });
        return;
      }

      metrics.recordMalformedEvent();
    };

    try {
      await streamPythonAi(this.deps.clientConfig, {
        path: COACH_CHAT_STREAM_PATH,
        scope: COACH_CHAT_STREAM_SCOPE,
        subject: userId,
        requestId: request.requestId,
        timeoutMs,
        ...(request.signal ? { signal: request.signal } : {}),
        ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
        body: {
          message: request.message,
          context: request.context,
          history: request.history,
          memories: request.memories ?? [],
          ...(request.knowledge && request.knowledge.length > 0 ? { knowledge: request.knowledge } : {}),
          model: { primary: models.primary, fallback: models.fallback },
          deadlineMs: Math.max(MIN_DEADLINE_MS, timeoutMs - DEADLINE_MARGIN_MS),
          ...(request.conversationId ? { conversationId: request.conversationId } : {}),
          ...(request.clientMessageId ? { clientMessageId: request.clientMessageId } : {}),
        },
        onFrame: handleFrame,
      });

      if (!terminalSent && !request.signal?.aborted) {
        const safe = sanitizeStreamError('STREAM_INTERRUPTED');
        await onEvent({
          type: 'error',
          traceId: request.requestId,
          seq: 1,
          code: safe.code,
          message: safe.message,
          retryable: safe.retryable,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (err instanceof PythonAiError) {
        const mappedCode = mapPythonErrorCodeToPublic(err);
        if (err.info.usage) {
          const parsedUsage = pythonUsageSchema.safeParse(err.info.usage);
          if (parsedUsage.success) {
            await recordUsageOnce('failed', parsedUsage.data, mappedCode);
          }
        }
        if (request.signal?.aborted) {
          return;
        }
        if (firstEventReceived && !terminalSent) {
          const safe = sanitizeStreamError(mappedCode);
          await onEvent({
            type: 'error',
            traceId: request.requestId,
            seq: 1,
            code: safe.code,
            message: safe.message,
            retryable: safe.retryable,
            timestamp: new Date().toISOString(),
          });
          return;
        }
        throw err;
      }
      throw err;
    }
  }
}

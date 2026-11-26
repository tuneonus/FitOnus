import { createHash, randomUUID } from 'node:crypto';
import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { PythonAiError } from '../../../../shared/ai/python-ai-client.js';
import { toPublicAiError } from '../../../../shared/ai/python-ai-errors.js';
import {
  NodeStreamTracker,
  nodeStreamMetrics,
  type NodeStreamMetricsCollector,
} from '../../../../shared/ai/streaming-observability.js';
import { AppError, conflict, isAppError } from '../../../../shared/errors/app-error.js';
import type { Logger } from '../../../../shared/logging/logger.js';
import type { KnowledgeService } from '../../../knowledge/index.js';
import {
  redactUnsafeStreamText,
  sanitizeStreamError,
  type CoachStreamEvent,
} from '../../domain/coach-stream.types.js';
import type { ChatMessageTurn, CoachResponse } from '../../domain/coach.types.js';
import type {
  ConversationRepository,
  MemoryExtractionJobQueue,
  MemoryRepository,
  UserContextRepository,
} from '../ports.js';
import { CoachContextAssembler } from '../services/context-assembler.js';
import type { CoachChatStreamService } from '../stream-ports.js';

const REPLAY_TTL_MS = 5 * 60 * 1000;
const MAX_REPLAY_ENTRIES = 256;

interface CompletedReplayEntry {
  readonly digest: string;
  readonly expiresAt: number;
  readonly events: readonly CoachStreamEvent[];
}

export interface StreamCoachChatInput {
  readonly userId: string;
  readonly message: string;
  readonly timezone?: string | undefined;
  readonly history?: ChatMessageTurn[] | undefined;
  readonly conversationId?: string | undefined;
  readonly clientMessageId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly maxHistoryTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface StreamCoachChatCallbacks {
  /** Invoked right before upstream connection opens (safe point to flush 200 SSE headers). */
  readonly onStreamReady?: () => void;
  /** Async event emitter; awaiting enables end-to-end TCP/HTTP write backpressure. */
  readonly onEvent: (event: CoachStreamEvent) => Promise<void>;
}

export interface StreamCoachChatDeps {
  readonly userContextRepo: UserContextRepository;
  readonly streamService: CoachChatStreamService;
  readonly aiUsageGate: AiUsageGate;
  readonly streamingEnabled: boolean;
  readonly conversationRepo?: ConversationRepository | undefined;
  readonly memoryRepo?: MemoryRepository | undefined;
  readonly knowledgeService?: KnowledgeService | undefined;
  readonly logger?: Pick<Logger, 'info' | 'warn'> | undefined;
  readonly jobQueue?: MemoryExtractionJobQueue | undefined;
  readonly onJobEnqueued?: (() => void) | undefined;
  readonly metrics?: NodeStreamMetricsCollector | undefined;
}

function requestDigest(userId: string, message: string, conversationId?: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ userId, message, conversationId: conversationId ?? null }))
    .digest('hex');
}

export class StreamCoachChatUseCase {
  private readonly contextAssembler: CoachContextAssembler;
  private readonly inFlightKeys = new Set<string>();
  private readonly completedReplays = new Map<string, CompletedReplayEntry>();

  constructor(private readonly deps: StreamCoachChatDeps) {
    this.contextAssembler = new CoachContextAssembler({
      userContextRepo: deps.userContextRepo,
      ...(deps.conversationRepo ? { conversationRepo: deps.conversationRepo } : {}),
      ...(deps.memoryRepo ? { memoryRepo: deps.memoryRepo } : {}),
      ...(deps.knowledgeService ? { knowledgeService: deps.knowledgeService } : {}),
      ...(deps.logger ? { logger: deps.logger } : {}),
    });
  }

  async execute(input: StreamCoachChatInput, callbacks: StreamCoachChatCallbacks): Promise<void> {
    if (!this.deps.streamingEnabled) {
      throw new AppError('unprocessable', 'FEATURE_DISABLED', 'Streaming AI Coach is currently disabled.');
    }

    const trimmedMessage = input.message.trim();
    if (!trimmedMessage) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'Message cannot be empty.');
    }

    const userId = input.userId.trim();
    const idemKey = input.idempotencyKey?.trim();
    const clientMsgId = input.clientMessageId?.trim();
    const dedupKey = idemKey
      ? `${userId}:idem:${idemKey}`
      : clientMsgId
        ? `${userId}:cid:${clientMsgId}`
        : null;
    const digest = requestDigest(userId, trimmedMessage, input.conversationId?.trim());

    this.pruneExpiredReplays();
    if (idemKey) {
      const replay = this.completedReplays.get(`${userId}:idem:${idemKey}`);
      if (replay) {
        if (replay.digest !== digest) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency key cannot be reused with a different request payload.',
          );
        }
        callbacks.onStreamReady?.();
        for (const event of replay.events) {
          if (input.signal?.aborted) break;
          await callbacks.onEvent(event);
        }
        return;
      }
    }

    if (dedupKey) {
      if (this.inFlightKeys.has(dedupKey)) {
        throw conflict(
          'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          'A matching coaching stream is already in progress.',
        );
      }
      this.inFlightKeys.add(dedupKey);
    }

    try {
      await this.deps.aiUsageGate.run({ userId, action: 'coach_chat' }, () =>
        this.streamInsideGate(
          userId,
          trimmedMessage,
          input,
          callbacks,
          idemKey ? `${userId}:idem:${idemKey}` : null,
          digest,
        ),
      );
    } finally {
      if (dedupKey) {
        this.inFlightKeys.delete(dedupKey);
      }
    }
  }

  private async streamInsideGate(
    userId: string,
    trimmedMessage: string,
    input: StreamCoachChatInput,
    callbacks: StreamCoachChatCallbacks,
    replayCacheKey: string | null,
    digest: string,
  ): Promise<void> {
    const requestId = `stream-${randomUUID()}`;
    let conversationId = input.conversationId?.trim();
    if (this.deps.conversationRepo) {
      if (conversationId) {
        const existing = await this.deps.conversationRepo.getConversation(userId, conversationId);
        if (!existing) {
          const title = trimmedMessage.length > 40 ? `${trimmedMessage.slice(0, 37)}...` : trimmedMessage;
          const created = await this.deps.conversationRepo.createConversation(userId, title);
          conversationId = created.id;
        }
      } else {
        const title = trimmedMessage.length > 40 ? `${trimmedMessage.slice(0, 37)}...` : trimmedMessage;
        const created = await this.deps.conversationRepo.createConversation(userId, title);
        conversationId = created.id;
      }
    }

    let userMsgId = input.clientMessageId?.trim() || `msg-${randomUUID()}`;
    if (this.deps.conversationRepo && conversationId) {
      userMsgId = await this.persistUserMessage(
        this.deps.conversationRepo,
        userId,
        conversationId,
        userMsgId,
        trimmedMessage,
      );
    }

    const assembled = await this.contextAssembler.assemble({
      userId,
      message: trimmedMessage,
      timezone: input.timezone,
      conversationId,
      clientMessageId: userMsgId,
      clientHistory: input.history,
      maxHistoryTokens: input.maxHistoryTokens,
    });

    const tracker = new NodeStreamTracker({
      requestId,
      traceId: requestId,
      userId,
      feature: 'coach_chat',
      metrics: this.deps.metrics ?? nodeStreamMetrics,
      ...(this.deps.logger ? { logger: this.deps.logger } : {}),
    });

    const replayEvents: CoachStreamEvent[] = [];
    let accumulatedText = '';
    let completedResponse: CoachResponse | null = null;
    let assistantPersisted = false;
    let streamStarted = false;
    let lastSeq = 0;

    const ensureStreamStarted = (): void => {
      if (!streamStarted) {
        streamStarted = true;
        callbacks.onStreamReady?.();
      }
    };

    try {
      await this.deps.streamService.streamReply(
        {
          requestId,
          userId,
          message: trimmedMessage,
          history: assembled.history,
          context: assembled.context,
          ...(assembled.memories.length > 0 ? { memories: assembled.memories } : {}),
          ...(assembled.knowledge.length > 0 ? { knowledge: assembled.knowledge } : {}),
          ...(conversationId ? { conversationId } : {}),
          ...(userMsgId ? { clientMessageId: userMsgId } : {}),
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        },
        async (event) => {
          ensureStreamStarted();
          lastSeq = Math.max(lastSeq, event.seq);
          if (event.type === 'start') {
            const patched: CoachStreamEvent = {
              ...event,
              ...(conversationId ? { conversationId } : {}),
            };
            replayEvents.push(patched);
            await callbacks.onEvent(patched);
            return;
          }

          if (event.type === 'delta') {
            const safeDelta = redactUnsafeStreamText(event.textDelta);
            if (!safeDelta) return;
            accumulatedText += safeDelta;
            tracker.markDelta(safeDelta.length);
            const safeEvent: CoachStreamEvent = {
              ...event,
              textDelta: safeDelta,
            };
            replayEvents.push(safeEvent);
            await callbacks.onEvent(safeEvent);
            return;
          }

          if (event.type === 'complete') {
            const safeText = redactUnsafeStreamText(event.response.text || accumulatedText);
            const enrichedResponse: CoachResponse & { conversationId?: string } = {
              ...event.response,
              text: safeText,
              ...(conversationId ? { conversationId } : {}),
            };
            completedResponse = enrichedResponse;

            if (this.deps.conversationRepo && conversationId && !assistantPersisted) {
              assistantPersisted = true;
              await this.deps.conversationRepo.addMessage(userId, conversationId, {
                id: `msg-${randomUUID()}`,
                conversationId,
                role: 'assistant',
                text: enrichedResponse.text,
                blocks: enrichedResponse.blocks,
                sources: enrichedResponse.sources,
                followUps: enrichedResponse.followUps,
                createdAt: new Date().toISOString(),
              });
            }

            if (this.deps.jobQueue && this.deps.memoryRepo && conversationId) {
              this.deps.jobQueue
                .enqueue(userId, conversationId, userMsgId)
                .then(() => {
                  this.deps.onJobEnqueued?.();
                })
                .catch((err: unknown) => {
                  this.deps.logger?.warn(
                    `[CoachStream] Failed to enqueue memory extraction: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  );
                });
            }

            const finalEvent: CoachStreamEvent = {
              ...event,
              response: enrichedResponse,
            };
            replayEvents.push(finalEvent);
            tracker.finish('completed');
            await callbacks.onEvent(finalEvent);
            return;
          }

          if (event.type === 'error') {
            const safeErr = sanitizeStreamError(event.code, event.message);
            const safeErrEvent: CoachStreamEvent = {
              ...event,
              code: safeErr.code,
              message: safeErr.message,
              retryable: safeErr.retryable,
            };
            tracker.finish(
              safeErr.code === 'DEADLINE_EXCEEDED' || safeErr.code === 'PROVIDER_TIMEOUT'
                ? 'timeout'
                : 'error',
              safeErr.code,
            );
            await callbacks.onEvent(safeErrEvent);
            return;
          }

          if (event.type === 'status') {
            replayEvents.push(event);
          }
          await callbacks.onEvent(event);
        },
      );

      if (input.signal?.aborted && !completedResponse) {
        tracker.finish('cancelled', 'STREAM_CANCELLED');
      } else if (!completedResponse) {
        tracker.finish('completed');
      }

      if (replayCacheKey && completedResponse && !input.signal?.aborted) {
        this.saveReplay(replayCacheKey, {
          digest,
          expiresAt: Date.now() + REPLAY_TTL_MS,
          events: replayEvents,
        });
      }
    } catch (err) {
      if (input.signal?.aborted) {
        tracker.finish('cancelled', 'STREAM_CANCELLED');
        if (!streamStarted) {
          throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'Generation stopped.');
        }
        return;
      }
      if (!streamStarted) {
        const errorCode =
          err instanceof PythonAiError
            ? (err.info.code ?? err.kind)
            : isAppError(err)
              ? err.code
              : 'INTERNAL_ERROR';
        tracker.finish(
          err instanceof PythonAiError && (err.kind === 'timeout' || err.kind === 'provider_timeout')
            ? 'timeout'
            : 'error',
          errorCode,
        );
        if (err instanceof PythonAiError) {
          throw toPublicAiError(err, 'The AI Coach is temporarily unavailable. Please try again shortly.');
        }
        throw err;
      }
      const rawCode =
        err instanceof PythonAiError
          ? (err.info.code ?? err.kind)
          : isAppError(err)
            ? err.code
            : err instanceof Error
              ? err.name
              : 'INTERNAL_ERROR';
      const mappedCode = rawCode === 'Error' || rawCode === 'PythonAiError' ? 'AI_UNAVAILABLE' : rawCode;
      const safeErr = sanitizeStreamError(mappedCode);
      tracker.finish(
        safeErr.code === 'PROVIDER_TIMEOUT' || safeErr.code === 'DEADLINE_EXCEEDED' ? 'timeout' : 'error',
        safeErr.code,
      );
      await callbacks.onEvent({
        type: 'error',
        traceId: requestId,
        seq: lastSeq + 1,
        code: safeErr.code,
        message: safeErr.message,
        retryable: safeErr.retryable,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async persistUserMessage(
    repo: ConversationRepository,
    userId: string,
    conversationId: string,
    preferredId: string,
    text: string,
  ): Promise<string> {
    const store = (id: string) =>
      repo.addMessage(userId, conversationId, {
        id,
        conversationId,
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
      });

    try {
      await store(preferredId);
      return preferredId;
    } catch (error) {
      if (!isAppError(error) || error.kind !== 'conflict') throw error;
    }

    const fallbackId = `msg-${randomUUID()}`;
    await store(fallbackId);
    return fallbackId;
  }

  private pruneExpiredReplays(): void {
    const now = Date.now();
    for (const [key, entry] of this.completedReplays) {
      if (entry.expiresAt <= now) {
        this.completedReplays.delete(key);
      }
    }
  }

  private saveReplay(key: string, entry: CompletedReplayEntry): void {
    this.completedReplays.set(key, entry);
    if (this.completedReplays.size > MAX_REPLAY_ENTRIES) {
      const oldestKey = this.completedReplays.keys().next().value;
      if (oldestKey) {
        this.completedReplays.delete(oldestKey);
      }
    }
  }
}

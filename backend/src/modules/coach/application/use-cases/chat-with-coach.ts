import { randomUUID } from 'node:crypto';
import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { AppError, isAppError } from '../../../../shared/errors/app-error.js';
import type { Logger } from '../../../../shared/logging/logger.js';
import type { KnowledgeService } from '../../../knowledge/index.js';
import { CoachContextAssembler } from '../services/context-assembler.js';
import type {
  ConversationRepository,
  GeminiService,
  MemoryExtractionJobQueue,
  MemoryRepository,
  UserContextRepository,
} from '../ports.js';
import type { ChatMessageTurn, CoachResponse } from '../../domain/coach.types.js';

export interface ChatWithCoachInput {
  userId: string;
  message: string;
  timezone?: string | null;
  history?: ChatMessageTurn[];
  conversationId?: string | null;
  clientMessageId?: string | null;
  maxHistoryTokens?: number;
}

export type ChatWithCoachOutput = CoachResponse & {
  conversationId?: string;
};

export class ChatWithCoachUseCase {
  private readonly contextAssembler: CoachContextAssembler;

  constructor(
    private readonly userContextRepo: UserContextRepository,
    private readonly geminiService: GeminiService,
    private readonly aiUsageGate: AiUsageGate,
    private readonly conversationRepo?: ConversationRepository,
    private readonly memoryRepo?: MemoryRepository,
    private readonly knowledgeService?: KnowledgeService,
    private readonly logger?: Pick<Logger, 'info' | 'warn'>,
    private readonly jobQueue?: MemoryExtractionJobQueue,
    private readonly onJobEnqueued?: () => void,
    contextAssembler?: CoachContextAssembler,
  ) {
    this.contextAssembler =
      contextAssembler ??
      new CoachContextAssembler({
        userContextRepo: this.userContextRepo,
        conversationRepo: this.conversationRepo,
        memoryRepo: this.memoryRepo,
        knowledgeService: this.knowledgeService,
        logger: this.logger,
      });
  }

  async execute(input: ChatWithCoachInput): Promise<ChatWithCoachOutput> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }

    const trimmedMessage = input.message.trim();
    if (!trimmedMessage) {
      throw new AppError('bad_request', 'BAD_REQUEST', 'Message cannot be empty.');
    }

    const userId = input.userId.trim();

    // Feature flag + atomic daily quota are enforced before any conversation/message is persisted
    // and before Gemini is called, so a blocked request has no side effects and costs nothing.
    return this.aiUsageGate.run({ userId, action: 'coach_chat' }, () =>
      this.respond(userId, trimmedMessage, input),
    );
  }

  private async respond(
    userId: string,
    trimmedMessage: string,
    input: ChatWithCoachInput,
  ): Promise<ChatWithCoachOutput> {
    // 1. Resolve or create persistent conversation if repository configured
    let conversationId = input.conversationId?.trim();
    if (this.conversationRepo) {
      if (conversationId) {
        const existing = await this.conversationRepo.getConversation(userId, conversationId);
        if (!existing) {
          // If specified conversation does not exist, start a new one cleanly
          const title = trimmedMessage.length > 40 ? `${trimmedMessage.slice(0, 37)}...` : trimmedMessage;
          const created = await this.conversationRepo.createConversation(userId, title);
          conversationId = created.id;
        }
      } else {
        const title = trimmedMessage.length > 40 ? `${trimmedMessage.slice(0, 37)}...` : trimmedMessage;
        const created = await this.conversationRepo.createConversation(userId, title);
        conversationId = created.id;
      }
    }

    // 2. Persist user message to conversation history (idempotent on clientMessageId)
    let userMsgId = input.clientMessageId?.trim() || newMessageId();
    if (this.conversationRepo && conversationId) {
      userMsgId = await this.persistUserMessage(
        this.conversationRepo,
        userId,
        conversationId,
        userMsgId,
        trimmedMessage,
      );
    }

    // 3. Assemble and budget unified context via Centralized Context Assembler
    const assembled = await this.contextAssembler.assemble({
      userId,
      message: trimmedMessage,
      timezone: input.timezone,
      conversationId,
      clientMessageId: userMsgId,
      clientHistory: input.history,
      maxHistoryTokens: input.maxHistoryTokens,
    });

    // 4. Generate coach response using Gemini (exact arity for backward compatibility)
    const effectiveHistory = assembled.history.length > 0 ? assembled.history : undefined;
    const response =
      assembled.knowledge.length > 0
        ? await this.geminiService.generateCoachResponse(
            trimmedMessage,
            assembled.context,
            effectiveHistory,
            assembled.memories.length > 0 ? assembled.memories : undefined,
            assembled.knowledge,
          )
        : assembled.memories.length > 0
          ? await this.geminiService.generateCoachResponse(
              trimmedMessage,
              assembled.context,
              effectiveHistory,
              assembled.memories,
            )
          : await this.geminiService.generateCoachResponse(
              trimmedMessage,
              assembled.context,
              effectiveHistory,
            );

    // 6. Persist assistant response to conversation history
    if (this.conversationRepo && conversationId) {
      const assistantMsgId = newMessageId();
      await this.conversationRepo.addMessage(userId, conversationId, {
        id: assistantMsgId,
        conversationId,
        role: 'assistant',
        text: response.text,
        blocks: response.blocks,
        sources: response.sources,
        followUps: response.followUps,
        createdAt: new Date().toISOString(),
      });
    }

    // 7. Enqueue background memory extraction durably in PostgreSQL (idempotent, does not block response)
    if (this.jobQueue && this.memoryRepo && conversationId) {
      this.jobQueue
        .enqueue(userId, conversationId, userMsgId)
        .then(() => {
          this.onJobEnqueued?.();
        })
        .catch((err) => {
          this.logger?.warn?.(
            `[CoachChat] Failed to enqueue memory extraction: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return {
      ...response,
      ...(conversationId ? { conversationId } : {}),
    };
  }

  /**
   * Stores the user's message and returns the ID it was stored under.
   *
   * `clientMessageId` makes a retry idempotent for the SAME user, but message IDs share one global
   * namespace and the client picks them. If the ID already belongs to another user (or another
   * conversation) the repository refuses to touch that row; the request itself is still legitimate
   * and already metered, so store this user's message under a server-generated ID instead of failing.
   * The response is identical either way, so a caller learns nothing about IDs it does not own.
   */
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

    const fallbackId = newMessageId();
    await store(fallbackId);
    return fallbackId;
  }
}

/** Server-generated message IDs are random so two requests can never collide (Date.now() could). */
const newMessageId = (): string => `msg-${randomUUID()}`;

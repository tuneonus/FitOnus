import { randomUUID } from 'node:crypto';
import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { AppError, isAppError } from '../../../../shared/errors/app-error.js';
import type {
  ConversationRepository,
  GeminiService,
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
}

export type ChatWithCoachOutput = CoachResponse & {
  conversationId?: string;
};

export class ChatWithCoachUseCase {
  constructor(
    private readonly userContextRepo: UserContextRepository,
    private readonly geminiService: GeminiService,
    private readonly aiUsageGate: AiUsageGate,
    private readonly conversationRepo?: ConversationRepository,
    private readonly memoryRepo?: MemoryRepository,
  ) {}

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
    const timezone = input.timezone || 'UTC';
    const context = await this.userContextRepo.getUserFitnessContext(userId, timezone);

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

    // 3. Resolve conversation history if not supplied by client
    let history = input.history ?? [];
    if (history.length === 0 && this.conversationRepo && conversationId) {
      const pastMessages = await this.conversationRepo.getMessages(userId, conversationId, 8);
      history = pastMessages
        .filter((m) => m.id !== userMsgId && m.text)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          text: m.text,
        }));
    }

    // 4. Retrieve user-approved fitness memories if enabled
    const memories = this.memoryRepo
      ? await this.memoryRepo.getActiveMemoriesForContext(userId)
      : [];

    // 5. Generate coach response using Gemini
    const effectiveHistory = input.history ?? (history && history.length > 0 ? history : undefined);
    const response =
      memories.length > 0
        ? await this.geminiService.generateCoachResponse(
            trimmedMessage,
            context,
            effectiveHistory,
            memories,
          )
        : await this.geminiService.generateCoachResponse(
            trimmedMessage,
            context,
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

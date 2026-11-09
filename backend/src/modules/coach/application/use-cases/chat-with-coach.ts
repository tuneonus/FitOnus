import { AppError } from '../../../../shared/errors/app-error.js';
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
    const userMsgId = input.clientMessageId?.trim() || `msg-${Date.now()}-u`;
    if (this.conversationRepo && conversationId) {
      await this.conversationRepo.addMessage(userId, conversationId, {
        id: userMsgId,
        conversationId,
        role: 'user',
        text: trimmedMessage,
        createdAt: new Date().toISOString(),
      });
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
      const assistantMsgId = `msg-${Date.now()}-a`;
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
}

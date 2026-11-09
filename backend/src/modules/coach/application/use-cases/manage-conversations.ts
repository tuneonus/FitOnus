import { AppError } from '../../../../shared/errors/app-error.js';
import type { ConversationRepository } from '../ports.js';
import type {
  ConversationDetail,
  ConversationSummary,
} from '../../domain/coach-history.types.js';

export class ManageConversationsUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async list(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ conversations: ConversationSummary[]; total: number; page: number; limit: number }> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const result = await this.conversationRepo.listConversations(userId, safeLimit, offset);
    return {
      conversations: result.conversations,
      total: result.total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async get(userId: string, conversationId: string): Promise<ConversationDetail> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!conversationId?.trim()) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Conversation ID is required.');
    }

    const conversation = await this.conversationRepo.getConversation(userId, conversationId);
    if (!conversation) {
      throw new AppError('not_found', 'NOT_FOUND', 'Conversation not found.');
    }
    return conversation;
  }

  async create(userId: string, title?: string): Promise<ConversationSummary> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const safeTitle = title?.trim() || 'New conversation';
    return await this.conversationRepo.createConversation(userId, safeTitle);
  }

  async rename(userId: string, conversationId: string, title: string): Promise<ConversationSummary> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!title?.trim()) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Conversation title cannot be empty.');
    }

    const updated = await this.conversationRepo.updateConversation(userId, conversationId, {
      title: title.trim(),
    });
    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', 'Conversation not found.');
    }
    return updated;
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const deleted = await this.conversationRepo.deleteConversation(userId, conversationId);
    if (!deleted) {
      throw new AppError('not_found', 'NOT_FOUND', 'Conversation not found.');
    }
  }
}


import { AppError } from '../../../../shared/errors/app-error.js';
import type { MemoryRepository } from '../ports.js';
import type {
  MemoryCategory,
  MemoryItem,
  MemoryListResponse,
  MemoryStatus,
} from '../../domain/coach-memory.types.js';

const VALID_CATEGORIES: MemoryCategory[] = [
  'goals',
  'injuries',
  'food',
  'workout',
  'medical',
  'supplements',
  'progress',
  'conversations',
];

export class ManageMemoriesUseCase {
  constructor(private readonly memoryRepo: MemoryRepository) {}

  async list(userId: string): Promise<MemoryListResponse> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    return await this.memoryRepo.listMemories(userId);
  }

  async create(
    userId: string,
    input: {
      category: MemoryCategory;
      text: string;
      source?: string;
      sensitive?: boolean;
      status?: MemoryStatus;
    },
  ): Promise<MemoryItem> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!input.text?.trim()) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Memory text is required.');
    }
    if (!VALID_CATEGORIES.includes(input.category)) {
      throw new AppError('validation', 'VALIDATION_FAILED', `Invalid category: ${input.category}`);
    }

    return await this.memoryRepo.createMemory(userId, input);
  }

  async update(userId: string, memoryId: string, text: string): Promise<MemoryItem> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!text?.trim()) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Memory text cannot be empty.');
    }

    const updated = await this.memoryRepo.updateMemory(userId, memoryId, text);
    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', 'Memory item not found.');
    }
    return updated;
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const deleted = await this.memoryRepo.deleteMemory(userId, memoryId);
    if (!deleted) {
      throw new AppError('not_found', 'NOT_FOUND', 'Memory item not found.');
    }
  }

  async approveSuggestion(userId: string, memoryId: string): Promise<MemoryItem> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const updated = await this.memoryRepo.updateMemoryStatus(userId, memoryId, 'active');
    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', 'Suggestion not found.');
    }
    return updated;
  }

  async dismissSuggestion(userId: string, memoryId: string): Promise<void> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const deleted = await this.memoryRepo.deleteMemory(userId, memoryId);
    if (!deleted) {
      throw new AppError('not_found', 'NOT_FOUND', 'Suggestion not found.');
    }
  }

  async clearAll(userId: string): Promise<void> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    await this.memoryRepo.clearAll(userId);
  }

  async setMemoryEnabled(userId: string, enabled: boolean): Promise<{ enabled: boolean }> {
    if (!userId?.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }
    await this.memoryRepo.setMemoryEnabled(userId, enabled);
    return { enabled };
  }
}


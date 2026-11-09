import type {
  ChatMessageTurn,
  CoachResponse,
  CoachInsightsResponse,
  UserFitnessContext,
} from '../domain/coach.types.js';
import type {
  ConversationSummary,
  ConversationDetail,
  StoredChatMessage,
} from '../domain/coach-history.types.js';
import type {
  MemoryCategory,
  MemoryItem,
  MemoryListResponse,
  MemoryStatus,
} from '../domain/coach-memory.types.js';

export interface UserContextRepository {
  getUserFitnessContext(userId: string, timezone?: string): Promise<UserFitnessContext>;
}

export interface CoachChatService {
  generateCoachResponse(
    message: string,
    context: UserFitnessContext,
    history?: ChatMessageTurn[],
    memories?: string[],
  ): Promise<CoachResponse>;
}

export interface CoachInsightsService {
  generateInsights(
    context: UserFitnessContext,
    lang?: string,
  ): Promise<CoachInsightsResponse>;
}

export interface GeminiService extends CoachChatService, CoachInsightsService {}

export interface ConversationRepository {
  createConversation(userId: string, title: string, preview?: string): Promise<ConversationSummary>;
  listConversations(userId: string, limit: number, offset: number): Promise<{ conversations: ConversationSummary[]; total: number }>;
  getConversation(userId: string, conversationId: string): Promise<ConversationDetail | null>;
  updateConversation(userId: string, conversationId: string, updates: { title?: string; preview?: string }): Promise<ConversationSummary | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  addMessage(userId: string, conversationId: string, message: StoredChatMessage): Promise<void>;
  getMessages(userId: string, conversationId: string, limit?: number): Promise<StoredChatMessage[]>;
}

export interface MemoryRepository {
  listMemories(userId: string): Promise<MemoryListResponse>;
  getMemory(userId: string, memoryId: string): Promise<MemoryItem | null>;
  createMemory(
    userId: string,
    input: {
      category: MemoryCategory;
      text: string;
      source?: string;
      sensitive?: boolean;
      status?: MemoryStatus;
    },
  ): Promise<MemoryItem>;
  updateMemory(userId: string, memoryId: string, text: string): Promise<MemoryItem | null>;
  deleteMemory(userId: string, memoryId: string): Promise<boolean>;
  updateMemoryStatus(userId: string, memoryId: string, status: MemoryStatus): Promise<MemoryItem | null>;
  clearAll(userId: string): Promise<void>;
  isMemoryEnabled(userId: string): Promise<boolean>;
  setMemoryEnabled(userId: string, enabled: boolean): Promise<void>;
  getActiveMemoriesForContext(userId: string): Promise<string[]>;
}

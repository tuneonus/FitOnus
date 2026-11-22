import type {
  ChatMessageTurn,
  CoachResponse,
  CoachInsightsResponse,
  UserFitnessContext,
} from '../domain/coach.types.js';

export type { ChatMessageTurn };
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
import type { MemoryExtractionJob } from '../domain/extraction-job.types.js';

export interface UserContextRepository {
  getUserFitnessContext(userId: string, timezone?: string): Promise<UserFitnessContext>;
}

export interface KnowledgeContextPayloadItem {
  documentSlug: string;
  documentTitle: string;
  category: string;
  chunkIndex: number;
  content: string;
  citation: string;
}

export interface CoachChatService {
  generateCoachResponse(
    message: string,
    context: UserFitnessContext,
    history?: ChatMessageTurn[],
    memories?: string[],
    knowledge?: KnowledgeContextPayloadItem[],
  ): Promise<CoachResponse>;
}

export interface CoachInsightsService {
  generateInsights(
    context: UserFitnessContext,
    lang?: string,
  ): Promise<CoachInsightsResponse>;
}

/** Turns a spoken audio clip into text. Implemented by `PythonSpeechTranscriber` (the Python AI backend). */
export interface SpeechTranscriber {
  /** `userId` is the authenticated caller (from the server-side session, never from the request body). */
  transcribe(
    userId: string,
    audio: { mimeType: string; base64: string },
  ): Promise<{ transcript: string; detectedLanguage: string }>;
}

export interface GeminiService extends CoachChatService, CoachInsightsService {}

export interface ConversationRepository {
  createConversation(userId: string, title: string, preview?: string): Promise<ConversationSummary>;
  listConversations(userId: string, limit: number, offset: number): Promise<{ conversations: ConversationSummary[]; total: number }>;
  getConversation(userId: string, conversationId: string): Promise<ConversationDetail | null>;
  updateConversation(userId: string, conversationId: string, updates: { title?: string; preview?: string }): Promise<ConversationSummary | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  /**
   * Stores (or idempotently re-stores) a message of `userId` in one of their own conversations.
   * Never modifies a row owned by another user, conversation or role. Throws `not_found` when the
   * conversation is not the caller's and `conflict` when `message.id` is already taken by another row.
   */
  addMessage(userId: string, conversationId: string, message: StoredChatMessage): Promise<void>;
  getMessages(userId: string, conversationId: string, limit?: number): Promise<StoredChatMessage[]>;
  setMessageFeedback(userId: string, messageId: string, feedback: 'like' | 'dislike' | 'none'): Promise<boolean>;
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
      confidence?: number;
      sourceMessageId?: string | null;
      sourceConversationId?: string | null;
      expiresAt?: string | null;
    },
  ): Promise<MemoryItem>;
  updateMemory(userId: string, memoryId: string, text: string): Promise<MemoryItem | null>;
  deleteMemory(userId: string, memoryId: string): Promise<boolean>;
  updateMemoryStatus(userId: string, memoryId: string, status: MemoryStatus): Promise<MemoryItem | null>;
  dismissSuggestion(userId: string, memoryId: string): Promise<boolean>;
  clearAll(userId: string): Promise<void>;
  isMemoryEnabled(userId: string): Promise<boolean>;
  setMemoryEnabled(userId: string, enabled: boolean): Promise<void>;
  getActiveMemoriesForContext(userId: string, queryText?: string, maxTokens?: number): Promise<string[]>;
  getDismissedTexts(userId: string): Promise<string[]>;
}

export interface ExtractedCandidate {
  category: MemoryCategory;
  text: string;
  confidence: number;
  sensitive: boolean;
  sourceQuote: string;
  supersedesQuote?: string | null;
}

export interface MemoryExtractor {
  extract(
    userId: string,
    turns: ChatMessageTurn[],
    existingMemories: string[],
  ): Promise<ExtractedCandidate[]>;
}

export interface MemoryExtractionJobQueue {
  enqueue(userId: string, conversationId: string, messageId: string): Promise<void>;
  claimDue(limit: number, leaseSeconds: number): Promise<MemoryExtractionJob[]>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
  cancelForUser(userId: string): Promise<void>;
  isJobCancelled(jobId: string): Promise<boolean>;
  pruneOldJobs(olderThanDays?: number): Promise<number>;
}

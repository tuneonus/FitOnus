export type ExtractionJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface MemoryExtractionJob {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  status: ExtractionJobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

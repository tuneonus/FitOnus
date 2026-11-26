export type MemoryCategory =
  'goals' | 'injuries' | 'food' | 'workout' | 'medical' | 'supplements' | 'progress' | 'conversations';

export type MemoryStatus = 'active' | 'pending_approval' | 'dismissed' | 'archived' | 'superseded';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  text: string;
  source: string;
  sensitive: boolean;
  status: MemoryStatus;
  confidence?: number;
  sourceMessageId?: string | null;
  sourceConversationId?: string | null;
  expiresAt?: string | null;
  supersededById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryListResponse {
  enabled: boolean;
  items: MemoryItem[];
  suggestions: MemoryItem[];
}

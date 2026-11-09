export type MemoryCategory =
  | 'goals'
  | 'injuries'
  | 'food'
  | 'workout'
  | 'medical'
  | 'supplements'
  | 'progress'
  | 'conversations';

export type MemoryStatus = 'active' | 'pending_approval' | 'dismissed' | 'archived';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  text: string;
  source: string;
  sensitive: boolean;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryListResponse {
  enabled: boolean;
  items: MemoryItem[];
  suggestions: MemoryItem[];
}


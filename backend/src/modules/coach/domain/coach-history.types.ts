import type { Block } from './coach.types.js';

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  blocks?: Block[];
  sources?: string[];
  followUps?: string[];
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  preview: string;
  messages: StoredChatMessage[];
  createdAt: string;
  updatedAt: string;
}


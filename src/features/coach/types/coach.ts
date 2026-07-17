export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface FunctionCall {
  name: string;
  arguments: string; // JSON string
  result?: any;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string | null;
  functionCall?: FunctionCall;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
}

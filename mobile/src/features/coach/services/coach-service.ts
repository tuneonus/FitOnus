import type { ChatMessage, Conversation } from '../types/coach';
import { CoachApi } from '@/features/ai-coach/services/coach-api';
import { generateUUID } from '@/features/nutrition/utils/uuid';

/** Compatibility adapter for the existing Expo Router coach screens. */
export const CoachService = {
  async getConversations(): Promise<Conversation[]> {
    const { conversations } = await CoachApi.listConversations();
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      lastMessageAt: conversation.updatedAt,
    }));
  },
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    if (!conversationId) return [];
    const conversation = await CoachApi.getConversation(conversationId);
    return conversation.messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.text,
      timestamp: message.createdAt,
    }));
  },
  async sendMessage(
    conversationId: string,
    content: string,
    onChunk: (text: string) => void,
  ): Promise<ChatMessage> {
    const result = await CoachApi.sendMessage({
      message: content,
      ...(conversationId ? { conversationId } : {}),
      clientMessageId: generateUUID(),
    });
    onChunk(result.text || '');
    return {
      id: generateUUID(),
      conversationId: result.conversationId || conversationId,
      role: 'assistant',
      content: result.text || '',
      timestamp: new Date().toISOString(),
    };
  },
};

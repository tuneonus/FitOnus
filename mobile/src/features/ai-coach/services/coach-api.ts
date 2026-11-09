import { apiClient } from '@/services/api-client';
import type {
  CoachResponse,
  ConversationDetail,
  ConversationSummary,
} from '../types/coach';
import type {
  MemoryItem,
  MemoryCategory,
} from '../../ai-memory/store/memoryStore';
import { InsightsApi, type GetInsightsParams } from './insights-api';

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface SendCoachMessageParams {
  message: string;
  history?: ChatHistoryTurn[] | undefined;
  timezone?: string | undefined;
  conversationId?: string | undefined;
  clientMessageId?: string | undefined;
}

export interface MemoryListApiResponse {
  enabled: boolean;
  items: MemoryItem[];
  suggestions: MemoryItem[];
}

export { GetInsightsParams };

export const CoachApi = {
  sendMessage: async (params: SendCoachMessageParams): Promise<CoachResponse> => {
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      tz = 'UTC';
    }

    const response = await apiClient.post<{
      success: boolean;
      data: CoachResponse;
      message?: string;
    }>(
      '/coach/chat',
      {
        message: params.message,
        timezone: params.timezone || tz,
        history: params.history,
        conversationId: params.conversationId,
        clientMessageId: params.clientMessageId,
      },
      {
        timeout: 30_000,
      },
    );

    if (!response.data?.data) {
      throw new Error('Invalid response structure received from AI coach service.');
    }

    return response.data.data;
  },

  listConversations: async (
    page = 1,
    limit = 20,
  ): Promise<{ conversations: ConversationSummary[]; total: number; page: number; limit: number }> => {
    const response = await apiClient.get<{
      success: boolean;
      data: { conversations: ConversationSummary[]; total: number; page: number; limit: number };
    }>('/coach/conversations', {
      params: { page, limit },
    });
    return response.data.data;
  },

  createConversation: async (title?: string): Promise<ConversationSummary> => {
    const response = await apiClient.post<{
      success: boolean;
      data: ConversationSummary;
    }>('/coach/conversations', { title });
    return response.data.data;
  },

  getConversation: async (id: string): Promise<ConversationDetail> => {
    const response = await apiClient.get<{
      success: boolean;
      data: ConversationDetail;
    }>(`/coach/conversations/${id}`);
    return response.data.data;
  },

  renameConversation: async (id: string, title: string): Promise<ConversationSummary> => {
    const response = await apiClient.patch<{
      success: boolean;
      data: ConversationSummary;
    }>(`/coach/conversations/${id}`, { title });
    return response.data.data;
  },

  deleteConversation: async (id: string): Promise<boolean> => {
    const response = await apiClient.delete<{
      success: boolean;
      data: { success: boolean };
    }>(`/coach/conversations/${id}`);
    return Boolean(response.data?.data?.success);
  },

  // Memory Endpoints
  listMemories: async (): Promise<MemoryListApiResponse> => {
    const response = await apiClient.get<{
      success: boolean;
      data: MemoryListApiResponse;
    }>('/coach/memory');
    return response.data.data;
  },

  createMemory: async (data: {
    category: MemoryCategory;
    text: string;
    source?: string | undefined;
    sensitive?: boolean | undefined;
  }): Promise<MemoryItem> => {
    const response = await apiClient.post<{
      success: boolean;
      data: MemoryItem;
    }>('/coach/memory', data);
    return response.data.data;
  },

  updateMemory: async (id: string, text: string): Promise<MemoryItem> => {
    const response = await apiClient.patch<{
      success: boolean;
      data: MemoryItem;
    }>(`/coach/memory/${id}`, { text });
    return response.data.data;
  },

  deleteMemory: async (id: string): Promise<boolean> => {
    const response = await apiClient.delete<{
      success: boolean;
      data: { success: boolean };
    }>(`/coach/memory/${id}`);
    return Boolean(response.data?.data?.success);
  },

  approveMemorySuggestion: async (id: string): Promise<MemoryItem> => {
    const response = await apiClient.post<{
      success: boolean;
      data: MemoryItem;
    }>(`/coach/memory/${id}/approve`);
    return response.data.data;
  },

  dismissMemorySuggestion: async (id: string): Promise<boolean> => {
    const response = await apiClient.post<{
      success: boolean;
      data: { success: boolean };
    }>(`/coach/memory/${id}/dismiss`);
    return Boolean(response.data?.data?.success);
  },

  clearAllMemories: async (): Promise<boolean> => {
    const response = await apiClient.delete<{
      success: boolean;
      data: { success: boolean };
    }>('/coach/memory');
    return Boolean(response.data?.data?.success);
  },

  setMemorySettings: async (enabled: boolean): Promise<{ enabled: boolean }> => {
    const response = await apiClient.patch<{
      success: boolean;
      data: { enabled: boolean };
    }>('/coach/memory/settings', { enabled });
    return response.data.data;
  },

  /** @deprecated Use InsightsApi.getInsights directly */
  getInsights: InsightsApi.getInsights,
};

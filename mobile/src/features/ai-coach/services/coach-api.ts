import { apiClient, refreshAccessToken } from '@/services/api-client';
import { Config } from '@/constants/config';
import { SecureStorageService } from '@/services/secure-storage';
import type {
  CoachResponse,
  ConversationDetail,
  ConversationSummary,
} from '../types/coach';
import type { CoachStreamEvent, CoachStreamStage } from '../types/streaming';
import { openCoachSseStream } from './sse-client';
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

export interface StreamCoachMessageParams extends SendCoachMessageParams {
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
  fetchImpl?: typeof fetch | undefined;
  onEvent: (event: CoachStreamEvent) => void;
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

  streamMessage: async (params: StreamCoachMessageParams): Promise<void> => {
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      tz = 'UTC';
    }

    const endpoint = `${Config.API_BASE_URL.replace(/\/+$/, '')}/coach/chat/stream`;
    await openCoachSseStream({
      url: endpoint,
      body: {
        message: params.message,
        timezone: params.timezone || tz,
        history: params.history,
        conversationId: params.conversationId,
        clientMessageId: params.clientMessageId,
      },
      headers: params.idempotencyKey ? { 'Idempotency-Key': params.idempotencyKey } : undefined,
      getToken: () => SecureStorageService.getItem('auth.access_token'),
      refreshToken: () => refreshAccessToken().catch(() => null),
      signal: params.signal,
      timeoutMs: 30_000,
      fetchImpl: params.fetchImpl,
      onEvent: (raw) => {
        const type = typeof raw.type === 'string' ? raw.type : '';
        const traceId = typeof raw.traceId === 'string' ? raw.traceId : '';
        const seq = typeof raw.seq === 'number' ? raw.seq : 0;
        const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString();

        if (type === 'start') {
          params.onEvent({
            type: 'start',
            traceId,
            seq,
            model: typeof raw.model === 'string' ? raw.model : '',
            mode:
              raw.mode === 'agent_native' ||
              raw.mode === 'agent_langgraph' ||
              raw.mode === 'multi_agent'
                ? raw.mode
                : 'direct',
            conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : undefined,
            timestamp,
          });
          return;
        }
        if (type === 'status') {
          params.onEvent({
            type: 'status',
            traceId,
            seq,
            stage: (typeof raw.stage === 'string' ? raw.stage : 'agent_working') as CoachStreamStage,
            message: typeof raw.message === 'string' ? raw.message : 'Working on your reply...',
            toolName: typeof raw.toolName === 'string' ? raw.toolName : undefined,
            agentRole: typeof raw.agentRole === 'string' ? raw.agentRole : undefined,
            timestamp,
          });
          return;
        }
        if (type === 'delta' && typeof raw.textDelta === 'string') {
          params.onEvent({
            type: 'delta',
            traceId,
            seq,
            textDelta: raw.textDelta,
            timestamp,
          });
          return;
        }
        if (type === 'complete' && typeof raw.response === 'object' && raw.response !== null) {
          params.onEvent({
            type: 'complete',
            traceId,
            seq,
            response: raw.response as CoachResponse,
            timestamp,
          });
          return;
        }
        if (type === 'error') {
          params.onEvent({
            type: 'error',
            traceId,
            seq,
            code: typeof raw.code === 'string' ? raw.code : 'INTERNAL_ERROR',
            message:
              typeof raw.message === 'string'
                ? raw.message
                : 'An unexpected error occurred while streaming.',
            retryable: Boolean(raw.retryable),
            timestamp,
          });
          return;
        }
        if (type === 'heartbeat') {
          params.onEvent({ type: 'heartbeat', traceId, seq, timestamp });
        }
      },
    });
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


  setMessageFeedback: async (
    messageId: string,
    feedback: 'like' | 'dislike' | 'none',
  ): Promise<boolean> => {
    const response = await apiClient.patch<{
      success: boolean;
      data: { success: boolean };
    }>(`/coach/messages/${messageId}/feedback`, { feedback });
    return Boolean(response.data?.data?.success);
  },

  transcribeAudio: async (audio: {
    mimeType: string;
    base64: string;
  }): Promise<{ transcript: string; detectedLanguage: string }> => {
    const response = await apiClient.post<{
      success: boolean;
      data: { transcript: string; detectedLanguage: string };
    }>('/coach/transcribe', { audio }, { timeout: 35_000 });
    return response.data.data;
  },


  /** @deprecated Use InsightsApi.getInsights directly */
  getInsights: InsightsApi.getInsights,
};

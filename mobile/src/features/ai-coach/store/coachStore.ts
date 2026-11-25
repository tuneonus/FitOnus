import { captureUserSession, registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import type {
  ActionStatus,
  CoachMessage,
  CoachResponse,
  ConversationDetail,
  StoredChatMessage,
} from '../types/coach';
import { CoachApi, type ChatHistoryTurn } from '../services/coach-api';
import { SseStreamError } from '../services/sse-client';
import { isAiCoachStreamingEnabled } from '@/shared/constants/featureFlags';
import { speechService } from '../services/speech-service';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { normalizeMobileApiError } from '@/services/error-normalizer';

type CoachState = {
  conversationId: string | null;
  messages: CoachMessage[];
  busy: boolean;
  streaming: boolean;
  speakingMessageId: string | null;
  send: (text: string) => void;
  stopGeneration: () => void;
  retry: (assistantId: string) => void;
  toggleSpeech: (messageId: string, text: string) => Promise<void>;
  stopSpeech: () => Promise<void>;
  setFeedback: (messageId: string, feedback: 'like' | 'dislike' | 'none') => Promise<void>;
  setActionStatus: (
    messageId: string,
    actionId: string,
    status: ActionStatus,
    resultText?: string,
  ) => void;
  newConversation: () => void;
  setConversationId: (id: string | null) => void;
  addCompletedTurn: (userText: string, response: CoachResponse) => void;
  /** Resume a past conversation: loads real conversation messages or questions. */
  loadConversation: (
    convo: ConversationDetail | { id: string; messages: StoredChatMessage[] } | string[],
  ) => void;
};

let msgCounter = 0;
const newId = () => `msg-${Date.now()}-${++msgCounter}`;

let activeStreamController: AbortController | null = null;
let activeStreamRequestSeq = 0;

const NON_FALLBACK_STREAM_CODES = new Set([
  'AI_QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'INVALID_REQUEST',
  'SAFETY_BLOCKED',
  'UNAUTHENTICATED',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
]);

function normalizeFriendlyCoachError(err: unknown): string {
  if (err instanceof SseStreamError) {
    if (err.code === 'AI_QUOTA_EXCEEDED') {
      return 'AI coaching daily limit reached. Please try again tomorrow.';
    }
    if (err.code === 'PROVIDER_TIMEOUT' || err.code === 'DEADLINE_EXCEEDED') {
      return 'Request timed out. Please tap Try again.';
    }
    if (err.code === 'STREAM_CANCELLED') {
      return 'Generation stopped.';
    }
    if (err.message) return err.message;
  }

  const normalized = normalizeMobileApiError(err, 'Unable to reach coach right now. Please tap Try again.');
  let friendlyMessage = normalized.userMessage;

  if (normalized.code === 'AI_QUOTA_EXCEEDED') {
    friendlyMessage = 'AI coaching daily limit reached. Please try again tomorrow.';
  } else if (normalized.code === 'AI_UNAVAILABLE') {
    friendlyMessage = normalized.userMessage;
  } else if (normalized.isNetworkError) {
    friendlyMessage = 'Unable to connect. Check your internet connection.';
  } else if (normalized.isTimeout) {
    friendlyMessage = 'Request timed out. Please tap Try again.';
  } else if (!friendlyMessage || friendlyMessage.includes('status code 5')) {
    friendlyMessage = 'Unable to reach coach right now. Please tap Try again.';
  }
  return friendlyMessage;
}

async function sendToApi(
  set: (fn: (s: CoachState) => Partial<CoachState>) => void,
  get: () => CoachState,
  assistantId: string,
  userMessageId: string,
  question: string,
) {
  const session = captureUserSession();
  const offline = useHealthStore.getState().status === 'offline';
  if (offline) {
    set((s) => ({
      busy: false,
      streaming: false,
      messages: s.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              status: 'error' as const,
              text: 'You are offline. Connect to the internet to chat with your coach.',
            }
          : m,
      ),
    }));
    return;
  }

  const msgs = get().messages;
  const history: ChatHistoryTurn[] = msgs
    .filter((m) => m.status === 'done' && m.id !== assistantId && m.text)
    .slice(-6)
    .map((m) => ({
      role: m.role,
      text: m.text!,
    }));

  const currentConvoId = get().conversationId ?? undefined;
  const requestSeq = ++activeStreamRequestSeq;

  const isStaleSession = (): boolean =>
    !session.isCurrent() ||
    activeStreamRequestSeq !== requestSeq ||
    (get().conversationId !== currentConvoId &&
      currentConvoId !== undefined &&
      get().conversationId !== null) ||
    !get().messages.some((message) => message.id === assistantId);

  const runNonStreamingFallback = async (): Promise<void> => {
    const response = await CoachApi.sendMessage({
      message: question,
      history,
      conversationId: currentConvoId,
      clientMessageId: userMessageId,
    });

    if (isStaleSession()) return;
    set((s) => ({
      busy: false,
      streaming: false,
      conversationId: response.conversationId || s.conversationId,
      messages: s.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              ...response,
              status: 'done' as const,
              statusMessage: undefined,
              isPartial: false,
            }
          : m,
      ),
    }));
  };

  if (!isAiCoachStreamingEnabled()) {
    try {
      await runNonStreamingFallback();
    } catch (err: unknown) {
      if (!session.isCurrent() || activeStreamRequestSeq !== requestSeq) return;
      const friendlyMessage = normalizeFriendlyCoachError(err);
      set((s) => ({
        busy: false,
        streaming: false,
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                status: 'error' as const,
                text: friendlyMessage,
              }
            : m,
        ),
      }));
    }
    return;
  }

  const controller = new AbortController();
  activeStreamController = controller;
  set(() => ({ streaming: true }));

  let receivedAnyDelta = false;
  let receivedComplete = false;
  let streamedText = '';
  let streamErrorEvent: SseStreamError | null = null;
  let latestStreamConvoId = currentConvoId;

  const isStaleStream = (): boolean =>
    !session.isCurrent() ||
    activeStreamRequestSeq !== requestSeq ||
    !get().messages.some((message) => message.id === assistantId);

  try {
    await CoachApi.streamMessage({
      message: question,
      history,
      conversationId: currentConvoId,
      clientMessageId: userMessageId,
      idempotencyKey: `coach-${userMessageId}`,
      signal: controller.signal,
      onEvent: (event) => {
        if (isStaleStream()) return;

        if (event.type === 'start') {
          if (event.conversationId) {
            latestStreamConvoId = event.conversationId;
            set((s) => ({ conversationId: event.conversationId || s.conversationId }));
          }
          return;
        }

        if (event.type === 'status') {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    statusMessage: event.message,
                  }
                : m,
            ),
          }));
          return;
        }

        if (event.type === 'delta') {
          receivedAnyDelta = true;
          streamedText += event.textDelta;
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    status: 'streaming' as const,
                    text: streamedText,
                    statusMessage: undefined,
                    isPartial: false,
                  }
                : m,
            ),
          }));
          return;
        }

        if (event.type === 'complete') {
          receivedComplete = true;
          set((s) => ({
            busy: false,
            streaming: false,
            conversationId: event.response.conversationId || latestStreamConvoId || s.conversationId,
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    ...event.response,
                    status: 'done' as const,
                    statusMessage: undefined,
                    isPartial: false,
                  }
                : m,
            ),
          }));
          return;
        }

        if (event.type === 'error') {
          streamErrorEvent = new SseStreamError(event.code, event.message, {
            retryable: event.retryable,
          });
        }
      },
    });

    if (streamErrorEvent) {
      throw streamErrorEvent;
    }

    if (!receivedComplete) {
      if (controller.signal.aborted) {
        throw new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', { retryable: false });
      }
      throw new SseStreamError(
        'STREAM_INTERRUPTED',
        'Connection interrupted before completion.',
        { retryable: true },
      );
    }
  } catch (err: unknown) {
    if (isStaleStream()) return;

    const sseErr = err instanceof SseStreamError ? err : null;
    const isCancelled = controller.signal.aborted || sseErr?.code === 'STREAM_CANCELLED';

    if (isCancelled) {
      if (receivedAnyDelta && streamedText.trim().length > 0) {
        set((s) => ({
          busy: false,
          streaming: false,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: 'done' as const,
                  text: streamedText,
                  statusMessage: undefined,
                  isPartial: true,
                }
              : m,
          ),
        }));
      } else {
        set((s) => ({
          busy: false,
          streaming: false,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: 'error' as const,
                  text: 'Generation stopped.',
                  statusMessage: undefined,
                  isPartial: false,
                }
              : m,
          ),
        }));
      }
      return;
    }

    const code = sseErr?.code ?? '';
    const canFallback =
      !receivedAnyDelta &&
      !NON_FALLBACK_STREAM_CODES.has(code) &&
      (sseErr === null ||
        sseErr.status === 404 ||
        sseErr.status === 422 ||
        sseErr.status === 501 ||
        sseErr.status === 502 ||
        sseErr.status === 503 ||
        code === 'FEATURE_DISABLED' ||
        code === 'STREAM_UNSUPPORTED' ||
        code === 'STREAM_INTERRUPTED' ||
        code === 'INTERNAL_ERROR');

    if (canFallback) {
      try {
        set((s) => ({
          streaming: false,
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? { ...m, status: 'thinking' as const, statusMessage: 'Completing response...' }
              : m,
          ),
        }));
        await runNonStreamingFallback();
        return;
      } catch (fallbackErr: unknown) {
        err = fallbackErr;
      }
    }

    if (isStaleStream()) return;
    const friendlyMessage = normalizeFriendlyCoachError(err);
    set((s) => ({
      busy: false,
      streaming: false,
      messages: s.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              status: 'error' as const,
              text: receivedAnyDelta && streamedText.trim().length > 0 ? streamedText : friendlyMessage,
              statusMessage: receivedAnyDelta && streamedText.trim().length > 0 ? friendlyMessage : undefined,
              isPartial: receivedAnyDelta && streamedText.trim().length > 0,
            }
          : m,
      ),
    }));
  } finally {
    if (activeStreamController === controller) {
      activeStreamController = null;
    }
    set(() => ({ streaming: false }));
  }
}

export const useCoachStore = create<CoachState>((set, get) => ({
  conversationId: null,
  messages: [],
  busy: false,
  streaming: false,
  speakingMessageId: null,
  setConversationId: (conversationId) => set({ conversationId }),
  stopGeneration: () => {
    activeStreamController?.abort();
    set({ streaming: false });
  },
  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().busy) return;
    const assistantId = newId();
    const userMessageId = newId();

    const assistantMsg: CoachMessage = {
      id: assistantId,
      role: 'assistant',
      status: 'thinking',
    };
    const userMsg: CoachMessage = {
      id: userMessageId,
      role: 'user',
      text: trimmed,
      status: 'done',
    };

    set((s) => ({
      busy: true,
      messages: [...s.messages, userMsg, assistantMsg],
    }));

    void sendToApi(set, get, assistantId, userMessageId, trimmed);
  },
  addCompletedTurn: (userText, response) => {
    const userMsg: CoachMessage = {
      id: newId(),
      role: 'user',
      text: userText,
      status: 'done',
    };
    const assistantMsg: CoachMessage = {
      id: newId(),
      role: 'assistant',
      text: response.text,
      status: 'done',
      blocks: response.blocks,
      sources: response.sources,
      followUps: response.followUps,
    };
    set((s) => ({
      conversationId: response.conversationId || s.conversationId,
      messages: [...s.messages, userMsg, assistantMsg],
    }));
  },
  retry: (assistantId) => {
    if (get().busy) return;
    const msgs = get().messages;
    const idx = msgs.findIndex((m) => m.id === assistantId);
    const userMsg = msgs
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === 'user');
    const question = userMsg?.text;
    const userMsgId = userMsg?.id || newId();
    if (!question) return;

    set((s) => ({
      busy: true,
      messages: s.messages.map((m) =>
        m.id === assistantId ? { ...m, status: 'thinking', text: undefined } : m,
      ),
    }));

    void sendToApi(set, get, assistantId, userMsgId, question);
  },
  toggleSpeech: async (messageId: string, text: string) => {
    const currentSpeaking = get().speakingMessageId;
    if (currentSpeaking === messageId) {
      await speechService.stop();
      set({ speakingMessageId: null });
      return;
    }

    set({ speakingMessageId: messageId });
    await speechService.speak(messageId, text, {
      onDone: () => {
        if (get().speakingMessageId === messageId) {
          set({ speakingMessageId: null });
        }
      },
      onError: () => {
        if (get().speakingMessageId === messageId) {
          set({ speakingMessageId: null });
        }
      },
    });
  },
  stopSpeech: async () => {
    await speechService.stop();
    set({ speakingMessageId: null });
  },
  setFeedback: async (messageId: string, feedback: 'like' | 'dislike' | 'none') => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, feedback } : m,
      ),
    }));
    try {
      await CoachApi.setMessageFeedback(messageId, feedback);
    } catch {
      // Optimistic update retained; non-blocking
    }
  },
  setActionStatus: (messageId, actionId, status, resultText) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              blocks: m.blocks?.map((b) =>
                b.type === 'action' && b.id === actionId ? { ...b, status, resultText } : b,
              ),
            }
          : m,
      ),
    })),
  newConversation: () => {
    activeStreamController?.abort();
    activeStreamController = null;
    activeStreamRequestSeq += 1;
    void speechService.stop();
    set({
      conversationId: null,
      messages: [],
      busy: false,
      streaming: false,
      speakingMessageId: null,
    });
  },
  loadConversation: (convo) => {
    activeStreamController?.abort();
    activeStreamController = null;
    activeStreamRequestSeq += 1;
    void speechService.stop();
    if (Array.isArray(convo)) {
      // Legacy string array fallback
      set({
        busy: false,
        streaming: false,
        speakingMessageId: null,
        messages: convo.map((q) => ({
          id: newId(),
          role: 'user' as const,
          text: q,
          status: 'done' as const,
        })),
      });
      return;
    }

    const messages: CoachMessage[] = convo.messages.map((m) => ({
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      text: m.text,
      blocks: m.blocks,
      sources: m.sources,
      followUps: m.followUps,
      feedback: m.feedback,
      status: 'done' as const,
    }));

    set({
      conversationId: convo.id,
      busy: false,
      streaming: false,
      speakingMessageId: null,
      messages,
    });
  },
}));

registerUserStore(useCoachStore);

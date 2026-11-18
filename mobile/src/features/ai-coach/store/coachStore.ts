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
import { speechService } from '../services/speech-service';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { normalizeMobileApiError } from '@/services/error-normalizer';

type CoachState = {
  conversationId: string | null;
  messages: CoachMessage[];
  busy: boolean;
  speakingMessageId: string | null;
  send: (text: string) => void;
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

  // Collect previous messages for conversational context
  const msgs = get().messages;
  const history: ChatHistoryTurn[] = msgs
    .filter((m) => m.status === 'done' && m.id !== assistantId && m.text)
    .slice(-6)
    .map((m) => ({
      role: m.role,
      text: m.text!,
    }));

  const currentConvoId = get().conversationId ?? undefined;

  try {
    const response = await CoachApi.sendMessage({
      message: question,
      history,
      conversationId: currentConvoId,
      clientMessageId: userMessageId,
    });

    if (
      !session.isCurrent() ||
      (get().conversationId !== currentConvoId && get().conversationId != null)
    )
      return;
    if (!get().messages.some((message) => message.id === assistantId)) return;
    set((s) => ({
      busy: false,
      conversationId: response.conversationId || s.conversationId,
      messages: s.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              ...response,
              status: 'done' as const,
            }
          : m,
      ),
    }));
  } catch (err: unknown) {
    if (!session.isCurrent()) return;
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

    set((s) => ({
      busy: false,
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
}

export const useCoachStore = create<CoachState>((set, get) => ({
  conversationId: null,
  messages: [],
  busy: false,
  speakingMessageId: null,
  setConversationId: (conversationId) => set({ conversationId }),
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
    void speechService.stop();
    set({ conversationId: null, messages: [], busy: false, speakingMessageId: null });
  },
  loadConversation: (convo) => {
    void speechService.stop();
    if (Array.isArray(convo)) {
      // Legacy string array fallback
      set({
        busy: false,
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
      speakingMessageId: null,
      messages,
    });
  },
}));

registerUserStore(useCoachStore);

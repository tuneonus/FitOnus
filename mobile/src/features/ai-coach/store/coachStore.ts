import { captureUserSession, registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import type {
  ActionStatus,
  CoachMessage,
  ConversationDetail,
  StoredChatMessage,
} from '../types/coach';
import { CoachApi, type ChatHistoryTurn } from '../services/coach-api';
import { useHealthStore } from '../../health-integration/store/healthStore';

type CoachState = {
  conversationId: string | null;
  messages: CoachMessage[];
  busy: boolean;
  send: (text: string) => void;
  retry: (assistantId: string) => void;
  setActionStatus: (
    messageId: string,
    actionId: string,
    status: ActionStatus,
    resultText?: string,
  ) => void;
  newConversation: () => void;
  setConversationId: (id: string | null) => void;
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
    const errorData = (err as any)?.response?.data;
    const errorMessage =
      errorData?.error?.message ||
      errorData?.message ||
      (err instanceof Error ? err.message : 'Unable to reach coach right now. Please try again.');

    set((s) => ({
      busy: false,
      messages: s.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              status: 'error' as const,
              text: errorMessage,
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
  retry: (assistantId) => {
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
  newConversation: () => set({ conversationId: null, messages: [], busy: false }),
  loadConversation: (convo) => {
    if (Array.isArray(convo)) {
      // Legacy string array fallback
      set({
        busy: false,
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
      status: 'done' as const,
    }));

    set({
      conversationId: convo.id,
      busy: false,
      messages,
    });
  },
}));

registerUserStore(useCoachStore);

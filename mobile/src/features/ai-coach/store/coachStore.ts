import { create } from 'zustand';
import type { ActionStatus, CoachMessage } from '../types/coach';
import { buildCoachResponse } from '../services/mockCoachEngine';
import { useHealthStore } from '../../health-integration/store/healthStore';

type CoachState = {
  messages: CoachMessage[];
  busy: boolean;
  send: (text: string) => void;
  retry: (assistantId: string) => void;
  setActionStatus: (messageId: string, actionId: string, status: ActionStatus, resultText?: string) => void;
  newConversation: () => void;
  /** Resume a past conversation: rebuilds its turns so the user can keep asking. */
  loadConversation: (questions: string[]) => void;
};

let msgCounter = 0;
const newId = () => `msg-${Date.now()}-${++msgCounter}`;

function respond(set: (fn: (s: CoachState) => Partial<CoachState>) => void, assistantId: string, question: string) {
  setTimeout(() => {
    const offline = useHealthStore.getState().status === 'offline';
    set((s) => ({
      busy: false,
      messages: s.messages.map((m) =>
      m.id === assistantId ?
      offline ?
      { ...m, status: 'error' as const, text: 'I couldn’t reach the coaching service. Check your connection and try again.' } :
      { ...m, ...buildCoachResponse(question), status: 'done' as const } :
      m
      )
    }));
  }, 1700);
}

export const useCoachStore = create<CoachState>((set, get) => ({
  messages: [],
  busy: false,
  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().busy) return;
    const assistantId = newId();
    const preview = buildCoachResponse(trimmed);
    const assistantMsg: CoachMessage = { id: assistantId, role: 'assistant', status: 'thinking', toolCalls: preview.toolCalls };
    const userMsg: CoachMessage = { id: newId(), role: 'user', text: trimmed, status: 'done' };
    set((s) => ({
      busy: true,
      messages: [...s.messages, userMsg, assistantMsg]
    }));
    respond(set, assistantId, trimmed);
  },
  retry: (assistantId) => {
    const msgs = get().messages;
    const idx = msgs.findIndex((m) => m.id === assistantId);
    const question = msgs.
    slice(0, idx).
    reverse().
    find((m) => m.role === 'user')?.text;
    if (!question) return;
    set((s) => ({
      busy: true,
      messages: s.messages.map((m) => m.id === assistantId ? { ...m, status: 'thinking', text: undefined } : m)
    }));
    respond(set, assistantId, question);
  },
  setActionStatus: (messageId, actionId, status, resultText) =>
  set((s) => ({
    messages: s.messages.map((m) =>
    m.id === messageId ?
    {
      ...m,
      blocks: m.blocks?.map((b) => b.type === 'action' && b.id === actionId ? { ...b, status, resultText } : b)
    } :
    m
    )
  })),
  newConversation: () => set({ messages: [], busy: false }),
  loadConversation: (questions) =>
  set({
    busy: false,
    messages: questions.flatMap((q) => {
      const reply = buildCoachResponse(q);
      return [
      { id: newId(), role: 'user' as const, text: q, status: 'done' as const },
      {
        id: newId(),
        role: 'assistant' as const,
        status: 'done' as const,
        ...reply,
        // Past write actions are shown as not re-run; the user must ask again to repeat them.
        blocks: reply.blocks?.map((b) => b.type === 'action' ? { ...b, status: 'cancelled' as const, resultText: 'From a past conversation — ask again to run it' } : b)
      }];

    })
  })
}));
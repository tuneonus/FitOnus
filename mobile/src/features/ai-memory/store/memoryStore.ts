import { create } from 'zustand';
import { CoachApi } from '../../ai-coach/services/coach-api';

export type MemoryCategory =
  | 'goals'
  | 'injuries'
  | 'food'
  | 'workout'
  | 'medical'
  | 'supplements'
  | 'progress'
  | 'conversations';

export type MemoryItem = {
  id: string;
  category: MemoryCategory;
  text: string;
  source: string;
  savedOn?: string | undefined;
  sensitive?: boolean | undefined;
  createdAt?: string | undefined;
};

export type MemorySuggestion = {
  id: string;
  category: MemoryCategory;
  text: string;
  from: string;
  sensitive?: boolean | undefined;
};

type MemoryState = {
  enabled: boolean;
  useSensitive: boolean;
  loading: boolean;
  items: MemoryItem[];
  suggestions: MemorySuggestion[];
  fetchMemories: () => Promise<void>;
  setEnabled: (v: boolean) => Promise<void>;
  setUseSensitive: (v: boolean) => void;
  updateItem: (id: string, text: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  restoreItem: (item: MemoryItem) => Promise<void>;
  clearAll: () => Promise<void>;
  approveSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
};

export const useMemoryStore = create<MemoryState>((set, get) => ({
  enabled: true,
  useSensitive: true,
  loading: false,
  items: [],
  suggestions: [],

  fetchMemories: async () => {
    try {
      set({ loading: true });
      const res = await CoachApi.listMemories();

      const items: MemoryItem[] = (res.items || []).map((i) => ({
        id: i.id,
        category: i.category,
        text: i.text,
        source: i.source || 'Conversation',
        savedOn: i.createdAt
          ? new Date(i.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : undefined,
        sensitive: i.sensitive,
        createdAt: i.createdAt,
      }));

      const suggestions: MemorySuggestion[] = (res.suggestions || []).map((s) => ({
        id: s.id,
        category: s.category,
        text: s.text,
        from: s.source || 'Conversation',
        sensitive: s.sensitive,
      }));

      set({
        enabled: res.enabled !== false,
        items,
        suggestions,
      });
    } catch {
      // Leave existing state on network error
    } finally {
      set({ loading: false });
    }
  },

  setEnabled: async (enabled) => {
    set({ enabled });
    try {
      await CoachApi.setMemorySettings(enabled);
    } catch {
      // Revert on failure
      set({ enabled: !enabled });
    }
  },

  setUseSensitive: (useSensitive) => set({ useSensitive }),

  updateItem: async (id, text) => {
    const prevItems = get().items;
    set({ items: prevItems.map((i) => (i.id === id ? { ...i, text } : i)) });
    try {
      await CoachApi.updateMemory(id, text);
    } catch {
      set({ items: prevItems });
    }
  },

  deleteItem: async (id) => {
    const prevItems = get().items;
    set({ items: prevItems.filter((i) => i.id !== id) });
    try {
      await CoachApi.deleteMemory(id);
    } catch {
      set({ items: prevItems });
    }
  },

  restoreItem: async (item) => {
    set({ items: [item, ...get().items] });
    try {
      await CoachApi.createMemory({
        category: item.category,
        text: item.text,
        source: item.source,
        sensitive: item.sensitive,
      });
    } catch {
      // keep local item
    }
  },

  clearAll: async () => {
    const prevItems = get().items;
    const prevSuggestions = get().suggestions;
    set({ items: [], suggestions: [] });
    try {
      await CoachApi.clearAllMemories();
    } catch {
      set({ items: prevItems, suggestions: prevSuggestions });
    }
  },

  approveSuggestion: async (id) => {
    const s = get().suggestions.find((x) => x.id === id);
    if (!s) return;
    set({
      suggestions: get().suggestions.filter((x) => x.id !== id),
      items: [
        {
          id: s.id,
          category: s.category,
          text: s.text,
          source: s.from,
          savedOn: 'Today',
          sensitive: s.sensitive,
        },
        ...get().items,
      ],
    });
    try {
      await CoachApi.approveMemorySuggestion(id);
    } catch {
      // Handled
    }
  },

  dismissSuggestion: async (id) => {
    set({ suggestions: get().suggestions.filter((x) => x.id !== id) });
    try {
      await CoachApi.dismissMemorySuggestion(id);
    } catch {
      // Handled
    }
  },
}));

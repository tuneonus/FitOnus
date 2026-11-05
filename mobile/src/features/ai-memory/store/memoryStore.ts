import { create } from 'zustand';

export type MemoryCategory =
'goals' |
'injuries' |
'food' |
'workout' |
'medical' |
'supplements' |
'progress' |
'conversations';

export type MemoryItem = {
  id: string;
  category: MemoryCategory;
  text: string;
  source: string;
  savedOn: string;
  sensitive?: boolean;
};

export type MemorySuggestion = {id: string;category: MemoryCategory;text: string;from: string;sensitive?: boolean;};

type MemoryState = {
  enabled: boolean;
  useSensitive: boolean;
  items: MemoryItem[];
  suggestions: MemorySuggestion[];
  setEnabled: (v: boolean) => void;
  setUseSensitive: (v: boolean) => void;
  updateItem: (id: string, text: string) => void;
  deleteItem: (id: string) => void;
  restoreItem: (item: MemoryItem) => void;
  clearAll: () => void;
  approveSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
};

const initialItems: MemoryItem[] = [
{ id: 'mem1', category: 'goals', text: 'Wants to reach 75 kg by end of January while keeping bench strength.', source: 'Onboarding', savedOn: 'Sep 2' },
{ id: 'mem2', category: 'food', text: 'Eggetarian — eats eggs and dairy, no meat or fish.', source: 'Onboarding', savedOn: 'Sep 2' },
{ id: 'mem3', category: 'food', text: 'Prefers North and South Indian food. Dislikes oats with milk.', source: 'Chat · Sep 14', savedOn: 'Sep 14' },
{ id: 'mem4', category: 'workout', text: 'Trains at a gym 5 days a week, ~60 minutes, early mornings.', source: 'Onboarding', savedOn: 'Sep 2' },
{ id: 'mem5', category: 'workout', text: 'Prefers barbell compounds over machines.', source: 'Chat · Sep 20', savedOn: 'Sep 20' },
{ id: 'mem6', category: 'injuries', text: 'Mild left-shoulder discomfort on overhead pressing (Aug). Avoid behind-the-neck movements.', source: 'Chat · Aug 28', savedOn: 'Aug 28', sensitive: true },
{ id: 'mem7', category: 'supplements', text: 'Takes whey isolate (1 scoop post-workout) and creatine 5 g daily.', source: 'Chat · Sep 9', savedOn: 'Sep 9' },
{ id: 'mem8', category: 'progress', text: 'Bench press PR 72.5 kg × 6 on Oct 5. Squat 100 kg × 5.', source: 'Workout logs', savedOn: 'Oct 5' },
{ id: 'mem9', category: 'conversations', text: 'Asked about late-night cravings — agreed to try a 200 kcal evening snack.', source: 'Chat · Oct 2', savedOn: 'Oct 2' }];


export const useMemoryStore = create<MemoryState>((set, get) => ({
  enabled: true,
  useSensitive: true,
  items: initialItems,
  suggestions: [
  { id: 's1', category: 'medical', text: 'Mentioned a family history of high blood pressure.', from: 'Chat · Oct 7', sensitive: true },
  { id: 's2', category: 'food', text: 'Fasts on Tuesdays — light dinner only.', from: 'Chat · Oct 6' }],

  setEnabled: (enabled) => set({ enabled }),
  setUseSensitive: (useSensitive) => set({ useSensitive }),
  updateItem: (id, text) => set({ items: get().items.map((i) => i.id === id ? { ...i, text } : i) }),
  deleteItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
  restoreItem: (item) => set({ items: [item, ...get().items] }),
  clearAll: () => set({ items: [], suggestions: [] }),
  approveSuggestion: (id) => {
    const s = get().suggestions.find((x) => x.id === id);
    if (!s) return;
    set({
      suggestions: get().suggestions.filter((x) => x.id !== id),
      items: [{ id: `mem-${Date.now()}`, category: s.category, text: s.text, source: s.from, savedOn: 'Oct 9', ...(s.sensitive !== undefined ? { sensitive: s.sensitive } : {}) }, ...get().items]
    });
  },
  dismissSuggestion: (id) => set({ suggestions: get().suggestions.filter((x) => x.id !== id) })
}));
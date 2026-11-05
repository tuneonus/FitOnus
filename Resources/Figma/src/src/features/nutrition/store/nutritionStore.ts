import { create } from 'zustand';
import type { FoodItem, MealEntry, Nutrients } from '../types/nutrition';
import { initialMealEntries } from '../data/foodsMock';

type NutritionState = {
  entries: MealEntry[];
  pendingAnalysis: FoodItem[] | null;
  addEntry: (entry: Omit<MealEntry, 'id'>) => string;
  removeEntry: (id: string) => void;
  restoreEntry: (entry: MealEntry) => void;
  removeItem: (entryId: string, itemId: string) => void;
  scaleItem: (entryId: string, itemId: string, factor: number) => void;
  setPendingAnalysis: (items: FoodItem[] | null) => void;
};

let entryCounter = 0;

export const useNutritionStore = create<NutritionState>((set, get) => ({
  entries: initialMealEntries,
  pendingAnalysis: null,
  addEntry: (entry) => {
    const id = `m-${Date.now()}-${++entryCounter}`;
    set({ entries: [...get().entries, { ...entry, id }] });
    return id;
  },
  removeEntry: (id) => set({ entries: get().entries.filter((e) => e.id !== id) }),
  restoreEntry: (entry) => set({ entries: [...get().entries, entry] }),
  removeItem: (entryId, itemId) =>
  set({
    entries: get().
    entries.map((e) => e.id === entryId ? { ...e, items: e.items.filter((i) => i.id !== itemId) } : e).
    filter((e) => e.items.length > 0)
  }),
  scaleItem: (entryId, itemId, factor) =>
  set({
    entries: get().entries.map((e) =>
    e.id === entryId ? { ...e, items: e.items.map((i) => i.id === itemId ? scaleFood(i, factor) : i) } : e
    )
  }),
  setPendingAnalysis: (pendingAnalysis) => set({ pendingAnalysis })
}));

export function scaleFood(item: FoodItem, factor: number): FoodItem {
  const r = (n: number) => Math.round(n * factor * 10) / 10;
  return {
    ...item,
    kcal: Math.round(item.kcal * factor),
    protein: r(item.protein),
    carbs: r(item.carbs),
    fat: r(item.fat),
    fiber: r(item.fiber),
    serving: factor === 1 ? item.serving : `${factor}× ${item.serving.replace(/^[\d.]+× /, '')}`
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
      fiber: acc.fiber + i.fiber
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

export const useDailyTotals = () =>
sumNutrients(useNutritionStore((s) => s.entries).flatMap((e) => e.items));
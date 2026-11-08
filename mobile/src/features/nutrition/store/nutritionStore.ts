import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CreateCustomFoodInput,
  DailyNutritionView,
  EntryMethod,
  FoodItem,
  LogMealInput,
  MealEntry,
  MealType,
  Nutrients,
  UpdateMealInput,
} from '../types/nutrition';
import { toDbMealType } from '../types/nutrition';
import { nutritionApi } from '../api/nutrition-api';
import { nutritionOfflineSync } from '../services/nutrition-offline-sync';
import { calculatePortionNutrients, mapBackendMealToMealEntry } from '../utils/nutrition-calculator';
import { generateUUID } from '../utils/uuid';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { queryClient } from '@/providers/query-provider';
import { logger } from '@/utils/logger';

function getCacheKey(): string {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `@fitonus:nutrition_state_cache:${userId}` : '@fitonus:nutrition_state_cache';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

let lastWaterLogTime = 0;
let lastWaterLogAmount = 0;
let lastWaterLogId = '';

export type NutritionState = {
  // Existing state fields preserved
  entries: MealEntry[];
  pendingAnalysis: FoodItem[] | null;

  // Real backend & offline fields
  selectedDate: string;
  dailySummary: DailyNutritionView | null;
  waterMl: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  pendingSyncCount: number;
  favorites: FoodItem[];
  recentFoods: FoodItem[];

  // Existing methods preserved
  addEntry: (entry: Omit<MealEntry, 'id'>) => string;
  removeEntry: (id: string) => void;
  restoreEntry: (entry: MealEntry) => void;
  removeItem: (entryId: string, itemId: string) => void;
  scaleItem: (entryId: string, itemId: string, factor: number) => void;
  setPendingAnalysis: (items: FoodItem[] | null) => void;

  // Real-world actions
  setSelectedDate: (date: string) => void;
  fetchDailyNutrition: (date?: string, isRefresh?: boolean) => Promise<void>;
  logMeal: (params: {
    mealType: MealType;
    items: FoodItem[];
    notes?: string;
    method?: EntryMethod;
  }) => Promise<string>;
  updateMeal: (mealId: string, items: FoodItem[], notes?: string) => Promise<void>;
  logWater: (amountMl: number) => Promise<string>;
  toggleFavorite: (food: FoodItem) => Promise<boolean>;
  createCustomFood: (input: CreateCustomFoodInput) => Promise<FoodItem>;
  fetchFavorites: () => Promise<void>;
  fetchRecentFoods: () => Promise<void>;
  refreshPendingSyncCount: () => Promise<number>;
  syncPendingMutations: () => Promise<void>;
  resetStore: () => Promise<void>;
};

export const useNutritionStore = create<NutritionState>((set, get) => ({
  entries: [],
  pendingAnalysis: null,
  selectedDate: getTodayDateString(),
  dailySummary: null,
  waterMl: 0,
  isLoading: false,
  isRefreshing: false,
  error: null,
  pendingSyncCount: 0,
  favorites: [],
  recentFoods: [],

  // --- Synchronous existing actions ---

  addEntry: (entry) => {
    const id = generateUUID();
    const newEntry: MealEntry = { ...entry, id, isSynced: false };
    const updated = [...get().entries, newEntry];
    set({ entries: updated });
    saveCache(updated, get().waterMl, get().dailySummary);
    return id;
  },

  removeEntry: (id) => {
    const updated = get().entries.filter((e) => e.id !== id);
    set({ entries: updated });
    saveCache(updated, get().waterMl, get().dailySummary);
  },

  restoreEntry: (entry) => {
    const updated = [...get().entries, entry];
    set({ entries: updated });
    saveCache(updated, get().waterMl, get().dailySummary);
  },

  removeItem: (entryId, itemId) => {
    const current = get().entries.find((e) => e.id === entryId);
    const updated = get()
      .entries.map((e) =>
        e.id === entryId ? { ...e, items: e.items.filter((i) => i.id !== itemId) } : e
      )
      .filter((e) => e.items.length > 0);
    set({ entries: updated });
    saveCache(updated, get().waterMl, get().dailySummary);

    if (current && UUID_REGEX.test(entryId)) {
      const remainingItems = current.items.filter((i) => i.id !== itemId);
      if (remainingItems.length > 0) {
        void get().updateMeal(entryId, remainingItems, current.notes ?? undefined);
      }
    }
  },

  scaleItem: (entryId, itemId, factor) => {
    const current = get().entries.find((e) => e.id === entryId);
    const updated = get().entries.map((e) =>
      e.id === entryId
        ? {
            ...e,
            items: e.items.map((i) => (i.id === itemId ? scaleFood(i, factor) : i)),
          }
        : e
    );
    set({ entries: updated });
    saveCache(updated, get().waterMl, get().dailySummary);

    if (current && UUID_REGEX.test(entryId)) {
      const scaledItems = current.items.map((i) => (i.id === itemId ? scaleFood(i, factor) : i));
      void get().updateMeal(entryId, scaledItems, current.notes ?? undefined);
    }
  },

  setPendingAnalysis: (pendingAnalysis) => set({ pendingAnalysis }),

  setSelectedDate: (selectedDate) => {
    set({ selectedDate });
    get().fetchDailyNutrition(selectedDate);
  },

  // --- Real Backend Integration & Offline Actions ---

  fetchDailyNutrition: async (dateStr, isRefresh = false) => {
    const date = dateStr || get().selectedDate || getTodayDateString();
    set({ [isRefresh ? 'isRefreshing' : 'isLoading']: true, error: null });

    try {
      const summary = await nutritionApi.getDailyNutrition(date);
      const serverEntries: MealEntry[] = summary.meals.map(mapBackendMealToMealEntry);

      // Merge offline pending entries for this date if any
      const currentUnsynced = get().entries.filter((e) => !e.isSynced && (!e.date || e.date === date));
      const combined = [...serverEntries, ...currentUnsynced];

      set({
        dailySummary: summary,
        entries: combined,
        waterMl: summary.consumed.waterMl,
        isLoading: false,
        isRefreshing: false,
      });

      saveCache(combined, summary.consumed.waterMl, summary);
    } catch (err: any) {
      logger.warn('Failed to fetch daily nutrition from backend:', err?.message);
      set({
        isLoading: false,
        isRefreshing: false,
        error: err?.message || 'Unable to load nutrition data',
      });
      // Hydrate from cache if entries is empty
      await loadCache(set);
    } finally {
      get().refreshPendingSyncCount();
    }
  },

  logMeal: async ({ mealType, items, notes, method = 'search' }) => {
    const mealId = generateUUID();
    const date = get().selectedDate || getTodayDateString();
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const localEntry: MealEntry = {
      id: mealId,
      meal: mealType,
      time,
      method,
      items,
      date,
      notes: notes ?? null,
      isSynced: false,
    };

    // 1. Optimistic Local Update
    const updatedEntries = [...get().entries, localEntry];
    set({ entries: updatedEntries });
    saveCache(updatedEntries, get().waterMl, get().dailySummary);

    // 2. Prepare Backend Payload
    const payload: LogMealInput = {
      id: mealId,
      mealType: toDbMealType(mealType),
      date,
      notes: notes ?? null,
      items: items.map((it) => {
        const isServerFood = it.id && UUID_REGEX.test(it.id);
        return {
          foodId: isServerFood ? it.id : null,
          foodName: it.name,
          foodBrand: it.brand ?? null,
          servingSize: it.servingSize ?? 1,
          servingUnit: it.servingUnit ?? 'serving',
          servingWeightG: it.servingWeightG ?? 100,
          servingMultiplier: it.servingMultiplier ?? 1.0,
          calories: it.kcal,
          proteinG: it.protein,
          carbsG: it.carbs,
          fatG: it.fat,
          fiberG: it.fiber,
        };
      }),
    };

    // 3. Attempt direct API sync
    try {
      const serverMeal = await nutritionApi.logMeal(payload);
      // Replace optimistic entry with server-recalculated entry
      const syncedEntry = mapBackendMealToMealEntry(serverMeal);
      const finalized = get().entries.map((e) => (e.id === mealId ? syncedEntry : e));
      set({ entries: finalized });
      saveCache(finalized, get().waterMl, get().dailySummary);
      // Soft-refresh daily summary
      get().fetchDailyNutrition(date, true).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (error: any) {
      logger.info('Network submission failed, enqueuing meal for offline sync:', error?.message);
      await nutritionOfflineSync.enqueueMeal(payload);
      get().refreshPendingSyncCount();
    }

    return mealId;
  },

  updateMeal: async (mealId, items, notes) => {
    const date = get().selectedDate || getTodayDateString();
    const existing = get().entries.find((e) => e.id === mealId);
    if (!existing) return;

    const updatedEntry: MealEntry = {
      ...existing,
      items,
      notes: notes !== undefined ? notes : existing.notes,
    };

    const finalizedEntries = get().entries.map((e) => (e.id === mealId ? updatedEntry : e));
    set({ entries: finalizedEntries });
    saveCache(finalizedEntries, get().waterMl, get().dailySummary);

    if (UUID_REGEX.test(mealId)) {
      const payload: UpdateMealInput = {
        notes: notes !== undefined ? notes : existing.notes,
        items: items.map((it) => ({
          foodId: it.id && UUID_REGEX.test(it.id) ? it.id : null,
          foodName: it.name,
          foodBrand: it.brand ?? null,
          servingSize: it.servingSize ?? 1,
          servingUnit: it.servingUnit ?? 'serving',
          servingWeightG: it.servingWeightG ?? 100,
          servingMultiplier: it.servingMultiplier ?? 1.0,
          calories: it.kcal,
          proteinG: it.protein,
          carbsG: it.carbs,
          fatG: it.fat,
          fiberG: it.fiber,
        })),
      };

      try {
        await nutritionApi.updateMeal(mealId, payload);
        get().fetchDailyNutrition(date, true).catch(() => {});
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      } catch (err: any) {
        logger.warn('Failed to update meal on backend:', err?.message);
      }
    }
  },

  logWater: async (amountMl) => {
    const now = Date.now();
    if (now - lastWaterLogTime < 350 && lastWaterLogAmount === amountMl) {
      logger.info('Duplicate rapid water tap suppressed:', amountMl);
      return lastWaterLogId;
    }
    lastWaterLogTime = now;
    lastWaterLogAmount = amountMl;

    const waterId = generateUUID();
    lastWaterLogId = waterId;
    const date = get().selectedDate || getTodayDateString();
    const newTotal = get().waterMl + amountMl;

    // 1. Optimistic Update
    set({ waterMl: newTotal });
    saveCache(get().entries, newTotal, get().dailySummary);

    const payload = {
      id: waterId,
      date,
      amountMl,
      loggedAt: new Date().toISOString(),
    };

    // 2. Attempt direct API sync
    try {
      await nutritionApi.logWater(payload);
      get().fetchDailyNutrition(date, true).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (error: any) {
      logger.info('Direct water log failed, enqueuing offline:', error?.message);
      await nutritionOfflineSync.enqueueWater(payload);
      get().refreshPendingSyncCount();
    }

    return waterId;
  },

  toggleFavorite: async (food) => {
    const isFav = !!food.isFavorite;
    const nextState = !isFav;

    // Optimistically update favorites list and food records in store
    const currentFavs = get().favorites;
    const nextFavs = nextState
      ? [...currentFavs, { ...food, isFavorite: true }]
      : currentFavs.filter((f) => f.id !== food.id);

    set({ favorites: nextFavs });

    try {
      if (nextState) {
        await nutritionApi.addFavorite(food.id);
      } else {
        await nutritionApi.removeFavorite(food.id);
      }
      return nextState;
    } catch (err: any) {
      logger.warn('Failed to toggle favorite on backend:', err?.message);
      set({ favorites: currentFavs });
      return isFav;
    }
  },

  createCustomFood: async (input) => {
    const customFood = await nutritionApi.createCustomFood(input);
    set({ recentFoods: [customFood, ...get().recentFoods.filter((f) => f.id !== customFood.id)] });
    return customFood;
  },

  fetchFavorites: async () => {
    try {
      const favs = await nutritionApi.getFavorites();
      set({ favorites: favs });
    } catch (err: any) {
      logger.warn('Failed to fetch favorites:', err?.message);
    }
  },

  fetchRecentFoods: async () => {
    try {
      const recents = await nutritionApi.getRecentFoods();
      set({ recentFoods: recents });
    } catch (err: any) {
      logger.warn('Failed to fetch recent foods:', err?.message);
    }
  },

  refreshPendingSyncCount: async () => {
    const count = await nutritionOfflineSync.getPendingCount();
    set({ pendingSyncCount: count });
    return count;
  },

  syncPendingMutations: async () => {
    await nutritionOfflineSync.syncAllPending();
    await get().refreshPendingSyncCount();
    await get().fetchDailyNutrition(get().selectedDate, true);
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  },

  resetStore: async () => {
    set({
      entries: [],
      pendingAnalysis: null,
      dailySummary: null,
      waterMl: 0,
      isLoading: false,
      isRefreshing: false,
      error: null,
      pendingSyncCount: 0,
      favorites: [],
      recentFoods: [],
    });
    try {
      await AsyncStorage.removeItem(getCacheKey());
    } catch (e) {
      logger.warn('Failed to remove nutrition cache on reset:', e);
    }
  },
}));

// --- Helper Functions ---

export function scaleFood(item: FoodItem, factor: number): FoodItem {
  if (item.referenceNutrients) {
    const portion = calculatePortionNutrients(item, factor);
    return {
      ...item,
      kcal: portion.kcal,
      protein: portion.protein,
      carbs: portion.carbs,
      fat: portion.fat,
      fiber: portion.fiber,
      serving: portion.servingText,
      servingMultiplier: factor,
    };
  }

  const r = (n: number) => Math.round(n * factor * 10) / 10;
  return {
    ...item,
    kcal: Math.round(item.kcal * factor),
    protein: r(item.protein),
    carbs: r(item.carbs),
    fat: r(item.fat),
    fiber: r(item.fiber),
    serving: factor === 1 ? item.serving : `${factor}× ${item.serving.replace(/^[\d.]+× /, '')}`,
    servingMultiplier: factor,
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + (i.kcal || 0),
      protein: acc.protein + (i.protein || 0),
      carbs: acc.carbs + (i.carbs || 0),
      fat: acc.fat + (i.fat || 0),
      fiber: acc.fiber + (i.fiber || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

export const useDailyTotals = (): Nutrients => {
  const summary = useNutritionStore((s) => s.dailySummary);
  const entries = useNutritionStore((s) => s.entries);

  if (summary?.consumed) {
    return {
      kcal: summary.consumed.calories,
      protein: summary.consumed.proteinG,
      carbs: summary.consumed.carbsG,
      fat: summary.consumed.fatG,
      fiber: summary.consumed.fiberG,
    };
  }

  return sumNutrients(entries.flatMap((e) => e.items));
};

// --- Cache Helpers ---

async function saveCache(entries: MealEntry[], waterMl: number, summary: DailyNutritionView | null) {
  try {
    const payload = JSON.stringify({ entries, waterMl, summary, timestamp: Date.now() });
    await AsyncStorage.setItem(getCacheKey(), payload);
  } catch (e) {
    logger.warn('Failed to save nutrition state cache:', e);
  }
}

async function loadCache(set: (state: Partial<NutritionState>) => void) {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) {
      set({
        entries: parsed.entries,
        waterMl: parsed.waterMl ?? 0,
        dailySummary: parsed.summary ?? null,
      });
    }
  } catch (e) {
    logger.warn('Failed to load nutrition state cache:', e);
  }
}

// Auto-initialize offline sync listener
nutritionOfflineSync.onSyncComplete(() => {
  useNutritionStore.getState().fetchDailyNutrition(undefined, true).catch(() => {});
});

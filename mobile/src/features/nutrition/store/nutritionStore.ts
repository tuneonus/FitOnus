import { captureUserSession, sessionSetter, registerUserStore } from '@/services/user-session';
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
  WaterIntakeView,
} from '../types/nutrition';
import { toDbMealType } from '../types/nutrition';
import { nutritionApi } from '../api/nutrition-api';
import { nutritionOfflineSync, type RejectedNutritionLog } from '../services/nutrition-offline-sync';
import { mapBackendMealToMealEntry, scaleFood } from '../utils/nutrition-calculator';
import {
  addMealToSummary,
  removeMealFromSummary,
  removeWaterFromSummary,
  withWaterTarget,
} from '../utils/daily-summary';
import { toMealItemPayload } from '../utils/meal-payload';
import { generateUUID } from '../utils/uuid';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { queryClient } from '@/providers/query-provider';
import { localDateKey } from '@/features/home/utils/home-overview';
import { refreshFitnessQueries } from '@/services/fitness-refresh';
import { logger } from '@/utils/logger';

function getCacheKey(): string {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `@fitonus:nutrition_state_cache:${userId}` : '@fitonus:nutrition_state_cache';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTodayDateString(): string {
  return localDateKey();
}

let nutritionReadSequence = 0;
let lastWaterSession: ReturnType<typeof captureUserSession> | null = null;
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
  /** Offline entries the server refused for good: kept so the member can see what was not saved. */
  rejectedEntries: RejectedNutritionLog[];
  favorites: FoodItem[];
  recentFoods: FoodItem[];

  // Existing methods preserved
  addEntry: (entry: Omit<MealEntry, 'id'>) => string;
  /** Removes one food from a meal that keeps at least one other food. Deleting the whole meal is `deleteMeal`. */
  removeItem: (entryId: string, itemId: string) => Promise<void>;
  /** Scales one food by `factor` of its CURRENT portion (the edit sheet starts at 1× = as logged). */
  scaleItem: (entryId: string, itemId: string, factor: number) => Promise<void>;
  setPendingAnalysis: (items: FoodItem[] | null) => void;

  /** Deletes a synced meal (the backend keeps it so `restoreMeal` can undo). Resolves with the removed entry. */
  deleteMeal: (mealId: string) => Promise<MealEntry>;
  /** Undoes `deleteMeal`: the same meal id comes back with the item snapshots it had. */
  restoreMeal: (mealId: string) => Promise<void>;
  /** Deletes one synced water entry. Resolves with it so the caller can offer an undo (`logWater` with its id). */
  deleteWater: (entryId: string) => Promise<WaterIntakeView>;
  /** Saves the member's own daily water goal in ml, or clears it (null) so the estimate from their weight applies. */
  setWaterTarget: (targetMl: number | null) => Promise<void>;

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
  /** `options.id` re-logs a known entry (the undo of `deleteWater`): same id, so it is idempotent on the server. */
  logWater: (
    amountMl: number,
    options?: { id?: string; date?: string; loggedAt?: string },
  ) => Promise<string>;
  toggleFavorite: (food: FoodItem) => Promise<boolean>;
  createCustomFood: (input: CreateCustomFoodInput) => Promise<FoodItem>;
  fetchFavorites: () => Promise<void>;
  fetchRecentFoods: () => Promise<void>;
  refreshPendingSyncCount: () => Promise<number>;
  /** Forgets a refused entry the member has seen. */
  dismissRejectedEntry: (kind: RejectedNutritionLog['kind'], id: string) => Promise<void>;
  /** Puts a refused entry back in the offline queue and tries to sync it again. */
  retryRejectedEntry: (kind: RejectedNutritionLog['kind'], id: string) => Promise<void>;
  syncPendingMutations: () => Promise<void>;
  resetStore: () => Promise<void>;
};

export const useNutritionStore = create<NutritionState>((storeSet, get) => {
  const set = storeSet;
  return {
    entries: [],
    pendingAnalysis: null,
    selectedDate: getTodayDateString(),
    dailySummary: null,
    waterMl: 0,
    isLoading: false,
    isRefreshing: false,
    error: null,
    pendingSyncCount: 0,
    rejectedEntries: [],
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

    removeItem: async (entryId, itemId) => {
      const current = get().entries.find((entry) => entry.id === entryId);
      if (!current) return;
      const items = current.items.filter((item) => item.id !== itemId);
      if (!items.length) throw new Error('A meal needs at least one food. Delete the meal instead.');
      await get().updateMeal(entryId, items, current.notes ?? undefined);
    },

    deleteMeal: async (mealId) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const index = get().entries.findIndex((entry) => entry.id === mealId);
      const existing = get().entries[index];
      if (!existing) throw new Error('This meal is no longer in your log.');
      if (existing.isSynced === false) throw new Error('Sync this meal before deleting it.');
      const summaryBefore = get().dailySummary;

      // Optimistic: the meal and its totals disappear at once; a failed request puts them back.
      const without = get().entries.filter((entry) => entry.id !== mealId);
      const summary = summaryBefore ? removeMealFromSummary(summaryBefore, mealId) : summaryBefore;
      set({ entries: without, dailySummary: summary });
      saveCache(without, get().waterMl, summary);

      try {
        await nutritionApi.deleteMeal(mealId);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        // 404 means it is already gone (a retried delete): the goal is reached, nothing to roll back.
        if (err?.response?.status !== 404) {
          const restored = [...get().entries];
          restored.splice(Math.min(index, restored.length), 0, existing);
          set({ entries: restored, dailySummary: summaryBefore });
          saveCache(restored, get().waterMl, summaryBefore);
          throw err;
        }
      }

      get()
        .fetchDailyNutrition(get().selectedDate, true)
        .catch(() => {});
      refreshFitnessQueries();
      return existing;
    },

    restoreMeal: async (mealId) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const meal = await nutritionApi.restoreMeal(mealId);
      session.assertCurrent();

      const entry = mapBackendMealToMealEntry(meal);
      const known = get().entries.some((candidate) => candidate.id === entry.id);
      const entries = known
        ? get().entries.map((candidate) => (candidate.id === entry.id ? entry : candidate))
        : entry.date === get().selectedDate
          ? [...get().entries, entry]
          : get().entries;
      const current = get().dailySummary;
      const summary = current ? addMealToSummary(current, meal) : current;
      set({ entries, dailySummary: summary });
      saveCache(entries, get().waterMl, summary);

      get()
        .fetchDailyNutrition(get().selectedDate, true)
        .catch(() => {});
      refreshFitnessQueries();
    },

    deleteWater: async (entryId) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const summaryBefore = get().dailySummary;
      const waterBefore = get().waterMl;
      const existing = summaryBefore?.waterEntries?.find((entry) => entry.id === entryId);
      if (!summaryBefore || !existing) throw new Error('This water entry is no longer in your log.');

      const summary = removeWaterFromSummary(summaryBefore, entryId);
      const waterMl = Math.max(0, waterBefore - existing.amountMl);
      set({ dailySummary: summary, waterMl });
      saveCache(get().entries, waterMl, summary);

      try {
        await nutritionApi.deleteWater(entryId);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        if (err?.response?.status !== 404) {
          set({ dailySummary: summaryBefore, waterMl: waterBefore });
          saveCache(get().entries, waterBefore, summaryBefore);
          throw err;
        }
      }

      get()
        .fetchDailyNutrition(get().selectedDate, true)
        .catch(() => {});
      refreshFitnessQueries();
      return existing;
    },

    setWaterTarget: async (targetMl) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      // Not optimistic: the backend decides what clearing falls back to (the estimate), so wait for its answer.
      const result = await nutritionApi.setWaterTarget(targetMl);
      session.assertCurrent();
      const summary = get().dailySummary;
      if (summary) {
        const updated = withWaterTarget(summary, result);
        set({ dailySummary: updated });
        saveCache(get().entries, get().waterMl, updated);
      }
      refreshFitnessQueries();
    },

    scaleItem: async (entryId, itemId, factor) => {
      const current = get().entries.find((entry) => entry.id === entryId);
      if (!current) return;
      await get().updateMeal(
        entryId,
        current.items.map((item) => (item.id === itemId ? scaleFood(item, factor) : item)),
        current.notes ?? undefined,
      );
    },

    setPendingAnalysis: (pendingAnalysis) => set({ pendingAnalysis }),

    setSelectedDate: (selectedDate) => {
      set({ selectedDate, entries: [], dailySummary: null, waterMl: 0 });
      void get()
        .fetchDailyNutrition(selectedDate)
        .catch(() => {});
    },

    // --- Real Backend Integration & Offline Actions ---

    fetchDailyNutrition: async (dateStr, isRefresh = false) => {
      const sequence = ++nutritionReadSequence;
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const date = dateStr || get().selectedDate || getTodayDateString();
      set({ [isRefresh ? 'isRefreshing' : 'isLoading']: true, error: null });

      try {
        const summary = await nutritionApi.getDailyNutrition(date);
        if (!session.isCurrent()) return;
        if (sequence !== nutritionReadSequence || get().selectedDate !== date) return;
        const serverEntries: MealEntry[] = summary.meals.map(mapBackendMealToMealEntry);

        // Merge offline pending entries for this date if any
        const currentUnsynced = get().entries.filter(
          (e) =>
            !e.isSynced &&
            (!e.date || e.date === date) &&
            !serverEntries.some((entry) => entry.id === e.id),
        );
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
        if (!session.isCurrent()) return;
        if (sequence !== nutritionReadSequence || get().selectedDate !== date) return;
        logger.warn('Failed to fetch daily nutrition from backend:', err?.message);
        set({
          isLoading: false,
          isRefreshing: false,
          error: err?.message || 'Unable to load nutrition data',
        });
        // Hydrate from cache if entries is empty
        if (get().selectedDate === date) await loadCache(set, date);
        if (!session.isCurrent()) return;
      } finally {
        if (session.isCurrent())
          void get()
            .refreshPendingSyncCount()
            .catch(() => {});
      }
    },

    logMeal: async ({ mealType, items, notes, method = 'search' }) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
        items: items.map((item) => toMealItemPayload(item)),
      };

      // 3. Attempt direct API sync
      try {
        const serverMeal = await nutritionApi.logMeal(payload);
        session.assertCurrent();
        // Replace optimistic entry with server-recalculated entry
        const syncedEntry = mapBackendMealToMealEntry(serverMeal);
        const finalized = get().entries.map((e) => (e.id === mealId ? syncedEntry : e));
        set({ entries: finalized });
        saveCache(finalized, get().waterMl, get().dailySummary);
        // Soft-refresh daily summary
        get()
          .fetchDailyNutrition(date, true)
          .catch(() => {});
        refreshFitnessQueries();
      } catch (error: any) {
        session.assertCurrent();
        if (
          error?.response?.status &&
          error.response.status < 500 &&
          ![408, 429].includes(error.response.status)
        ) {
          set({ entries: get().entries.filter((entry) => entry.id !== mealId) });
          throw error;
        }
        logger.info('Network submission failed, enqueuing meal for offline sync:', error?.message);
        await nutritionOfflineSync.enqueueMeal(payload);
        session.assertCurrent();
        get().refreshPendingSyncCount();
      }

      return mealId;
    },

    updateMeal: async (mealId, items, notes) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
          // Stored items are referenced by `mealItemId` so the backend keeps their snapshots.
          items: items.map((item) => toMealItemPayload(item, { forUpdate: true })),
        };

        try {
          await nutritionApi.updateMeal(mealId, payload);
          session.assertCurrent();
          get()
            .fetchDailyNutrition(date, true)
            .catch(() => {});
          refreshFitnessQueries();
        } catch (err: any) {
          session.assertCurrent();
          set({ entries: get().entries.map((entry) => (entry.id === mealId ? existing : entry)) });
          logger.warn('Failed to update meal on backend:', err?.message);
          throw err;
        }
      }
    },

    logWater: async (amountMl, options) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const now = Date.now();
      // Re-logging a known entry (the undo of a delete) is an explicit action, never a double tap.
      if (
        !options?.id &&
        lastWaterSession?.isCurrent() &&
        now - lastWaterLogTime < 350 &&
        lastWaterLogAmount === amountMl
      ) {
        logger.info('Duplicate rapid water tap suppressed:', amountMl);
        return lastWaterLogId;
      }
      if (!options?.id) {
        lastWaterSession = session;
        lastWaterLogTime = now;
        lastWaterLogAmount = amountMl;
      }

      const waterId = options?.id ?? generateUUID();
      if (!options?.id) lastWaterLogId = waterId;
      const date = options?.date ?? (get().selectedDate || getTodayDateString());
      const newTotal = get().waterMl + amountMl;

      // 1. Optimistic Update
      set({ waterMl: newTotal });
      saveCache(get().entries, newTotal, get().dailySummary);

      const payload = {
        id: waterId,
        date,
        amountMl,
        loggedAt: options?.loggedAt ?? new Date().toISOString(),
      };

      // 2. Attempt direct API sync
      try {
        await nutritionApi.logWater(payload);
        session.assertCurrent();
        get()
          .fetchDailyNutrition(date, true)
          .catch(() => {});
        refreshFitnessQueries();
      } catch (error: any) {
        session.assertCurrent();
        if (
          error?.response?.status &&
          error.response.status < 500 &&
          ![408, 429].includes(error.response.status)
        ) {
          set({ waterMl: Math.max(0, get().waterMl - amountMl) });
          throw error;
        }
        logger.info('Direct water log failed, enqueuing offline:', error?.message);
        await nutritionOfflineSync.enqueueWater(payload);
        session.assertCurrent();
        get().refreshPendingSyncCount();
      }

      return waterId;
    },

    toggleFavorite: async (food) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
          session.assertCurrent();
        } else {
          await nutritionApi.removeFavorite(food.id);
          session.assertCurrent();
        }
        return nextState;
      } catch (err: any) {
        session.assertCurrent();
        logger.warn('Failed to toggle favorite on backend:', err?.message);
        set({ favorites: currentFavs });
        return isFav;
      }
    },

    createCustomFood: async (input) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const customFood = await nutritionApi.createCustomFood(input);
      session.assertCurrent();
      set({
        recentFoods: [customFood, ...get().recentFoods.filter((f) => f.id !== customFood.id)],
      });
      return customFood;
    },

    fetchFavorites: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const favs = await nutritionApi.getFavorites();
        if (!session.isCurrent()) return;
        set({ favorites: favs });
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch favorites:', err?.message);
      }
    },

    fetchRecentFoods: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const recents = await nutritionApi.getRecentFoods();
        if (!session.isCurrent()) return;
        set({ recentFoods: recents });
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch recent foods:', err?.message);
      }
    },

    refreshPendingSyncCount: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const [count, rejectedEntries] = await Promise.all([
        nutritionOfflineSync.getPendingCount(),
        nutritionOfflineSync.getRejected(),
      ]);
      if (!session.isCurrent()) return 0;
      set({ pendingSyncCount: count, rejectedEntries });
      return count;
    },

    dismissRejectedEntry: async (kind, id) => {
      await nutritionOfflineSync.dismissRejected(kind, id);
      await get().refreshPendingSyncCount();
    },

    retryRejectedEntry: async (kind, id) => {
      await nutritionOfflineSync.retryRejected(kind, id);
      await get().refreshPendingSyncCount();
      await get().syncPendingMutations();
    },

    syncPendingMutations: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      await nutritionOfflineSync.syncAllPending();
      session.assertCurrent();
      await get().refreshPendingSyncCount();
      session.assertCurrent();
      await get().fetchDailyNutrition(get().selectedDate, true);
      session.assertCurrent();
      refreshFitnessQueries();
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
        rejectedEntries: [],
        favorites: [],
        recentFoods: [],
      });
      lastWaterSession = null;
      lastWaterLogTime = 0;
      lastWaterLogAmount = 0;
      lastWaterLogId = '';
      set({ selectedDate: getTodayDateString() });
      try {
        await AsyncStorage.removeItem(getCacheKey());
      } catch (e) {
        logger.warn('Failed to remove nutrition cache on reset:', e);
      }
    },
  };
});

// --- Helper Functions ---

// Portion scaling lives with the other pure nutrition math; re-exported because screens import it from here.
export { scaleFood };

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + (i.kcal || 0),
      protein: acc.protein + (i.protein || 0),
      carbs: acc.carbs + (i.carbs || 0),
      fat: acc.fat + (i.fat || 0),
      fiber: acc.fiber + (i.fiber || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
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

async function saveCache(
  entries: MealEntry[],
  waterMl: number,
  summary: DailyNutritionView | null,
) {
  try {
    const payload = JSON.stringify({ entries, waterMl, summary, timestamp: Date.now() });
    await AsyncStorage.setItem(getCacheKey(), payload);
  } catch (e) {
    logger.warn('Failed to save nutrition state cache:', e);
  }
}

async function loadCache(set: (state: Partial<NutritionState>) => void, date: string) {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries) && parsed.summary?.date === date) {
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
  useNutritionStore
    .getState()
    .fetchDailyNutrition(undefined, true)
    .catch(() => {});
});

registerUserStore(useNutritionStore, () => {
  nutritionReadSequence++;
  lastWaterSession = null;
  lastWaterLogTime = 0;
  lastWaterLogAmount = 0;
  lastWaterLogId = '';
  useNutritionStore.setState(
    { ...useNutritionStore.getInitialState(), selectedDate: getTodayDateString() },
    true,
  );
});

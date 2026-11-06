import { create } from 'zustand';
import { goalsApi } from '../api/goals-api';
import { goalsOfflineSync } from '../services/goals-offline-sync';
import type {
  Goal,
  GoalDetails,
  Habit,
  HabitHistory,
  CreateGoalInput,
  UpdateGoalInput,
  LogGoalCheckpointInput,
  CreateHabitInput,
  UpdateHabitInput,
  SetHabitCompletionInput,
} from '../types/goal';
import { logger } from '@/utils/logger';

export interface GoalsState {
  goals: Goal[];
  activeGoalDetails: GoalDetails | null;
  habits: Habit[];
  activeHabitHistory: HabitHistory | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  pendingSyncCount: number;
  failedSyncCount: number;

  // Goals actions
  fetchGoals: (options?: { force?: boolean }) => Promise<void>;
  fetchGoalDetails: (id: string) => Promise<GoalDetails | null>;
  createGoal: (input: CreateGoalInput) => Promise<string>;
  addGoal: (goal: Omit<Goal, 'id'>) => Promise<string>;
  updateGoal: (id: string, patch: UpdateGoalInput) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<void>;
  logGoalCheckpoint: (goalId: string, value: number, notes?: string) => Promise<void>;

  // Habits actions
  fetchHabits: (date?: string) => Promise<void>;
  fetchHabitHistory: (id: string) => Promise<HabitHistory | null>;
  createHabit: (input: CreateHabitInput) => Promise<string>;
  updateHabit: (id: string, patch: UpdateHabitInput) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  setHabitCompletion: (id: string, completed: boolean, date?: string, notes?: string) => Promise<void>;

  // Offline sync & Reset
  refreshPendingSyncCount: () => Promise<void>;
  syncPending: () => Promise<void>;
  resetStore: () => Promise<void>;
}

export const useGoalsStore = create<GoalsState>((set, get) => {
  // Listen for background offline synchronization events
  goalsOfflineSync.addSyncListener(() => {
    get().refreshPendingSyncCount();
    get().fetchGoals({ force: true }).catch(() => {});
    get().fetchHabits().catch(() => {});
  });

  return {
    goals: [],
    activeGoalDetails: null,
    habits: [],
    activeHabitHistory: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    pendingSyncCount: 0,
    failedSyncCount: 0,

    fetchGoals: async (options) => {
      const isInitial = get().goals.length === 0;
      if (isInitial) {
        // Load offline cache first for instant UX
        const cached = await goalsOfflineSync.loadGoalsCache();
        if (cached && cached.length > 0) {
          set({ goals: cached });
        }
      }

      set({ [options?.force ? 'isRefreshing' : 'isLoading']: true, error: null });

      try {
        const goals = await goalsApi.getGoals({ syncTelemetry: true });
        set({ goals, isLoading: false, isRefreshing: false });
        await goalsOfflineSync.saveGoalsCache(goals);
      } catch (err: any) {
        logger.warn('Failed to fetch goals from backend, using cached:', err?.message);
        set({
          isLoading: false,
          isRefreshing: false,
          error: get().goals.length === 0 ? 'Unable to load goals. Check your connection.' : null,
        });
      }
    },

    fetchGoalDetails: async (id: string) => {
      set({ isLoading: true, error: null });
      try {
        const details = await goalsApi.getGoalDetails(id);
        set({ activeGoalDetails: details, isLoading: false });
        return details;
      } catch (err: any) {
        logger.warn(`Failed to fetch details for goal ${id}:`, err?.message);
        set({ isLoading: false, error: 'Failed to load goal details.' });
        return null;
      }
    },

    createGoal: async (input: CreateGoalInput) => {
      set({ isLoading: true, error: null });
      try {
        const created = await goalsApi.createGoal(input);
        const updated = [created, ...get().goals.filter((g) => g.id !== created.id)];
        set({ goals: updated, isLoading: false });
        await goalsOfflineSync.saveGoalsCache(updated);
        return created.id;
      } catch (err: any) {
        set({ isLoading: false, error: 'Failed to create goal.' });
        throw err;
      }
    },

    addGoal: async (goal: Omit<Goal, 'id'>) => {
      const payload: CreateGoalInput = {
        type: goal.type,
        title: goal.title,
        targetValue: goal.target,
        startValue: goal.start,
        metricUnit: goal.unit,
        cadence: goal.cadence,
      };
      if (goal.direction !== undefined) payload.direction = goal.direction;
      if (goal.deadline !== undefined) payload.deadlineLabel = goal.deadline;
      if (goal.isPrimary !== undefined) payload.isPrimary = goal.isPrimary;
      return get().createGoal(payload);
    },

    updateGoal: async (id: string, patch: UpdateGoalInput) => {
      const targetVal = patch.targetValue !== undefined ? patch.targetValue : patch.target;
      // Optimistic update
      const previousGoals = get().goals;
      const optimisticGoals = previousGoals.map((g) =>
        g.id === id
          ? {
              ...g,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(targetVal !== undefined ? { target: targetVal } : {}),
              ...(patch.currentValue !== undefined ? { current: patch.currentValue } : {}),
              ...(patch.status !== undefined ? { status: patch.status } : {}),
              ...(patch.deadlineLabel !== undefined ? { deadline: patch.deadlineLabel } : {}),
            }
          : g,
      );
      set({ goals: optimisticGoals });

      try {
        const payload: UpdateGoalInput = {
          ...patch,
          ...(targetVal !== undefined ? { targetValue: targetVal } : {}),
        };
        const updated = await goalsApi.updateGoal(id, payload);
        const finalGoals = get().goals.map((g) => (g.id === id ? updated : g));
        set({ goals: finalGoals });
        await goalsOfflineSync.saveGoalsCache(finalGoals);
      } catch (err: any) {
        logger.warn(`Failed to update goal ${id}, reverting optimistic state:`, err?.message);
        set({ goals: previousGoals, error: 'Failed to update goal.' });
        throw err;
      }
    },

    deleteGoal: async (id: string) => {
      const previousGoals = get().goals;
      set({ goals: previousGoals.filter((g) => g.id !== id) });

      try {
        await goalsApi.deleteGoal(id);
        await goalsOfflineSync.saveGoalsCache(get().goals);
      } catch (err: any) {
        logger.warn(`Failed to delete goal ${id}, restoring:`, err?.message);
        set({ goals: previousGoals, error: 'Failed to delete goal.' });
        throw err;
      }
    },

    completeGoal: async (id: string) => {
      return get().updateGoal(id, { status: 'completed' });
    },

    logGoalCheckpoint: async (goalId: string, value: number, notes?: string) => {
      // Update local goal progress optimistically
      const todayStr = new Date().toISOString().slice(0, 10);
      const previousGoals = get().goals;
      const optimisticGoals = previousGoals.map((g) => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          current: value,
          history: [...g.history, value],
        };
      });
      set({ goals: optimisticGoals });

      const checkpointInput: LogGoalCheckpointInput = { value, date: todayStr };
      if (notes !== undefined) checkpointInput.notes = notes;

      try {
        await goalsApi.logCheckpoint(goalId, checkpointInput);
      } catch (err: any) {
        logger.warn(`Failed to log checkpoint for ${goalId} directly, queueing for offline sync:`, err?.message);
        await goalsOfflineSync.queueGoalCheckpoint(goalId, checkpointInput);
        await get().refreshPendingSyncCount();
      }
    },

    fetchHabits: async (date?: string) => {
      const isInitial = get().habits.length === 0;
      if (isInitial) {
        const cached = await goalsOfflineSync.loadHabitsCache();
        if (cached && cached.length > 0) {
          set({ habits: cached });
        }
      }

      try {
        const habits = await goalsApi.getHabits(date ? { date } : undefined);
        set({ habits });
        await goalsOfflineSync.saveHabitsCache(habits);
      } catch (err: any) {
        logger.warn('Failed to fetch habits from backend, using cache:', err?.message);
      }
    },

    fetchHabitHistory: async (id: string) => {
      try {
        const history = await goalsApi.getHabitHistory(id);
        set({ activeHabitHistory: history });
        return history;
      } catch (err: any) {
        logger.warn(`Failed to fetch history for habit ${id}:`, err?.message);
        return null;
      }
    },

    createHabit: async (input: CreateHabitInput) => {
      set({ isLoading: true, error: null });
      try {
        const created = await goalsApi.createHabit(input);
        const updated = [created, ...get().habits.filter((h) => h.id !== created.id)];
        set({ habits: updated, isLoading: false });
        await goalsOfflineSync.saveHabitsCache(updated);
        return created.id;
      } catch (err: any) {
        set({ isLoading: false, error: 'Failed to create habit.' });
        throw err;
      }
    },

    updateHabit: async (id: string, patch: UpdateHabitInput) => {
      const previousHabits = get().habits;
      const optimistic = previousHabits.map((h) =>
        h.id === id
          ? {
              ...h,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.category !== undefined ? { category: patch.category } : {}),
              ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
              ...(patch.targetDaysPerWeek !== undefined ? { targetDaysPerWeek: patch.targetDaysPerWeek } : {}),
              ...(patch.isArchived !== undefined ? { isArchived: patch.isArchived } : {}),
            }
          : h,
      );
      set({ habits: optimistic });

      try {
        const updated = await goalsApi.updateHabit(id, patch);
        const finalHabits = get().habits.map((h) => (h.id === id ? updated : h));
        set({ habits: finalHabits });
        await goalsOfflineSync.saveHabitsCache(finalHabits);
      } catch (err: any) {
        logger.warn(`Failed to update habit ${id}, reverting:`, err?.message);
        set({ habits: previousHabits, error: 'Failed to update habit.' });
        throw err;
      }
    },

    deleteHabit: async (id: string) => {
      const previousHabits = get().habits;
      set({ habits: previousHabits.filter((h) => h.id !== id) });

      try {
        await goalsApi.deleteHabit(id);
        await goalsOfflineSync.saveHabitsCache(get().habits);
      } catch (err: any) {
        logger.warn(`Failed to delete habit ${id}, reverting:`, err?.message);
        set({ habits: previousHabits, error: 'Failed to delete habit.' });
        throw err;
      }
    },

    setHabitCompletion: async (id: string, completed: boolean, date?: string, notes?: string) => {
      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      const previousHabits = get().habits;

      // Optimistic update
      const optimistic = previousHabits.map((h) => {
        if (h.id !== id) return h;
        const currentCompletedDays = h.weeklyProgress?.completedDays ?? 0;
        const newCompletedDays = completed
          ? currentCompletedDays + 1
          : Math.max(0, currentCompletedDays - 1);
        const targetDays = h.targetDaysPerWeek;

        return {
          ...h,
          isCompletedToday: completed,
          currentStreak: completed ? h.currentStreak + 1 : Math.max(0, h.currentStreak - 1),
          totalCompletions: completed ? h.totalCompletions + 1 : Math.max(0, h.totalCompletions - 1),
          weeklyProgress: {
            completedDays: newCompletedDays,
            targetDays,
            percentage: Math.min(100, Math.round((newCompletedDays / targetDays) * 100)),
          },
        };
      });
      set({ habits: optimistic });

      const completionInput: SetHabitCompletionInput = { date: targetDate, completed };
      if (notes !== undefined) completionInput.notes = notes;

      try {
        const res = await goalsApi.setHabitCompletion(id, completionInput);
        const finalHabits = get().habits.map((h) => (h.id === id ? res.habit : h));
        set({ habits: finalHabits });
        await goalsOfflineSync.saveHabitsCache(finalHabits);
      } catch (err: any) {
        logger.warn(`Failed to sync habit completion for ${id} directly, queuing offline:`, err?.message);
        await goalsOfflineSync.queueHabitCompletion(id, completionInput);
        await get().refreshPendingSyncCount();
      }
    },

    refreshPendingSyncCount: async () => {
      const [pendingCount, failedCount] = await Promise.all([
        goalsOfflineSync.getPendingCount(),
        goalsOfflineSync.getFailedCount(),
      ]);
      set({ pendingSyncCount: pendingCount, failedSyncCount: failedCount });
    },

    syncPending: async () => {
      await goalsOfflineSync.syncAllPending();
      await get().refreshPendingSyncCount();
    },

    resetStore: async () => {
      set({
        goals: [],
        activeGoalDetails: null,
        habits: [],
        activeHabitHistory: null,
        isLoading: false,
        isRefreshing: false,
        error: null,
        pendingSyncCount: 0,
        failedSyncCount: 0,
      });
      await goalsOfflineSync.clearUserCache();
    },
  };
});

export { goalProgress } from '../utils/goal-calculator';

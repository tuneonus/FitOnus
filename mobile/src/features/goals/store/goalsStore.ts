import { captureUserSession, sessionSetter, registerUserStore } from '@/services/user-session';
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
import { refreshFitnessQueries } from '@/services/fitness-refresh';
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
  setHabitCompletion: (
    id: string,
    completed: boolean,
    date?: string,
    notes?: string,
  ) => Promise<void>;

  // Offline sync & Reset
  refreshPendingSyncCount: () => Promise<void>;
  syncPending: () => Promise<void>;
  resetStore: () => Promise<void>;
}

export const useGoalsStore = create<GoalsState>((storeSet, get) => {
  const set = storeSet;
  // Listen for background offline synchronization events
  goalsOfflineSync.addSyncListener(() => {
    get().refreshPendingSyncCount();
    get()
      .fetchGoals({ force: true })
      .catch(() => {});
    get()
      .fetchHabits()
      .catch(() => {});
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
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const isInitial = get().goals.length === 0;
      if (isInitial) {
        // Load offline cache first for instant UX
        const cached = await goalsOfflineSync.loadGoalsCache();
        if (!session.isCurrent()) return;
        if (cached && cached.length > 0) {
          set({ goals: cached });
        }
      }

      set({ [options?.force ? 'isRefreshing' : 'isLoading']: true, error: null });

      try {
        const goals = await goalsApi.getGoals({ syncTelemetry: true });
        if (!session.isCurrent()) return;
        set({ goals, isLoading: false, isRefreshing: false });
        await goalsOfflineSync.saveGoalsCache(goals);
        if (!session.isCurrent()) return;
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch goals from backend, using cached:', err?.message);
        set({
          isLoading: false,
          isRefreshing: false,
          error: get().goals.length === 0 ? 'Unable to load goals. Check your connection.' : null,
        });
      }
    },

    fetchGoalDetails: async (id: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isLoading: true, error: null });
      try {
        const details = await goalsApi.getGoalDetails(id);
        session.assertCurrent();
        set({ activeGoalDetails: details, isLoading: false });
        return details;
      } catch (err: any) {
        session.assertCurrent();
        logger.warn(`Failed to fetch details for goal ${id}:`, err?.message);
        set({ isLoading: false, error: 'Failed to load goal details.' });
        return null;
      }
    },

    createGoal: async (input: CreateGoalInput) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isLoading: true, error: null });
      try {
        const created = await goalsApi.createGoal(input);
        session.assertCurrent();
        const updated = [created, ...get().goals.filter((g) => g.id !== created.id)];
        set({ goals: updated, isLoading: false });
        refreshFitnessQueries();
        await goalsOfflineSync.saveGoalsCache(updated);
        session.assertCurrent();
        return created.id;
      } catch (err: any) {
        session.assertCurrent();
        set({ isLoading: false, error: 'Failed to create goal.' });
        throw err;
      }
    },

    addGoal: async (goal: Omit<Goal, 'id'>) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
        session.assertCurrent();
        const finalGoals = get().goals.map((g) => (g.id === id ? updated : g));
        set({ goals: finalGoals });
        refreshFitnessQueries();
        await goalsOfflineSync.saveGoalsCache(finalGoals);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        logger.warn(`Failed to update goal ${id}, reverting optimistic state:`, err?.message);
        set({ goals: previousGoals, error: 'Failed to update goal.' });
        throw err;
      }
    },

    deleteGoal: async (id: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const previousGoals = get().goals;
      set({ goals: previousGoals.filter((g) => g.id !== id) });

      try {
        await goalsApi.deleteGoal(id);
        session.assertCurrent();
        refreshFitnessQueries();
        await goalsOfflineSync.saveGoalsCache(get().goals);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        logger.warn(`Failed to delete goal ${id}, restoring:`, err?.message);
        set({ goals: previousGoals, error: 'Failed to delete goal.' });
        throw err;
      }
    },

    completeGoal: async (id: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      return get().updateGoal(id, { status: 'completed' });
    },

    logGoalCheckpoint: async (goalId: string, value: number, notes?: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        if (
          err?.response?.status &&
          err.response.status < 500 &&
          ![408, 429].includes(err.response.status)
        ) {
          set({ goals: previousGoals });
          throw err;
        }
        logger.warn(
          `Failed to log checkpoint for ${goalId} directly, queueing for offline sync:`,
          err?.message,
        );
        await goalsOfflineSync.queueGoalCheckpoint(goalId, checkpointInput);
        session.assertCurrent();
        await get().refreshPendingSyncCount();
        session.assertCurrent();
      }
    },

    fetchHabits: async (date?: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const isInitial = get().habits.length === 0;
      if (isInitial) {
        const cached = await goalsOfflineSync.loadHabitsCache();
        if (!session.isCurrent()) return;
        if (cached && cached.length > 0) {
          set({ habits: cached });
        }
      }

      try {
        const habits = await goalsApi.getHabits(date ? { date } : undefined);
        if (!session.isCurrent()) return;
        set({ habits });
        await goalsOfflineSync.saveHabitsCache(habits);
        if (!session.isCurrent()) return;
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch habits from backend, using cache:', err?.message);
      }
    },

    fetchHabitHistory: async (id: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const history = await goalsApi.getHabitHistory(id);
        session.assertCurrent();
        set({ activeHabitHistory: history });
        return history;
      } catch (err: any) {
        session.assertCurrent();
        logger.warn(`Failed to fetch history for habit ${id}:`, err?.message);
        return null;
      }
    },

    createHabit: async (input: CreateHabitInput) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isLoading: true, error: null });
      try {
        const created = await goalsApi.createHabit(input);
        session.assertCurrent();
        const updated = [created, ...get().habits.filter((h) => h.id !== created.id)];
        set({ habits: updated, isLoading: false });
        refreshFitnessQueries();
        await goalsOfflineSync.saveHabitsCache(updated);
        session.assertCurrent();
        return created.id;
      } catch (err: any) {
        session.assertCurrent();
        set({ isLoading: false, error: 'Failed to create habit.' });
        throw err;
      }
    },

    updateHabit: async (id: string, patch: UpdateHabitInput) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const previousHabits = get().habits;
      const optimistic = previousHabits.map((h) =>
        h.id === id
          ? {
              ...h,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.category !== undefined ? { category: patch.category } : {}),
              ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
              ...(patch.targetDaysPerWeek !== undefined
                ? { targetDaysPerWeek: patch.targetDaysPerWeek }
                : {}),
              ...(patch.isArchived !== undefined ? { isArchived: patch.isArchived } : {}),
            }
          : h,
      );
      set({ habits: optimistic });

      try {
        const updated = await goalsApi.updateHabit(id, patch);
        session.assertCurrent();
        const finalHabits = get().habits.map((h) => (h.id === id ? updated : h));
        set({ habits: finalHabits });
        refreshFitnessQueries();
        await goalsOfflineSync.saveHabitsCache(finalHabits);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        logger.warn(`Failed to update habit ${id}, reverting:`, err?.message);
        set({ habits: previousHabits, error: 'Failed to update habit.' });
        throw err;
      }
    },

    deleteHabit: async (id: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const previousHabits = get().habits;
      set({ habits: previousHabits.filter((h) => h.id !== id) });

      try {
        await goalsApi.deleteHabit(id);
        session.assertCurrent();
        refreshFitnessQueries();
        await goalsOfflineSync.saveHabitsCache(get().habits);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        logger.warn(`Failed to delete habit ${id}, reverting:`, err?.message);
        set({ habits: previousHabits, error: 'Failed to delete habit.' });
        throw err;
      }
    },

    setHabitCompletion: async (id: string, completed: boolean, date?: string, notes?: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
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
          totalCompletions: completed
            ? h.totalCompletions + 1
            : Math.max(0, h.totalCompletions - 1),
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
        session.assertCurrent();
        const finalHabits = get().habits.map((h) => (h.id === id ? res.habit : h));
        set({ habits: finalHabits });
        refreshFitnessQueries();
        await goalsOfflineSync.saveHabitsCache(finalHabits);
        session.assertCurrent();
      } catch (err: any) {
        session.assertCurrent();
        if (
          err?.response?.status &&
          err.response.status < 500 &&
          ![408, 429].includes(err.response.status)
        ) {
          set({ habits: previousHabits });
          throw err;
        }
        logger.warn(
          `Failed to sync habit completion for ${id} directly, queuing offline:`,
          err?.message,
        );
        await goalsOfflineSync.queueHabitCompletion(id, completionInput);
        session.assertCurrent();
        await get().refreshPendingSyncCount();
        session.assertCurrent();
      }
    },

    refreshPendingSyncCount: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const [pendingCount, failedCount] = await Promise.all([
        goalsOfflineSync.getPendingCount(),
        goalsOfflineSync.getFailedCount(),
      ]);
      session.assertCurrent();
      set({ pendingSyncCount: pendingCount, failedSyncCount: failedCount });
    },

    syncPending: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      await goalsOfflineSync.syncAllPending();
      if (!session.isCurrent()) return;
      await get().refreshPendingSyncCount();
      if (!session.isCurrent()) return;
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

registerUserStore(useGoalsStore);

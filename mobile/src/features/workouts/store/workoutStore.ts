import { captureUserSession, sessionSetter, registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import type {
  ActiveExercise,
  SetLog,
  WorkoutLog,
  WorkoutSession,
  SaveWorkoutSessionInput,
  Exercise,
} from '../types/workout';
import { WorkoutService } from '../services/workout-service';
import { offlineSyncService } from '../services/offline-sync';
import { workoutApi } from '../api/workout-api';
import { showToast } from '../../../shared/stores/toastStore';
import { queryClient } from '../../../providers/query-provider';
import { historyForPresentation } from '../utils/premium-workout';
import { refreshFitnessQueries } from '@/services/fitness-refresh';
import { logger } from '@/utils/logger';

type TodayStatus = 'notStarted' | 'inProgress' | 'completed';

export function resolveExerciseUuid(id: string): string {
  const match = useWorkoutStore
    .getState()
    .catalog.find((exercise) => exercise.id === id || exercise.slug === id);
  return match?.id ?? id;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type WorkoutState = {
  catalog: Exercise[];
  plannedSession: WorkoutSession | null;
  todayStatus: TodayStatus;
  history: WorkoutLog[];
  active: ActiveExercise[];
  currentIndex: number;
  elapsedSec: number;
  startedAt: string | null;
  paused: boolean;
  lastCompleted: WorkoutLog | null;
  pendingSyncCount: number;
  loadExercises: () => Promise<void>;
  getExerciseById: (id: string) => Exercise;
  setPlannedSession: (session: WorkoutSession | null) => void;
  removePlannedExercise: (exerciseId: string) => void;
  startSession: () => void;
  tick: () => void;
  togglePause: () => void;
  setCurrentIndex: (i: number) => void;
  updateSet: (exIndex: number, setIndex: number, patch: Partial<SetLog>) => void;
  addSet: (exIndex: number) => void;
  skipExercise: (exIndex: number) => void;
  finishSession: () => WorkoutLog;
  saveCompleted: (notes?: string) => Promise<boolean>;
  logExternal: (log: WorkoutLog) => void;
  loadHistoryFromBackend: () => Promise<void>;
  syncOfflineSessions: () => Promise<void>;
  resetStore: () => void;
};

export const useWorkoutStore = create<WorkoutState>((storeSet, get) => {
  const set = storeSet;
  return {
    catalog: [],
    plannedSession: null,
    todayStatus: 'notStarted',
    history: [],
    active: [],
    currentIndex: 0,
    elapsedSec: 0,
    startedAt: null,
    paused: false,
    lastCompleted: null,
    pendingSyncCount: 0,

    resetStore: () => {
      set({
        catalog: [],
        plannedSession: null,
        todayStatus: 'notStarted',
        history: [],
        active: [],
        currentIndex: 0,
        elapsedSec: 0,
        startedAt: null,
        paused: false,
        lastCompleted: null,
        pendingSyncCount: 0,
      });
    },

    loadExercises: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const items = await WorkoutService.getExercises({ limit: 100 });
        if (!session.isCurrent()) return;
        if (Array.isArray(items)) {
          set({ catalog: items });
        }
      } catch (err) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to load exercises into workoutStore:', err);
      }
    },

    getExerciseById: (id: string): Exercise => {
      const { catalog } = get();
      const match = catalog.find((e) => e.id === id || e.slug === id);
      if (match) return match;
      return {
        id,
        name: 'Exercise',
        muscle: 'Full body',
        equipment: 'Bodyweight',
        level: 'Beginner',
        secondary: [],
        instructions: [],
        cues: [],
      };
    },

    setPlannedSession: (plannedSession) => set({ plannedSession }),

    removePlannedExercise: (exerciseId) => {
      const s = get().plannedSession;
      if (!s) return;
      set({
        plannedSession: {
          ...s,
          isDraft: true,
          exercises: s.exercises.filter((e) => e.exerciseId !== exerciseId),
        },
      });
    },

    startSession: () => {
      if (get().todayStatus === 'inProgress') return;
      const session = get().plannedSession;
      if (!session || !session.exercises || session.exercises.length === 0) return;
      const active: ActiveExercise[] = session.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        restSec: e.restSec,
        targetReps: e.reps,
        skipped: false,
        sets: Array.from({ length: e.sets }, () => ({
          weight: e.weight,
          reps: parseInt(e.reps, 10) || 10,
          done: false,
        })),
      }));
      set({
        active,
        currentIndex: 0,
        elapsedSec: 0,
        startedAt: new Date().toISOString(),
        paused: false,
        todayStatus: 'inProgress',
      });
    },

    tick: () => !get().paused && set({ elapsedSec: get().elapsedSec + 1 }),

    togglePause: () => set({ paused: !get().paused }),

    setCurrentIndex: (currentIndex) => set({ currentIndex }),

    updateSet: (exIndex: number, setIndex: number, patch: Partial<SetLog>) =>
      set({
        active: get().active.map((ex: ActiveExercise, i: number) =>
          i === exIndex
            ? {
                ...ex,
                sets: ex.sets.map((s: SetLog, j: number) =>
                  j === setIndex ? { ...s, ...patch } : s,
                ),
              }
            : ex,
        ),
      }),

    addSet: (exIndex: number) =>
      set({
        active: get().active.map((ex: ActiveExercise, i: number) => {
          if (i !== exIndex) return ex;
          const last = ex.sets[ex.sets.length - 1];
          return {
            ...ex,
            sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 10, done: false }],
          };
        }),
      }),

    skipExercise: (exIndex: number) =>
      set({
        active: get().active.map((ex: ActiveExercise, i: number) =>
          i === exIndex ? { ...ex, skipped: true } : ex,
        ),
      }),

    finishSession: () => {
      const { active, elapsedSec, plannedSession } = get();
      const doneSets = active
        .filter((exercise) => !exercise.skipped)
        .flatMap((e: ActiveExercise) => e.sets.filter((s: SetLog) => s.done));
      const volumeKg = doneSets.reduce((sum: number, s: SetLog) => sum + s.weight * s.reps, 0);
      const prs = 0; // Personal records are confirmed by the backend after saving.
      const durationMin = Math.max(1, Math.round(elapsedSec / 60));
      const calories = 0; // Available after the backend calculates the completed session.

      const clientSessionId = generateUUID();

      const log: WorkoutLog = {
        id: clientSessionId,
        date: 'Today',
        title: plannedSession?.title ?? 'Completed Workout',
        durationMin,
        volumeKg,
        sets: doneSets.length,
        prs,
        calories,
        source: 'FitOnus',
        clientSessionId,
        completedAt: new Date().toISOString(),
        pendingSync: true,
        exercises: active
          .filter((e: ActiveExercise) => !e.skipped)
          .map((e: ActiveExercise) => {
            const ex = get().getExerciseById(e.exerciseId);
            const best = e.sets
              .filter((s: SetLog) => s.done)
              .sort((a: SetLog, b: SetLog) => b.weight * b.reps - a.weight * a.reps)[0];
            return {
              name: ex ? ex.name : e.exerciseId,
              best: best ? `${best.weight || 'BW'}${best.weight ? ' kg' : ''} × ${best.reps}` : '—',
            };
          }),
      };

      set({ lastCompleted: log, todayStatus: 'completed' });
      return log;
    },

    saveCompleted: async (notes) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const { lastCompleted, history, active, elapsedSec, plannedSession } = get();
      if (
        !lastCompleted ||
        !lastCompleted.sets ||
        history.some((h) => h.clientSessionId === lastCompleted.clientSessionId)
      )
        return (
          !!lastCompleted &&
          history.some((entry) => entry.clientSessionId === lastCompleted.clientSessionId)
        );

      // Immediately persist in local UI history
      set({ history: [lastCompleted, ...history] });

      // Build backend atomic submission payload
      const clientSessionId = lastCompleted.clientSessionId || generateUUID();
      const startedAt =
        get().startedAt ?? new Date(Date.now() - Math.max(1, elapsedSec) * 1000).toISOString();
      const completedAt = lastCompleted.completedAt ?? new Date().toISOString();

      const completedSets = active
        .filter((exercise) => !exercise.skipped)
        .flatMap((ex) =>
          ex.sets
            .filter((s) => s.done)
            .map((s, idx) => ({
              exerciseId: resolveExerciseUuid(ex.exerciseId),
              setNumber: s.setNumber ?? idx + 1,
              weightKg: Number(s.weightKg ?? s.weight) || 0,
              reps: Number(s.reps) || 1,
              isWarmup: Boolean(s.isWarmup),
              rpe: s.rpe ?? null,
            })),
        );

      if (!completedSets.length) return false;
      const sets = completedSets;

      const payload: SaveWorkoutSessionInput = {
        clientSessionId,
        workoutName: plannedSession?.title || 'Completed Workout',
        planId:
          plannedSession?.id && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(plannedSession.id)
            ? plannedSession.id
            : null,
        startedAt,
        completedAt,
        durationSeconds: Math.max(1, elapsedSec),
        sets,
        ...(notes ? { notes } : {}),
      };

      try {
        const { response, isOffline } = await WorkoutService.saveSession(payload);
        session.assertCurrent();
        if (isOffline) {
          showToast({ message: 'Session saved offline · pending sync to server', tone: 'info' });
        } else {
          showToast({ message: 'Workout recorded and synced to server' });
        }
        set((state) => ({
          lastCompleted: {
            ...lastCompleted,
            id: response.id,
            calories: response.estimatedCaloriesBurned,
            prs: response.personalRecords?.length ?? 0,
            pendingSync: isOffline,
            caloriesSource: response.caloriesSource,
          },
          history: state.history.map((h) =>
            h.id === lastCompleted.id || h.clientSessionId === clientSessionId
              ? {
                  ...h,
                  id: response.id,
                  volumeKg: response.totalVolumeKg,
                  calories: response.estimatedCaloriesBurned,
                  prs: response.personalRecords?.length ?? h.prs,
                  pendingSync: isOffline,
                  clientSessionId,
                  completedAt: response.completedAt,
                  isCaloriesEstimated: response.isCaloriesEstimated,
                  caloriesSource: response.caloriesSource,
                }
              : h,
          ),
          pendingSyncCount: isOffline ? state.pendingSyncCount + 1 : state.pendingSyncCount,
        }));
        refreshFitnessQueries();
        if (!isOffline)
          void get()
            .loadHistoryFromBackend()
            .catch(() => {});
        return true;
      } catch (err) {
        if (!session.isCurrent()) return false;
        set({
          history: get().history.filter((entry) => entry.clientSessionId !== clientSessionId),
        });
        logger.error('Could not save workout:', err);
        showToast({
          message: 'Could not save this workout. Your sets are still here. Please try again.',
          tone: 'error',
        });
        return false;
      }
    },

    logExternal: (log: WorkoutLog) => {
      set({ history: [log, ...get().history], todayStatus: 'completed' });
    },

    loadHistoryFromBackend: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const res = await workoutApi.getWorkoutSessions({ limit: 20 });
        if (!session.isCurrent()) return;
        set({ history: historyForPresentation(res.sessions ?? [], get().history) });
      } catch (err) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to load sessions history from backend:', err);
      }
    },

    syncOfflineSessions: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      try {
        const { synced, failed } = await offlineSyncService.syncPendingSessions();
        if (!session.isCurrent()) return;
        if (synced > 0) {
          const pendingCount = await offlineSyncService.getPendingCount();
          if (!session.isCurrent()) return;
          set({ pendingSyncCount: pendingCount });
          await get().loadHistoryFromBackend();
          if (!session.isCurrent()) return;
          void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }
      } catch (err) {
        if (!session.isCurrent()) return;
        logger.warn('Offline sync failed:', err);
      }
    },
  };
});

registerUserStore(useWorkoutStore);

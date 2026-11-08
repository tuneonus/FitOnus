import { create } from 'zustand';
import type { ActiveExercise, SetLog, WorkoutLog, WorkoutSession, SaveWorkoutSessionInput, Exercise } from '../types/workout';
import { exerciseById, exercises as fallbackExercises, todaySession } from '../data/workoutsMock';
import { WorkoutService } from '../services/workout-service';
import { offlineSyncService } from '../services/offline-sync';
import { workoutApi } from '../api/workout-api';
import { showToast } from '../../../shared/stores/toastStore';
import { queryClient } from '../../../providers/query-provider';
import { logger } from '@/utils/logger';

type TodayStatus = 'notStarted' | 'inProgress' | 'completed';

const SLUG_TO_UUID: Record<string, string> = {
  'bench': 'e0000000-0000-4000-8000-000000000001',
  'incline-db': 'e0000000-0000-4000-8000-000000000002',
  'cable-fly': 'e0000000-0000-4000-8000-000000000003',
  'oh-tricep': 'e0000000-0000-4000-8000-000000000004',
  'dips': 'e0000000-0000-4000-8000-000000000005',
  'lateral': 'e0000000-0000-4000-8000-000000000006',
  'squat': 'e0000000-0000-4000-8000-000000000007',
  'rdl': 'e0000000-0000-4000-8000-000000000008',
  'pullup': 'e0000000-0000-4000-8000-000000000009',
  'row': 'e0000000-0000-4000-8000-000000000010',
  'goblet': 'e0000000-0000-4000-8000-000000000011',
  'plank': 'e0000000-0000-4000-8000-000000000012',
  'burpee': 'e0000000-0000-4000-8000-000000000013',
  'kb-swing': 'e0000000-0000-4000-8000-000000000014',
};

export function resolveExerciseUuid(idOrSlug: string): string {
  return SLUG_TO_UUID[idOrSlug] || idOrSlug;
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
  plannedSession: WorkoutSession;
  todayStatus: TodayStatus;
  history: WorkoutLog[];
  active: ActiveExercise[];
  currentIndex: number;
  elapsedSec: number;
  paused: boolean;
  lastCompleted: WorkoutLog | null;
  pendingSyncCount: number;
  loadExercises: () => Promise<void>;
  getExerciseById: (id: string) => Exercise;
  setPlannedSession: (session: WorkoutSession) => void;
  removePlannedExercise: (exerciseId: string) => void;
  startSession: () => void;
  tick: () => void;
  togglePause: () => void;
  setCurrentIndex: (i: number) => void;
  updateSet: (exIndex: number, setIndex: number, patch: Partial<SetLog>) => void;
  addSet: (exIndex: number) => void;
  skipExercise: (exIndex: number) => void;
  finishSession: () => WorkoutLog;
  saveCompleted: () => void;
  logExternal: (log: WorkoutLog) => void;
  loadHistoryFromBackend: () => Promise<void>;
  syncOfflineSessions: () => Promise<void>;
  resetStore: () => void;
};

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  catalog: fallbackExercises,
  plannedSession: todaySession,
  todayStatus: 'notStarted',
  history: [],
  active: [],
  currentIndex: 0,
  elapsedSec: 0,
  paused: false,
  lastCompleted: null,
  pendingSyncCount: 0,

  resetStore: () => {
    set({
      todayStatus: 'notStarted',
      history: [],
      active: [],
      currentIndex: 0,
      elapsedSec: 0,
      paused: false,
      lastCompleted: null,
      pendingSyncCount: 0,
    });
  },

  loadExercises: async () => {
    try {
      const items = await WorkoutService.getExercises({ limit: 100 });
      if (items && items.length > 0) {
        set({ catalog: items });
      }
    } catch (err) {
      logger.warn('Failed to load exercises into workoutStore:', err);
    }
  },

  getExerciseById: (id: string): Exercise => {
    const { catalog } = get();
    const match = catalog.find((e) => e.id === id || e.slug === id);
    if (match) return match;
    return exerciseById(id);
  },

  setPlannedSession: (plannedSession) => set({ plannedSession }),

  removePlannedExercise: (exerciseId) => {
    const s = get().plannedSession;
    set({
      plannedSession: {
        ...s,
        exercises: s.exercises.filter((e) => e.exerciseId !== exerciseId),
      },
    });
  },

  startSession: () => {
    if (get().todayStatus === 'inProgress') return;
    const active: ActiveExercise[] = get().plannedSession.exercises.map((e) => ({
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
                j === setIndex ? { ...s, ...patch } : s
              ),
            }
          : ex
      ),
    }),

  addSet: (exIndex: number) =>
    set({
      active: get().active.map((ex: ActiveExercise, i: number) => {
        if (i !== exIndex) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            { weight: last?.weight ?? 0, reps: last?.reps ?? 10, done: false },
          ],
        };
      }),
    }),

  skipExercise: (exIndex: number) =>
    set({
      active: get().active.map((ex: ActiveExercise, i: number) =>
        i === exIndex ? { ...ex, skipped: true } : ex
      ),
    }),

  finishSession: () => {
    const { active, elapsedSec, plannedSession } = get();
    const doneSets = active.flatMap((e: ActiveExercise) =>
      e.sets.filter((s: SetLog) => s.done)
    );
    const volumeKg = doneSets.reduce(
      (sum: number, s: SetLog) => sum + s.weight * s.reps,
      0
    );
    const benchTop =
      active[0]?.sets.filter((s: SetLog) => s.done).some((s: SetLog) => s.weight >= 75) ?? false;
    const prs = benchTop ? 1 : 0;
    const durationMin = Math.max(1, Math.round(elapsedSec / 60));
    const calories = Math.round(durationMin * 7.5);

    const clientSessionId = generateUUID();

    const log: WorkoutLog = {
      id: clientSessionId,
      date: 'Today',
      title: plannedSession.title,
      durationMin,
      volumeKg,
      sets: doneSets.length,
      prs,
      calories,
      avgHr: 126,
      source: 'FitOnus',
      clientSessionId,
      pendingSync: false,
      exercises: active
        .filter((e: ActiveExercise) => !e.skipped)
        .map((e: ActiveExercise) => {
          const ex = get().getExerciseById(e.exerciseId);
          const best = e.sets
            .filter((s: SetLog) => s.done)
            .sort(
              (a: SetLog, b: SetLog) =>
                b.weight * b.reps - a.weight * a.reps
            )[0];
          return {
            name: ex ? ex.name : e.exerciseId,
            best: best
              ? `${best.weight || 'BW'}${best.weight ? ' kg' : ''} × ${best.reps}`
              : '—',
          };
        }),
    };

    set({ lastCompleted: log, todayStatus: 'completed' });
    return log;
  },

  saveCompleted: () => {
    const { lastCompleted, history, active, elapsedSec, plannedSession } = get();
    if (!lastCompleted) return;

    // Immediately persist in local UI history
    set({ history: [lastCompleted, ...history] });

    // Build backend atomic submission payload
    const clientSessionId = lastCompleted.clientSessionId || generateUUID();
    const startedAt = new Date(Date.now() - Math.max(1, elapsedSec) * 1000).toISOString();
    const completedAt = new Date().toISOString();

    const completedSets = active.flatMap((ex) =>
      ex.sets
        .filter((s) => s.done)
        .map((s, idx) => ({
          exerciseId: resolveExerciseUuid(ex.exerciseId),
          setNumber: s.setNumber ?? idx + 1,
          weightKg: Number(s.weightKg ?? s.weight) || 0,
          reps: Number(s.reps) || 1,
          isWarmup: Boolean(s.isWarmup),
          rpe: s.rpe ?? null,
        }))
    );

    // Fallback if sets were empty
    const sets = completedSets.length > 0
      ? completedSets
      : [{
          exerciseId: resolveExerciseUuid('bench'),
          setNumber: 1,
          weightKg: 50,
          reps: 10,
          isWarmup: false,
        }];

    const payload: SaveWorkoutSessionInput = {
      clientSessionId,
      workoutName: plannedSession.title || 'Completed Workout',
      planId: plannedSession.id && !plannedSession.id.startsWith('push-') ? plannedSession.id : null,
      startedAt,
      completedAt,
      durationSeconds: Math.max(1, elapsedSec),
      sets,
    };

    // Asynchronously dispatch to backend with offline fallback
    WorkoutService.saveSession(payload)
      .then(({ response, isOffline }) => {
        if (isOffline) {
          showToast({ message: 'Session saved offline · pending sync to server', tone: 'info' });
        } else {
          showToast({ message: 'Workout recorded and synced to server' });
        }
        set((state) => ({
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
              : h
          ),
          pendingSyncCount: isOffline ? state.pendingSyncCount + 1 : state.pendingSyncCount,
        }));
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .catch((err) => {
        logger.error('Unexpected error saving workout session:', err);
      });
  },

  logExternal: (log: WorkoutLog) => {
    set({ history: [log, ...get().history], todayStatus: 'completed' });
  },

  loadHistoryFromBackend: async () => {
    try {
      const res = await workoutApi.getWorkoutSessions({ limit: 20 });
      if (res.sessions && res.sessions.length > 0) {
        const mappedSessions: WorkoutLog[] = res.sessions.map((s: any) => ({
          id: s.id,
          date: s.completedAt ? new Date(s.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent',
          title: s.workoutName,
          durationMin: Math.max(1, Math.round(s.durationSeconds / 60)),
          volumeKg: s.totalVolumeKg,
          sets: s.totalSets,
          prs: 0,
          calories: s.estimatedCaloriesBurned,
          source: 'FitOnus',
          clientSessionId: s.clientSessionId,
          pendingSync: false,
          exercises: [],
        }));
        set({ history: mappedSessions });
      }
    } catch (err) {
      logger.warn('Failed to load sessions history from backend:', err);
    }
  },

  syncOfflineSessions: async () => {
    try {
      const { synced, failed } = await offlineSyncService.syncPendingSessions();
      if (synced > 0) {
        const pendingCount = await offlineSyncService.getPendingCount();
        set({ pendingSyncCount: pendingCount });
        await get().loadHistoryFromBackend();
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    } catch (err) {
      logger.warn('Offline sync failed:', err);
    }
  },
}));

import { create } from 'zustand';
import type { ActiveExercise, SetLog, WorkoutLog, WorkoutSession } from '../types/workout';
import { exerciseById, initialWorkoutHistory, todaySession } from '../data/workoutsMock';

type TodayStatus = 'notStarted' | 'inProgress' | 'completed';

type WorkoutState = {
  plannedSession: WorkoutSession;
  todayStatus: TodayStatus;
  history: WorkoutLog[];
  active: ActiveExercise[];
  currentIndex: number;
  elapsedSec: number;
  paused: boolean;
  lastCompleted: WorkoutLog | null;
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
};

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  plannedSession: todaySession,
  todayStatus: 'notStarted',
  history: initialWorkoutHistory,
  active: [],
  currentIndex: 0,
  elapsedSec: 0,
  paused: false,
  lastCompleted: null,
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

    const log: WorkoutLog = {
      id: `w-${Date.now()}`,
      date: 'Today',
      title: plannedSession.title,
      durationMin,
      volumeKg,
      sets: doneSets.length,
      prs,
      calories,
      avgHr: 126,
      source: 'FitOnus',
      exercises: active
        .filter((e: ActiveExercise) => !e.skipped)
        .map((e: ActiveExercise) => {
          const ex = exerciseById(e.exerciseId);
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
    const { lastCompleted, history } = get();
    if (!lastCompleted) return;
    set({ history: [lastCompleted, ...history] });
  },
  logExternal: (log: WorkoutLog) => {
    set({ history: [log, ...get().history], todayStatus: 'completed' });
  },
}));

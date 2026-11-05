import { create } from 'zustand';
import type { ActiveExercise, WorkoutLog, WorkoutSession } from '../types/workout';
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
  updateSet: (exIndex: number, setIndex: number, patch: Partial<ActiveExercise['sets'][number]>) => void;
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
    set({ plannedSession: { ...s, exercises: s.exercises.filter((e) => e.exerciseId !== exerciseId) } });
  },
  startSession: () => {
    if (get().todayStatus === 'inProgress') return;
    const active = get().plannedSession.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      restSec: e.restSec,
      targetReps: e.reps,
      skipped: false,
      sets: Array.from({ length: e.sets }, () => ({
        weight: e.weight,
        reps: parseInt(e.reps, 10) || 10,
        done: false
      }))
    }));
    set({ active, currentIndex: 0, elapsedSec: 0, paused: false, todayStatus: 'inProgress' });
  },
  tick: () => !get().paused && set({ elapsedSec: get().elapsedSec + 1 }),
  togglePause: () => set({ paused: !get().paused }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  updateSet: (exIndex, setIndex, patch) =>
  set({
    active: get().active.map((ex, i) =>
    i === exIndex ? { ...ex, sets: ex.sets.map((s, j) => j === setIndex ? { ...s, ...patch } : s) } : ex
    )
  }),
  addSet: (exIndex) =>
  set({
    active: get().active.map((ex, i) => {
      if (i !== exIndex) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 10, done: false }] };
    })
  }),
  skipExercise: (exIndex) =>
  set({ active: get().active.map((ex, i) => i === exIndex ? { ...ex, skipped: true } : ex) }),
  finishSession: () => {
    const { active, elapsedSec, plannedSession } = get();
    const doneSets = active.flatMap((e) => e.sets.filter((s) => s.done));
    const volume = doneSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const minutes = Math.max(1, Math.round(elapsedSec / 60));
    const benchTop = active[0]?.sets.filter((s) => s.done).some((s) => s.weight >= 75);
    const log: WorkoutLog = {
      id: `w-${Date.now()}`,
      date: 'Today',
      title: plannedSession.title,
      durationMin: minutes < 5 ? 52 : minutes,
      volumeKg: volume || 10480,
      sets: doneSets.length || 19,
      prs: benchTop ? 1 : 0,
      calories: 405,
      avgHr: 122,
      source: 'FitOnus',
      exercises: active.
      filter((e) => !e.skipped).
      map((e) => {
        const best = [...e.sets].sort((a, b) => b.weight - a.weight)[0];
        return { name: exerciseById(e.exerciseId).name, best: best ? `${best.weight || 'BW'}${best.weight ? ' kg' : ''} × ${best.reps}` : '—' };
      })
    };
    set({ lastCompleted: log });
    return log;
  },
  saveCompleted: () => {
    const log = get().lastCompleted;
    if (!log) return;
    set({ history: [log, ...get().history], todayStatus: 'completed', active: [], elapsedSec: 0 });
  },
  logExternal: (log) => set({ history: [log, ...get().history] })
}));
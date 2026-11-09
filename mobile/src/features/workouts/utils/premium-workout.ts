import type { Exercise, WorkoutLog } from '../types/workout';

export function filterExercises(
  exercises: Exercise[],
  query: string,
  muscle: string,
  equipment: string,
): Exercise[] {
  const key = (value: string) => value.trim().toLowerCase();
  return exercises.filter((exercise) => {
    const muscles = [
      exercise.muscle ?? '',
      exercise.primaryMuscle ?? '',
      ...(exercise.primaryMuscles ?? []),
    ];
    return (
      key(exercise.name).includes(key(query)) &&
      (muscle === 'All' || muscles.some((value) => key(value) === key(muscle))) &&
      (equipment === 'All' || key(exercise.equipment) === key(equipment))
    );
  });
}

/** Reject invalid input instead of silently turning an incomplete edit into a zero set. */
export function parseWorkoutInput(raw: string, wholeNumber = false): number | null {
  const text = raw.trim().replace(',', '.');
  if (!(wholeNumber ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/).test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && (!wholeNumber || Number.isSafeInteger(value))
    ? value
    : null;
}

export type HistorySession = {
  id: string;
  clientSessionId?: string;
  completedAt?: string;
  workoutName: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  estimatedCaloriesBurned: number;
};
/** Retain actual timestamps and local pending sessions; never infer a missing calendar year. */
export function historyForPresentation(
  sessions: HistorySession[],
  saved: WorkoutLog[],
): WorkoutLog[] {
  const ids = new Set(
    sessions.flatMap((session) => [session.id, session.clientSessionId].filter(Boolean)),
  );
  const local = saved.filter(
    (log) =>
      (log.pendingSync || log.date === 'Today') &&
      !ids.has(log.id) &&
      !ids.has(log.clientSessionId),
  );
  return [
    ...local,
    ...sessions.map((session): WorkoutLog => ({
      id: session.id,
      date:
        session.completedAt && Number.isFinite(Date.parse(session.completedAt))
          ? new Date(session.completedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Date unavailable',
      ...(session.completedAt ? { completedAt: session.completedAt } : {}),
      ...(session.clientSessionId ? { clientSessionId: session.clientSessionId } : {}),
      title: session.workoutName,
      durationMin: Math.max(1, Math.round(session.durationSeconds / 60)),
      volumeKg: session.totalVolumeKg,
      sets: session.totalSets,
      calories: session.estimatedCaloriesBurned,
      source: 'FitOnus',
      pendingSync: false,
      isCaloriesEstimated: true,
      caloriesSource: 'estimated',
      prs:
        saved.find(
          (log) =>
            log.id === session.id ||
            Boolean(session.clientSessionId && log.clientSessionId === session.clientSessionId),
        )?.prs ?? 0,
      exercises:
        saved.find(
          (log) =>
            log.id === session.id ||
            Boolean(session.clientSessionId && log.clientSessionId === session.clientSessionId),
        )?.exercises ?? [],
    })),
  ];
}

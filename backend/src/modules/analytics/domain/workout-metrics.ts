/**
 * Workout Analytics Domain Models & Calculation Engine
 *
 * Implements pure deterministic algorithms for workout frequency, duration,
 * training volume, exercise-specific progression, and estimated 1RM.
 */

import type { AnalyticsPeriodBucket } from './analytics-period.js';

export interface RawWorkoutSessionRecord {
  id: string;
  workoutName: string;
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  isCompleted: boolean;
}

export interface RawExerciseSetRecord {
  setId: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  isPr: boolean;
  rpe: number | null;
  startedAt: Date;
}

export interface RawExercisePrRecord {
  recordType: string;
  weightKg: number;
  reps: number;
  volumeKg: number;
  estimated1rmKg: number;
  achievedAt: Date;
}

export interface WorkoutFrequencyPoint {
  label: string;
  value: number; // completed sessions
}

export interface WorkoutVolumePoint {
  label: string;
  value: number; // total volume in kg
}

export interface WorkoutDurationPoint {
  label: string;
  value: number; // average duration in minutes
}

export interface ExerciseProgressionPoint {
  date: string;
  topWeightKg: number;
  reps: number;
  estimated1rmKg: number;
  volumeKg: number;
}

export interface WorkoutAnalyticsSummary {
  totalSessions: number;
  totalVolumeKg: number;
  totalDurationMinutes: number;
  avgDurationMin: number;
  consistencyPct: number;
  frequencySeries: WorkoutFrequencyPoint[];
  volumeSeries: WorkoutVolumePoint[];
  durationSeries: WorkoutDurationPoint[];
}

/**
 * Calculates Estimated One Rep Max (e1RM) using the standard Epley formula.
 *
 * Formula:
 *   e1RM = weightKg * (1 + reps / 30)   for reps > 1
 *   e1RM = weightKg                     for reps == 1
 *
 * Handles zero/negative values safely and rounds to 1 decimal place.
 */
export function calculateEstimated1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg * 10) / 10;
  const e1rm = weightKg * (1 + reps / 30);
  return Math.round(e1rm * 10) / 10;
}

/**
 * Aggregates completed workout session count across discrete period buckets.
 */
export function calculateWorkoutFrequency(
  sessions: readonly RawWorkoutSessionRecord[],
  buckets: readonly AnalyticsPeriodBucket[],
): WorkoutFrequencyPoint[] {
  return buckets.map((bucket) => {
    const count = sessions.filter(
      (s) => s.isCompleted && s.startedAt >= bucket.startDate && s.startedAt <= bucket.endDate,
    ).length;
    return {
      label: bucket.label,
      value: count,
    };
  });
}

/**
 * Aggregates total lifted volume (kg) across discrete period buckets.
 */
export function calculateTrainingVolume(
  sessions: readonly RawWorkoutSessionRecord[],
  buckets: readonly AnalyticsPeriodBucket[],
): WorkoutVolumePoint[] {
  return buckets.map((bucket) => {
    const inBucket = sessions.filter(
      (s) => s.isCompleted && s.startedAt >= bucket.startDate && s.startedAt <= bucket.endDate,
    );
    const volume = inBucket.reduce((sum, s) => sum + (s.totalVolumeKg || 0), 0);
    return {
      label: bucket.label,
      value: Math.round(volume),
    };
  });
}

/**
 * Aggregates average session duration (minutes) across discrete period buckets.
 */
export function calculateWorkoutDuration(
  sessions: readonly RawWorkoutSessionRecord[],
  buckets: readonly AnalyticsPeriodBucket[],
): WorkoutDurationPoint[] {
  return buckets.map((bucket) => {
    const inBucket = sessions.filter(
      (s) => s.isCompleted && s.startedAt >= bucket.startDate && s.startedAt <= bucket.endDate,
    );
    if (inBucket.length === 0) {
      return { label: bucket.label, value: 0 };
    }
    const totalDurationSeconds = inBucket.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const avgMinutes = Math.round(totalDurationSeconds / inBucket.length / 60);
    return {
      label: bucket.label,
      value: avgMinutes,
    };
  });
}

/**
 * Calculates consistency percentage against user's target workout frequency.
 *
 * @param frequencyInWindow Actual completed session count in window
 * @param targetDaysPerWeek Target days per week (defaults to 3 if null or <= 0)
 * @param numberOfWeeks Number of weeks in evaluation window (default 1)
 */
export function calculateWorkoutConsistency(
  frequencyInWindow: number,
  targetDaysPerWeek: number | null,
  numberOfWeeks: number = 1,
): number {
  const weeks = Math.max(1, numberOfWeeks);
  const targetPerWeek = targetDaysPerWeek && targetDaysPerWeek > 0 ? targetDaysPerWeek : 3;
  const totalTarget = targetPerWeek * weeks;
  if (totalTarget <= 0) return 0;

  const ratio = (frequencyInWindow / totalTarget) * 100;
  return Math.min(100, Math.round(ratio));
}

/**
 * Builds chronological exercise strength progression curve from historical sets.
 *
 * Excludes warmups, identifies the top set (highest e1RM) per session, and
 * calculates total volume lifted for that exercise in each session.
 */
export function buildExerciseProgression(
  sets: readonly RawExerciseSetRecord[],
): ExerciseProgressionPoint[] {
  if (!sets || sets.length === 0) return [];

  // Group non-warmup sets by session ID
  const sessionMap = new Map<
    string,
    {
      date: string;
      startedAt: Date;
      sets: RawExerciseSetRecord[];
    }
  >();

  for (const s of sets) {
    if (s.isWarmup) continue;
    const dateStr = s.startedAt.toISOString().slice(0, 10);
    const existing = sessionMap.get(s.sessionId);
    if (existing) {
      existing.sets.push(s);
    } else {
      sessionMap.set(s.sessionId, {
        date: dateStr,
        startedAt: s.startedAt,
        sets: [s],
      });
    }
  }

  // Sort sessions chronologically
  const sortedSessions = Array.from(sessionMap.values()).sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );

  const progression: ExerciseProgressionPoint[] = [];

  for (const session of sortedSessions) {
    let topSet = session.sets[0]!;
    let maxE1rm = calculateEstimated1rm(topSet.weightKg, topSet.reps);
    let sessionExerciseVolume = 0;

    for (const set of session.sets) {
      sessionExerciseVolume += set.weightKg * set.reps;
      const setE1rm = calculateEstimated1rm(set.weightKg, set.reps);
      if (setE1rm > maxE1rm) {
        maxE1rm = setE1rm;
        topSet = set;
      } else if (setE1rm === maxE1rm && set.weightKg > topSet.weightKg) {
        topSet = set;
      }
    }

    progression.push({
      date: session.date,
      topWeightKg: topSet.weightKg,
      reps: topSet.reps,
      estimated1rmKg: maxE1rm,
      volumeKg: Math.round(sessionExerciseVolume),
    });
  }

  return progression;
}

/**
 * Assembles full workout analytics summary across given period buckets.
 */
export function summarizeWorkoutAnalytics(
  sessions: readonly RawWorkoutSessionRecord[],
  buckets: readonly AnalyticsPeriodBucket[],
  targetDaysPerWeek: number | null,
): WorkoutAnalyticsSummary {
  const completedSessions = sessions.filter((s) => s.isCompleted);
  const totalSessions = completedSessions.length;
  const totalVolumeKg = Math.round(
    completedSessions.reduce((sum, s) => sum + (s.totalVolumeKg || 0), 0),
  );
  const totalDurationSeconds = completedSessions.reduce(
    (sum, s) => sum + (s.durationSeconds || 0),
    0,
  );
  const totalDurationMinutes = Math.round(totalDurationSeconds / 60);
  const avgDurationMin =
    totalSessions > 0 ? Math.round(totalDurationMinutes / totalSessions) : 0;

  const frequencySeries = calculateWorkoutFrequency(completedSessions, buckets);
  const volumeSeries = calculateTrainingVolume(completedSessions, buckets);
  const durationSeries = calculateWorkoutDuration(completedSessions, buckets);

  // Consistency across the full bucket range (e.g. 4 weeks for 'M')
  const weeksCount = Math.max(1, Math.round(buckets.length * (buckets[0]?.dateStrings.length || 1) / 7));
  const consistencyPct = calculateWorkoutConsistency(totalSessions, targetDaysPerWeek, weeksCount);

  return {
    totalSessions,
    totalVolumeKg,
    totalDurationMinutes,
    avgDurationMin,
    consistencyPct,
    frequencySeries,
    volumeSeries,
    durationSeries,
  };
}


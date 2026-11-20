import type { WorkoutPlanDetailView, WorkoutSession } from '../types/workout';
import { workoutCoverUri } from './workout-cover';

/**
 * The planned session the Home and Training cards and the workout plan screen show, built from the plan the backend
 * returned. Kept free of React so the mapping can be tested directly.
 *
 * `coverImageUrl` is the routine's cover when it is a curated template that has one. It passes through `workoutCoverUri`
 * here as well as in the picture component, so an address that is not https never even enters the store, and a plan
 * without a cover (or from an older backend that has no such field) simply has `null`.
 */
export function plannedSessionFromPlan(plan: WorkoutPlanDetailView): WorkoutSession {
  return {
    id: plan.id,
    title: plan.name,
    focus: plan.description ?? '',
    durationMin: plan.estimatedDurationMinutes ?? 0,
    intensity: plan.difficulty,
    coverImageUrl: workoutCoverUri(plan.coverImageUrl),
    exercises: plan.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.targetSets,
      reps: exercise.targetReps,
      restSec: exercise.restSeconds ?? 0,
      weight: 0,
    })),
  };
}

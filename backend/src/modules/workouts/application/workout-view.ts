import type { PublicImageUrlResolver } from '../../../shared/images/public-image-url.js';
import type { Exercise, ExerciseDifficulty } from '../domain/exercise.js';
import {
  displayableExternalUrl,
  effectiveImageUrl,
  NO_EXERCISE_IMAGE_URLS,
} from '../domain/exercise-image.js';
import type { PersonalRecord } from '../domain/personal-record.js';
import { NO_WORKOUT_COVER_URLS } from '../domain/workout-cover.js';
import type { WorkoutPlan, WorkoutPlanExercise } from '../domain/workout-plan.js';
import type { WorkoutSession, WorkoutSessionSet } from '../domain/workout-session.js';

export interface ExerciseView {
  id: string;
  name: string;
  description: string | null;
  instructions: string[];
  tips: string[];
  commonMistakes: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  difficulty: ExerciseDifficulty;
  isCompound: boolean;
  /**
   * The image to show: the uploaded one when there is one, otherwise the external URL. This is the field the mobile
   * app has always read, so its meaning ("the picture to display") and its type do not change.
   */
  imageUrl: string | null;
  /** Key of the uploaded image, or null. Round-tripped by the admin editor. */
  imageKey: string | null;
  /** The external address an admin typed (http or https), or null. The admin editor's fallback field. */
  externalImageUrl: string | null;
  videoUrl: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One place that turns a stored exercise into its API shape, for the member app and the admin console alike, so every
 * response derives the image the same way. `resolveKeyUrl` is the trusted-origin URL builder for uploaded images.
 */
export function toExerciseView(
  exercise: Exercise,
  resolveKeyUrl: PublicImageUrlResolver = NO_EXERCISE_IMAGE_URLS,
): ExerciseView {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    instructions: [...exercise.instructions],
    tips: [...exercise.tips],
    commonMistakes: [...exercise.commonMistakes],
    primaryMuscles: [...exercise.primaryMuscles],
    secondaryMuscles: [...exercise.secondaryMuscles],
    equipment: exercise.equipment,
    category: exercise.category,
    difficulty: exercise.difficulty,
    isCompound: exercise.isCompound,
    imageUrl: effectiveImageUrl(exercise, resolveKeyUrl),
    imageKey: exercise.imageKey,
    externalImageUrl: displayableExternalUrl(exercise.imageUrl),
    // A value saved before the http/https rule existed is never passed on.
    videoUrl: displayableExternalUrl(exercise.videoUrl),
    isSystem: exercise.isSystem,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}

export interface WorkoutPlanExerciseView {
  id: string;
  workoutId: string;
  exerciseId: string;
  exerciseName?: string;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetDurationSeconds: number | null;
  targetWeightKg: number;
  restSeconds: number;
  notes: string | null;
  supersetGroup: number | null;
}

export function toWorkoutPlanExerciseView(ex: WorkoutPlanExercise): WorkoutPlanExerciseView {
  return {
    id: ex.id,
    workoutId: ex.workoutId,
    exerciseId: ex.exerciseId,
    orderIndex: ex.orderIndex,
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    targetDurationSeconds: ex.targetDurationSeconds,
    targetWeightKg: Number(ex.targetWeightKg),
    restSeconds: ex.restSeconds,
    notes: ex.notes,
    supersetGroup: ex.supersetGroup,
  };
}

export interface WorkoutPlanView {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  workoutType: string;
  estimatedDurationMinutes: number;
  difficulty: ExerciseDifficulty;
  isTemplate: boolean;
  isAiGenerated: boolean;
  tags: string[];
  /** Public URL of the template's cover image, or null (always null for a member's own routine). Additive. */
  coverImageUrl: string | null;
  /** Key of the cover image, or null. Round-tripped by the admin editor; the member app does not use it. */
  coverImageKey: string | null;
  exercisesCount: number;
  exercises?: WorkoutPlanExerciseView[];
  createdAt: string;
  updatedAt: string;
}

/**
 * One place that turns a stored plan into its API shape, for members and the admin console alike. `resolveCoverUrl`
 * is the trusted-origin URL builder for covers; a key that is not a canonical workout key resolves to nothing.
 */
export function toWorkoutPlanView(
  plan: WorkoutPlan,
  includeExercises = false,
  resolveCoverUrl: PublicImageUrlResolver = NO_WORKOUT_COVER_URLS,
): WorkoutPlanView {
  return {
    id: plan.id,
    userId: plan.userId,
    name: plan.name,
    description: plan.description,
    workoutType: plan.workoutType,
    estimatedDurationMinutes: plan.estimatedDurationMinutes,
    difficulty: plan.difficulty,
    isTemplate: plan.isTemplate,
    isAiGenerated: plan.isAiGenerated,
    tags: [...plan.tags],
    coverImageUrl: resolveCoverUrl(plan.coverImageKey),
    coverImageKey: plan.coverImageKey,
    exercisesCount: plan.exercises.length,
    ...(includeExercises ? { exercises: plan.exercises.map(toWorkoutPlanExerciseView) } : {}),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export interface WorkoutSessionSetView {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName?: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  durationSeconds: number | null;
  isWarmup: boolean;
  isDropset: boolean;
  isFailure: boolean;
  isPr: boolean;
  rpe: number | null;
  notes: string | null;
}

export function toWorkoutSessionSetView(set: WorkoutSessionSet): WorkoutSessionSetView {
  return {
    id: set.id,
    sessionId: set.sessionId,
    exerciseId: set.exerciseId,
    exerciseName: set.exerciseName,
    setNumber: set.setNumber,
    weightKg: Number(set.weightKg),
    reps: set.reps,
    durationSeconds: set.durationSeconds,
    isWarmup: set.isWarmup,
    isDropset: set.isDropset,
    isFailure: set.isFailure,
    isPr: set.isPr,
    rpe: set.rpe,
    notes: set.notes,
  };
}

export interface PersonalRecordView {
  id: string;
  exerciseId: string;
  exerciseName?: string;
  recordType: string;
  weightKg: number;
  reps: number;
  volumeKg: number;
  estimated1rmKg: number;
  sessionId: string | null;
  achievedAt: string;
  createdAt: string;
}

export function toPersonalRecordView(pr: PersonalRecord): PersonalRecordView {
  return {
    id: pr.id,
    exerciseId: pr.exerciseId,
    exerciseName: pr.exerciseName,
    recordType: pr.recordType,
    weightKg: Number(pr.weightKg),
    reps: pr.reps,
    volumeKg: Number(pr.volumeKg),
    estimated1rmKg: Number(pr.estimated1rmKg),
    sessionId: pr.sessionId,
    achievedAt: pr.achievedAt.toISOString(),
    createdAt: pr.createdAt.toISOString(),
  };
}

export interface WorkoutSessionView {
  id: string;
  userId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  caloriesBurned: number | null;
  caloriesSource: string;
  isCaloriesEstimated: boolean;
  difficultyRating: number | null;
  notes: string | null;
  isCompleted: boolean;
  sets: WorkoutSessionSetView[];
  newPersonalRecords?: PersonalRecordView[];
  createdAt: string;
}

export function toWorkoutSessionView(session: WorkoutSession, newPRs?: PersonalRecord[]): WorkoutSessionView {
  return {
    id: session.id,
    userId: session.userId,
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt.toISOString(),
    durationSeconds: session.durationSeconds,
    totalVolumeKg: Number(session.totalVolumeKg),
    totalSets: session.totalSets,
    totalReps: session.totalReps,
    caloriesBurned: session.caloriesBurned,
    caloriesSource: session.caloriesSource,
    isCaloriesEstimated: session.isCaloriesEstimated,
    difficultyRating: session.difficultyRating,
    notes: session.notes,
    isCompleted: session.isCompleted,
    sets: session.sets.map(toWorkoutSessionSetView),
    ...(newPRs ? { newPersonalRecords: newPRs.map(toPersonalRecordView) } : {}),
    createdAt: session.createdAt.toISOString(),
  };
}

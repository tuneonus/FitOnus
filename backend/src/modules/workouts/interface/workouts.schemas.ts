import { z } from 'zod';
import { idempotencyHeadersSchema } from '../../../shared/http/schemas.js';
import { EXERCISE_DIFFICULTIES } from '../domain/exercise.js';
import { PR_RECORD_TYPES } from '../domain/personal-record.js';
import { CALORIE_SOURCES } from '../domain/workout-session.js';

// --- Shared Schemas ---

export const exerciseViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  instructions: z.array(z.string()),
  tips: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string(),
  category: z.string(),
  difficulty: z.enum(EXERCISE_DIFFICULTIES),
  isCompound: z.boolean(),
  imageUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workoutPlanExerciseViewSchema = z.object({
  id: z.string().uuid(),
  workoutId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  exerciseName: z.string().optional(),
  orderIndex: z.number().int().nonnegative(),
  targetSets: z.number().int().positive(),
  targetReps: z.string(),
  targetDurationSeconds: z.number().int().positive().nullable(),
  targetWeightKg: z.number().nonnegative(),
  restSeconds: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  supersetGroup: z.number().int().positive().nullable(),
});

export const workoutPlanSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  workoutType: z.string(),
  estimatedDurationMinutes: z.number().int().positive(),
  difficulty: z.enum(EXERCISE_DIFFICULTIES),
  isTemplate: z.boolean(),
  isAiGenerated: z.boolean(),
  tags: z.array(z.string()),
  exercisesCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const workoutPlanDetailSchema = workoutPlanSummarySchema.extend({
  exercises: z.array(workoutPlanExerciseViewSchema),
});

export const workoutSessionSetViewSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  exerciseName: z.string().optional(),
  setNumber: z.number().int().positive(),
  weightKg: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  durationSeconds: z.number().int().positive().nullable(),
  isWarmup: z.boolean(),
  isDropset: z.boolean(),
  isFailure: z.boolean(),
  isPr: z.boolean(),
  rpe: z.number().int().min(1).max(10).nullable(),
  notes: z.string().nullable(),
});

export const personalRecordViewSchema = z.object({
  id: z.string().uuid(),
  exerciseId: z.string().uuid(),
  exerciseName: z.string().optional(),
  recordType: z.enum(PR_RECORD_TYPES),
  weightKg: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  volumeKg: z.number().nonnegative(),
  estimated1rmKg: z.number().nonnegative(),
  sessionId: z.string().uuid().nullable(),
  achievedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const workoutSessionViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workoutId: z.string().uuid().nullable(),
  workoutName: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationSeconds: z.number().int().nonnegative(),
  totalVolumeKg: z.number().nonnegative(),
  totalSets: z.number().int().nonnegative(),
  totalReps: z.number().int().nonnegative(),
  caloriesBurned: z.number().int().nonnegative().nullable(),
  caloriesSource: z.enum(CALORIE_SOURCES),
  isCaloriesEstimated: z.boolean(),
  difficultyRating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().nullable(),
  isCompleted: z.boolean(),
  sets: z.array(workoutSessionSetViewSchema),
  newPersonalRecords: z.array(personalRecordViewSchema).optional(),
  createdAt: z.string().datetime(),
});

// --- Member Request Schemas ---

export const listExercisesRequest = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    muscle: z.string().trim().optional(),
    category: z.string().trim().optional(),
    equipment: z.string().trim().optional(),
    difficulty: z.enum(EXERCISE_DIFFICULTIES).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const getExerciseRequest = {
  params: z.object({ id: z.string().uuid() }),
};

export const listWorkoutPlansRequest = {
  query: z.object({
    type: z.enum(['all', 'mine', 'templates']).default('all'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const getWorkoutPlanRequest = {
  params: z.object({ id: z.string().uuid() }),
};

const planExerciseInputSchema = z.object({
  exerciseId: z.string().uuid(),
  orderIndex: z.number().int().nonnegative(),
  targetSets: z.number().int().positive().default(3),
  targetReps: z.string().trim().min(1).max(20).default('8-12'),
  targetDurationSeconds: z.number().int().positive().optional(),
  targetWeightKg: z.number().nonnegative().optional(),
  restSeconds: z.number().int().nonnegative().default(90),
  notes: z.string().trim().max(500).optional(),
  supersetGroup: z.number().int().positive().optional(),
});

export const createWorkoutPlanRequest = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    workoutType: z.string().trim().default('strength'),
    estimatedDurationMinutes: z.number().int().positive().default(45),
    difficulty: z.enum(EXERCISE_DIFFICULTIES).default('intermediate'),
    tags: z.array(z.string().trim()).default([]),
    exercises: z.array(planExerciseInputSchema).min(1),
  }),
};

export const updateWorkoutPlanRequest = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    workoutType: z.string().trim().optional(),
    estimatedDurationMinutes: z.number().int().positive().optional(),
    difficulty: z.enum(EXERCISE_DIFFICULTIES).optional(),
    tags: z.array(z.string().trim()).optional(),
    exercises: z.array(planExerciseInputSchema).min(1).optional(),
  }),
};

export const deleteWorkoutPlanRequest = {
  params: z.object({ id: z.string().uuid() }),
};

export const saveWorkoutSessionRequest = {
  headers: idempotencyHeadersSchema,
  body: z.object({
    workoutId: z.string().uuid().optional(),
    workoutName: z.string().trim().min(1).max(120),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationSeconds: z.number().int().positive(),
    difficultyRating: z.number().int().min(1).max(5).optional(),
    notes: z.string().trim().max(1000).optional(),
    caloriesBurned: z.number().int().nonnegative().optional(),
    caloriesSource: z.enum(CALORIE_SOURCES).default('estimated'),
    sets: z
      .array(
        z.object({
          exerciseId: z.string().uuid(),
          setNumber: z.number().int().positive(),
          weightKg: z.number().nonnegative().default(0),
          reps: z.number().int().nonnegative().default(0),
          durationSeconds: z.number().int().positive().optional(),
          isWarmup: z.boolean().default(false),
          isDropset: z.boolean().default(false),
          isFailure: z.boolean().default(false),
          rpe: z.number().int().min(1).max(10).optional(),
          notes: z.string().trim().max(300).optional(),
        }),
      )
      .min(1),
  }),
};

export const listWorkoutSessionsRequest = {
  query: z.object({
    workoutId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const getWorkoutSessionRequest = {
  params: z.object({ id: z.string().uuid() }),
};

export const listPersonalRecordsRequest = {
  query: z.object({
    exerciseId: z.string().uuid().optional(),
    type: z.enum(['current_best', 'history']).default('current_best'),
  }),
};

// --- Admin Request Schemas ---

export const createExerciseAdminRequest = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    instructions: z.array(z.string().trim().min(1)).min(1),
    tips: z.array(z.string().trim()).default([]),
    commonMistakes: z.array(z.string().trim()).default([]),
    primaryMuscles: z.array(z.string().trim().min(1)).min(1),
    secondaryMuscles: z.array(z.string().trim()).default([]),
    equipment: z.string().trim().min(1).max(50),
    category: z.string().trim().min(1).max(50),
    difficulty: z.enum(EXERCISE_DIFFICULTIES),
    isCompound: z.boolean().default(false),
    imageUrl: z.string().url().nullable().optional(),
    videoUrl: z.string().url().nullable().optional(),
  }),
};

export const updateExerciseAdminRequest = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    instructions: z.array(z.string().trim().min(1)).min(1).optional(),
    tips: z.array(z.string().trim()).optional(),
    commonMistakes: z.array(z.string().trim()).optional(),
    primaryMuscles: z.array(z.string().trim().min(1)).min(1).optional(),
    secondaryMuscles: z.array(z.string().trim()).optional(),
    equipment: z.string().trim().min(1).max(50).optional(),
    category: z.string().trim().min(1).max(50).optional(),
    difficulty: z.enum(EXERCISE_DIFFICULTIES).optional(),
    isCompound: z.boolean().optional(),
    imageUrl: z.string().url().nullable().optional(),
    videoUrl: z.string().url().nullable().optional(),
  }),
};

export const deleteExerciseAdminRequest = {
  params: z.object({ id: z.string().uuid() }),
};

export const listAdminTemplatesRequest = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
  }),
};

export const createAdminTemplateRequest = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    workoutType: z.string().trim().default('strength'),
    estimatedDurationMinutes: z.number().int().positive().default(45),
    difficulty: z.enum(EXERCISE_DIFFICULTIES).default('intermediate'),
    tags: z.array(z.string().trim()).default([]),
    exercises: z.array(planExerciseInputSchema).min(1),
  }),
};

export const updateAdminTemplateRequest = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    workoutType: z.string().trim().optional(),
    estimatedDurationMinutes: z.number().int().positive().optional(),
    difficulty: z.enum(EXERCISE_DIFFICULTIES).optional(),
    tags: z.array(z.string().trim()).optional(),
    exercises: z.array(planExerciseInputSchema).min(1).optional(),
  }),
};

export const deleteAdminTemplateRequest = {
  params: z.object({ id: z.string().uuid() }),
};

export const workoutStatsSchema = z.object({
  totalExercises: z.number().int().nonnegative(),
  totalSystemTemplates: z.number().int().nonnegative(),
  totalTemplates: z.number().int().nonnegative().optional(),
  totalCompletedSessions: z.number().int().nonnegative(),
  totalSessions: z.number().int().nonnegative().optional(),
  totalVolumeLiftedKg: z.number().nonnegative(),
  totalVolumeKg: z.number().nonnegative().optional(),
  activeLiftersCount: z.number().int().nonnegative(),
});

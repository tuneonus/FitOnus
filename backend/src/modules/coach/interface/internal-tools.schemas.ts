import { z } from 'zod';

// ============================================================================
// Tool 1: Recent Workouts
// ============================================================================

export const getRecentWorkoutsInputSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
});

export type GetRecentWorkoutsInput = z.infer<typeof getRecentWorkoutsInputSchema>;

export const recentWorkoutItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationMinutes: z.number().int().nonnegative(),
  totalVolumeKg: z.number().nonnegative(),
  totalSets: z.number().int().nonnegative(),
  caloriesBurned: z.number().int().nonnegative().nullable(),
  completedAt: z.string(),
});

export const personalRecordSummarySchema = z.object({
  exerciseId: z.string(),
  recordType: z.string(),
  weightKg: z.number(),
  reps: z.number().int(),
  achievedAt: z.string(),
});

export const getRecentWorkoutsResponseSchema = z.object({
  workouts: z.array(recentWorkoutItemSchema),
  personalRecords: z.array(personalRecordSummarySchema),
});

export type GetRecentWorkoutsResponseDto = z.infer<typeof getRecentWorkoutsResponseSchema>;

// ============================================================================
// Tool 2: Nutrition Summary
// ============================================================================

export const getNutritionSummaryInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  days: z.number().int().min(1).max(30).default(7),
});

export type GetNutritionSummaryInput = z.infer<typeof getNutritionSummaryInputSchema>;

export const dailyNutritionSummarySchema = z.object({
  date: z.string(),
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  waterMl: z.number().nonnegative(),
  mealCount: z.number().int().nonnegative(),
});

export const nutritionTargetsSchema = z.object({
  calories: z.number().nullable(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
  waterMl: z.number().nullable(),
});

export const getNutritionSummaryResponseSchema = z.object({
  days: z.array(dailyNutritionSummarySchema),
  targets: nutritionTargetsSchema,
});

export type GetNutritionSummaryResponseDto = z.infer<typeof getNutritionSummaryResponseSchema>;

// ============================================================================
// Tool 3: Weight Trend
// ============================================================================

export const getWeightTrendInputSchema = z.object({
  days: z.number().int().min(1).max(90).default(30),
});

export type GetWeightTrendInput = z.infer<typeof getWeightTrendInputSchema>;

export const weightLogPointSchema = z.object({
  date: z.string(),
  weightKg: z.number().positive(),
});

export const weightSummarySchema = z.object({
  currentWeightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  startingWeightKg: z.number().nullable(),
});

export const getWeightTrendResponseSchema = z.object({
  summary: weightSummarySchema,
  logs: z.array(weightLogPointSchema),
});

export type GetWeightTrendResponseDto = z.infer<typeof getWeightTrendResponseSchema>;

// ============================================================================
// Tool 4: Search Exercises
// ============================================================================

export const searchExercisesInputSchema = z.object({
  query: z.string().trim().min(1, 'Query must not be empty').max(50, 'Query must be at most 50 characters'),
  muscle: z.string().trim().min(1).max(50).optional(),
  equipment: z.string().trim().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

export type SearchExercisesInput = z.infer<typeof searchExercisesInputSchema>;

export const exerciseSearchItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetMuscle: z.string(),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string(),
  category: z.string(),
  difficulty: z.string(),
});

export const searchExercisesResponseSchema = z.object({
  exercises: z.array(exerciseSearchItemSchema),
  total: z.number().int().nonnegative(),
});

export type SearchExercisesResponseDto = z.infer<typeof searchExercisesResponseSchema>;

// ============================================================================
// Tool 5: Exercise Details
// ============================================================================

export const getExerciseDetailsInputSchema = z.object({
  exerciseId: z.string().uuid('Exercise ID must be a valid UUID'),
});

export type GetExerciseDetailsInput = z.infer<typeof getExerciseDetailsInputSchema>;

export const exerciseDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  targetMuscle: z.string(),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string(),
  category: z.string(),
  difficulty: z.string(),
  instructions: z.array(z.string()),
  tips: z.array(z.string()),
  isCompound: z.boolean(),
});

export const getExerciseDetailsResponseSchema = z.object({
  exercise: exerciseDetailsSchema.nullable(),
});

export type GetExerciseDetailsResponseDto = z.infer<typeof getExerciseDetailsResponseSchema>;

// ============================================================================
// Tool 6: Fitness Profile
// ============================================================================

export const getFitnessProfileInputSchema = z.object({}).default({});

export type GetFitnessProfileInput = z.infer<typeof getFitnessProfileInputSchema>;

export const fitnessProfileSummarySchema = z.object({
  userId: z.string(),
  primaryGoal: z.string().nullable(),
  experienceLevel: z.string().nullable(),
  preferredWorkoutPlace: z.string().nullable(),
  workoutDaysPerWeek: z.number().nullable(),
  preferredWorkoutDurationMin: z.number().nullable(),
  availableEquipment: z.array(z.string()),
  dietType: z.string().nullable(),
  allergies: z.array(z.string()),
  currentWeightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  targets: nutritionTargetsSchema,
});

export const getFitnessProfileResponseSchema = z.object({
  profile: fitnessProfileSummarySchema,
});

export type GetFitnessProfileResponseDto = z.infer<typeof getFitnessProfileResponseSchema>;

// ============================================================================
// Tool 7: Retrieve Fitness Knowledge
// ============================================================================

export const retrieveFitnessKnowledgeInputSchema = z.object({
  query: z.string().trim().min(1, 'Query must not be empty').max(200, 'Query must be at most 200 characters'),
  category: z.string().trim().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(10).default(3),
});

export type RetrieveFitnessKnowledgeInput = z.infer<typeof retrieveFitnessKnowledgeInputSchema>;

export const fitnessKnowledgeChunkSchema = z.object({
  chunkId: z.string(),
  title: z.string().optional(),
  category: z.string(),
  content: z.string(),
  similarity: z.number().optional(),
});

export const retrieveFitnessKnowledgeResponseSchema = z.object({
  chunks: z.array(fitnessKnowledgeChunkSchema),
});

export type RetrieveFitnessKnowledgeResponseDto = z.infer<typeof retrieveFitnessKnowledgeResponseSchema>;



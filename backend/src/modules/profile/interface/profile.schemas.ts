import { z } from 'zod';
import {
  DIET_TYPES,
  EXPERIENCE_LEVELS,
  FITNESS_GOALS,
  ONBOARDING_STEPS,
  SEXES,
  WORKOUT_PLACES,
} from '../domain/fitness-profile.js';
import { THEME_MODES, UNIT_SYSTEMS } from '../domain/user-settings.js';

export const metabolicMetricsSchema = z.object({
  bmr: z.number().int(),
  tdee: z.number().int(),
  dailyCalorieTarget: z.number().int(),
  dailyProteinGrams: z.number().int(),
  dailyCarbGrams: z.number().int(),
  dailyFatGrams: z.number().int(),
});

export const userProfileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  sex: z.enum(SEXES),
  dateOfBirth: z.string().nullable(),
  age: z.number().int().nullable(),
  heightCm: z.number().nullable(),
  currentWeightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  primaryGoal: z.enum(FITNESS_GOALS).nullable(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable(),
  preferredWorkoutPlace: z.enum(WORKOUT_PLACES).nullable(),
  workoutDaysPerWeek: z.number().int().nullable(),
  preferredWorkoutDurationMin: z.number().int().nullable(),
  availableEquipment: z.array(z.string()),
  dietType: z.enum(DIET_TYPES).nullable(),
  allergies: z.array(z.string()),
  preferredCuisines: z.array(z.string()),
  onboardingCompleted: z.boolean(),
  currentOnboardingStep: z.enum(ONBOARDING_STEPS),
  calculatedTargets: metabolicMetricsSchema.nullable(),
  version: z.number().int(),
  updatedAt: z.string().datetime(),
});

export const userSettingsSchema = z.object({
  userId: z.string().uuid(),
  themeMode: z.enum(THEME_MODES),
  unitSystem: z.enum(UNIT_SYSTEMS),
  healthConnectEnabled: z.boolean(),
  smartwatchConnected: z.boolean(),
  notificationsEnabled: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const onboardingCompleteSchema = z.object({
  onboardingCompleted: z.literal(true),
  calculatedPlan: z.object({
    dailyCalorieTarget: z.number().int(),
    dailyProteinGrams: z.number().int(),
    workoutsPerWeek: z.number().int(),
    projectedMilestone: z.string(),
  }),
});

export const updateProfileRequest = {
  body: z.strictObject({
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(100).optional(),
    sex: z.enum(SEXES).optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
      .optional(),
    heightCm: z.number().min(50).max(260).optional(),
    currentWeightKg: z.number().min(25).max(450).optional(),
    targetWeightKg: z.number().min(25).max(450).optional(),
    primaryGoal: z.enum(FITNESS_GOALS).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    preferredWorkoutPlace: z.enum(WORKOUT_PLACES).optional(),
    workoutDaysPerWeek: z.number().int().min(1).max(7).optional(),
    preferredWorkoutDurationMin: z.number().int().min(15).max(180).optional(),
    availableEquipment: z.array(z.string().trim().max(50)).max(30).optional(),
    dietType: z.enum(DIET_TYPES).optional(),
    allergies: z.array(z.string().trim().max(50)).max(20).optional(),
    preferredCuisines: z.array(z.string().trim().max(50)).max(20).optional(),
  }),
};

export const saveOnboardingStepRequest = {
  body: z.strictObject({
    step: z.enum(ONBOARDING_STEPS),
    data: z.record(z.string(), z.unknown()),
  }),
};

export const updateSettingsRequest = {
  body: z.strictObject({
    themeMode: z.enum(THEME_MODES).optional(),
    unitSystem: z.enum(UNIT_SYSTEMS).optional(),
    healthConnectEnabled: z.boolean().optional(),
    smartwatchConnected: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
  }),
};

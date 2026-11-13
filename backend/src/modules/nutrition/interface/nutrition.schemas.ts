import { z } from 'zod';
import { isValidCalendarDate } from '../domain/local-date.js';
import {
  FOOD_BRAND_MAX_LENGTH,
  FOOD_LIMITS,
  FOOD_NAME_MAX_LENGTH,
  MEAL_ITEM_LIMITS,
  MEAL_LIMITS,
  SERVING_UNIT_MAX_LENGTH,
  WATER_LIMITS,
  type NumericLimit,
} from '../domain/nutrition-limits.js';

// --- Shared request building blocks ---

/**
 * A finite number inside the domain limit, which is always strictly inside the PostgreSQL column that stores
 * it (see domain/nutrition-limits.ts). Out-of-range values are a 400 VALIDATION_FAILED, never a numeric overflow.
 */
export const boundedNumber = (limit: NumericLimit) =>
  z.number().min(limit.min, `Must be at least ${limit.min}`).max(limit.max, `Must be at most ${limit.max}`);

/** A real calendar day, `YYYY-MM-DD` (rejects 2026-02-30 and years PostgreSQL would not store sensibly). */
export const calendarDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .refine(isValidCalendarDate, { message: 'Date must be a valid calendar date' });

/**
 * IANA timezone of the caller (e.g. `Asia/Kolkata`). It decides what "today" means when the client does not
 * send an explicit date. Deliberately lenient: an unknown value falls back to UTC instead of failing a request
 * the user cannot fix.
 */
export const timezoneQuery = z.string().trim().max(64).optional();
const timezoneOnlyQuery = z.object({ timezone: timezoneQuery });

// --- Shared Nutrition View Schemas ---

export const calculatedNutrientsSchema = z.object({
  effectiveWeightG: z.number().nonnegative(),
  servingMultiplier: z.number().positive(),
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
});

export const foodReferenceNutrientsSchema = z.object({
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbohydratesG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  sugarG: z.number().nonnegative(),
  sodiumMg: z.number().nonnegative(),
  cholesterolMg: z.number().nonnegative(),
});

export const foodViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  servingSize: z.number().positive(),
  servingUnit: z.string().min(1),
  servingWeightG: z.number().positive(),
  servingVolumeMl: z.number().positive().nullable(),
  densityGPerMl: z.number().positive().nullable(),
  servingBasis: z.enum(['100g', 'serving', '100ml']),
  referenceNutrients: foodReferenceNutrientsSchema,
  standardServingNutrients: calculatedNutrientsSchema,
  isCustom: z.boolean(),
  isVerified: z.boolean(),
  isFavorite: z.boolean().optional(),
});

export const mealItemViewSchema = z.object({
  id: z.string().uuid(),
  foodId: z.string().uuid().nullable(),
  foodName: z.string().min(1),
  foodBrand: z.string().nullable(),
  servingSize: z.number().positive(),
  servingUnit: z.string().min(1),
  servingWeightG: z.number().positive(),
  servingMultiplier: z.number().positive(),
  loggedWeightG: z.number().positive(),
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
});

export const mealViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCalories: z.number().nonnegative(),
  totalProteinG: z.number().nonnegative(),
  totalCarbsG: z.number().nonnegative(),
  totalFatG: z.number().nonnegative(),
  totalFiberG: z.number().nonnegative(),
  notes: z.string().nullable(),
  items: z.array(mealItemViewSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const waterIntakeViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountMl: z.number().int().positive(),
  loggedAt: z.string(),
  createdAt: z.string(),
});

export const dailyNutritionTargetsSchema = z.object({
  calories: z.number().nullable(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
  waterMl: z.number().nullable(),
});

export const dailyNutritionConsumedSchema = z.object({
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  waterMl: z.number().int().nonnegative(),
});

export const dailyNutritionRemainingSchema = z.object({
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  waterMl: z.number().int().nonnegative(),
});

export const dailyNutritionViewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targets: dailyNutritionTargetsSchema.nullable(),
  consumed: dailyNutritionConsumedSchema,
  remaining: dailyNutritionRemainingSchema.nullable(),
  meals: z.array(mealViewSchema),
});

export const dailyTrendPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string(),
  value: z.number(),
});

export const macroSplitViewSchema = z.object({
  label: z.enum(['Protein', 'Carbs', 'Fat']),
  pct: z.number().nonnegative().max(100),
  grams: z.number().nonnegative(),
});

export const topFoodViewSchema = z.object({
  foodName: z.string(),
  count: z.number().int().nonnegative(),
  totalCalories: z.number().nonnegative(),
});

export const nutritionAnalyticsViewSchema = z.object({
  range: z.enum(['week', 'month']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  avgCalories: z.number().nonnegative(),
  avgProtein: z.number().nonnegative(),
  targetCalories: z.number().nullable(),
  targetProtein: z.number().nullable(),
  loggedDaysCount: z.number().int().nonnegative(),
  totalDaysInRange: z.number().int().positive(),
  caloriesTrend: z.array(dailyTrendPointSchema),
  proteinTrend: z.array(dailyTrendPointSchema),
  macroSplit: z.array(macroSplitViewSchema),
  topFoods: z.array(topFoodViewSchema),
});

export const favoriteResultSchema = z.object({
  foodId: z.string().uuid(),
  isFavorite: z.boolean(),
});

export const deleteFavoriteResultSchema = z.object({
  success: z.boolean(),
});

// --- Request Schemas ---

export const getDailyNutritionRequest = {
  query: z.object({
    /** Optional: defaults to today in `timezone` (UTC when no timezone is sent). */
    date: calendarDate().optional(),
    timezone: timezoneQuery,
  }),
};

export const searchFoodsRequest = {
  query: z.object({
    q: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    verifiedOnly: z.coerce.boolean().optional(),
  }),
};

export const getRecentFoodsRequest = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(30).default(10),
  }),
};

export const getFoodDetailsRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const getFoodByBarcodeRequest = {
  params: z.object({
    code: z.string().trim().min(1).max(50),
  }),
};

export const createCustomFoodRequest = {
  body: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(FOOD_NAME_MAX_LENGTH),
    brand: z.string().trim().max(FOOD_BRAND_MAX_LENGTH).nullable().optional(),
    barcode: z.string().trim().max(50).nullable().optional(),
    servingSize: boundedNumber(FOOD_LIMITS.servingSize),
    servingUnit: z.string().trim().min(1).max(SERVING_UNIT_MAX_LENGTH),
    servingWeightG: boundedNumber(FOOD_LIMITS.servingWeightG),
    servingVolumeMl: boundedNumber(FOOD_LIMITS.servingVolumeMl).nullable().optional(),
    densityGPerMl: boundedNumber(FOOD_LIMITS.densityGPerMl).nullable().optional(),
    servingBasis: z.enum(['100g', 'serving', '100ml']).default('100g'),
    calories: boundedNumber(FOOD_LIMITS.calories),
    proteinG: boundedNumber(FOOD_LIMITS.macroG),
    carbohydratesG: boundedNumber(FOOD_LIMITS.macroG),
    fatG: boundedNumber(FOOD_LIMITS.macroG),
    fiberG: boundedNumber(FOOD_LIMITS.macroG).optional(),
    sugarG: boundedNumber(FOOD_LIMITS.macroG).nullable().optional(),
    sodiumMg: boundedNumber(FOOD_LIMITS.sodiumMg).nullable().optional(),
    cholesterolMg: boundedNumber(FOOD_LIMITS.cholesterolMg).nullable().optional(),
  }),
};

export const logMealItemInputSchema = z.object({
  foodId: z.string().uuid().nullable().optional(),
  foodName: z.string().trim().min(1).max(FOOD_NAME_MAX_LENGTH).optional(),
  foodBrand: z.string().trim().max(FOOD_BRAND_MAX_LENGTH).nullable().optional(),
  servingSize: boundedNumber(FOOD_LIMITS.servingSize).optional(),
  servingUnit: z.string().trim().min(1).max(SERVING_UNIT_MAX_LENGTH).optional(),
  servingWeightG: boundedNumber(FOOD_LIMITS.servingWeightG).optional(),
  servingMultiplier: boundedNumber(MEAL_ITEM_LIMITS.servingMultiplier),
  loggedWeightG: boundedNumber(MEAL_ITEM_LIMITS.loggedWeightG).optional(),
  calories: boundedNumber(MEAL_ITEM_LIMITS.calories).optional(),
  proteinG: boundedNumber(MEAL_ITEM_LIMITS.macroG).optional(),
  carbsG: boundedNumber(MEAL_ITEM_LIMITS.macroG).optional(),
  fatG: boundedNumber(MEAL_ITEM_LIMITS.macroG).optional(),
  fiberG: boundedNumber(MEAL_ITEM_LIMITS.macroG).optional(),
});

export const logMealRequest = {
  query: timezoneOnlyQuery,
  body: z.object({
    id: z.string().uuid().optional(),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'snacks']),
    /** Optional: defaults to today in `timezone` (UTC when no timezone is sent). */
    date: calendarDate().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    items: z
      .array(logMealItemInputSchema)
      .min(1, 'At least one meal item is required')
      .max(MEAL_LIMITS.maxItems, `A meal cannot contain more than ${MEAL_LIMITS.maxItems} items`),
  }),
};

export const updateMealRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'snacks']).optional(),
    date: calendarDate().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    items: z.array(logMealItemInputSchema).min(1).max(MEAL_LIMITS.maxItems).optional(),
  }),
};

export const getMealRequest = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const logWaterRequest = {
  query: timezoneOnlyQuery,
  body: z.object({
    id: z.string().uuid().optional(),
    /** Optional: defaults to the day of `loggedAt` (or of now) in `timezone`. */
    date: calendarDate().optional(),
    amountMl: z
      .number()
      .int()
      .positive('Water intake amount must be positive')
      .min(WATER_LIMITS.amountMl.min)
      .max(WATER_LIMITS.amountMl.max, `A single water entry cannot exceed ${WATER_LIMITS.amountMl.max} ml`),
    loggedAt: z.string().datetime().optional(),
  }),
};

export const getNutritionAnalyticsRequest = {
  query: z.object({
    range: z.enum(['week', 'month']).default('week'),
    endDate: calendarDate().optional(),
    timezone: timezoneQuery,
  }),
};

export const listFavoritesRequest = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
};

export const addFavoriteRequest = {
  body: z.object({
    foodId: z.string().uuid(),
  }),
};

export const removeFavoriteRequest = {
  params: z.object({
    foodId: z.string().uuid(),
  }),
};

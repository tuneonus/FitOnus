import { AppError } from '../../../shared/errors/app-error.js';

/**
 * Write-path limits for foods, meals, meal items and water.
 *
 * Each limit is chosen from the domain first ("what could one real food, portion or drink be?") and is then
 * checked to sit STRICTLY inside the capacity of the PostgreSQL column it is stored in (migration 0008):
 *
 *   foods / meal_items   serving_size, serving_weight_g, serving_volume_ml, logged_weight_g  numeric(8,2) |x| < 1,000,000
 *                        calories, sodium_mg                                                 numeric(8,2)
 *                        protein_g, carbs/carbohydrates_g, fat_g, fiber_g, sugar_g           numeric(6,2) |x| < 10,000
 *                        cholesterol_mg                                                      numeric(6,2)
 *                        density_g_per_ml                                                    numeric(6,4) |x| < 100
 *                        meal_items.serving_multiplier                                       numeric(6,2)
 *   meals                total_calories                                                      numeric(8,2)
 *                        total_protein_g / carbs / fat / fiber                               numeric(6,2)
 *   water_intake         amount_ml                                                           integer (int4)
 *
 * The lower bound of every strictly-positive field is 0.01 because the numeric(x,2) columns round to two
 * decimals: 0.004 would be stored as 0.00 and violate the `> 0` CHECK constraint.
 *
 * `tests/unit/nutrition/nutrition-limits.test.ts` pins the "strictly inside the column" relation so a future
 * edit of a limit cannot silently bring back a PostgreSQL "numeric field overflow" (an HTTP 500).
 *
 * The limits guard values that are about to be WRITTEN. They are deliberately not applied when rows are
 * hydrated from the database, so older rows that predate them stay readable.
 */

export interface NumericLimit {
  readonly min: number;
  readonly max: number;
}

/** Exclusive upper capacity of each numeric column type used by the nutrition tables. */
export const COLUMN_CAPACITY = {
  numeric_8_2: 1_000_000,
  numeric_6_2: 10_000,
  numeric_6_4: 100,
  int4: 2_147_483_648,
} as const;

/** One food, or one meal item, expressed per serving / per logged portion. */
export const FOOD_LIMITS = {
  /** Serving size in its own unit (g, ml, pieces...). Ten kilograms is already an absurd single serving. */
  servingSize: { min: 0.01, max: 10_000 },
  servingWeightG: { min: 0.01, max: 10_000 },
  servingVolumeMl: { min: 0.01, max: 10_000 },
  /** Real foods span roughly 0.05 (puffed cereal) to 2.5 (honey, salt) g/ml. */
  densityGPerMl: { min: 0.01, max: 10 },
  /** Pure fat is 900 kcal/100 g; 10,000 leaves room for very large 'serving'-basis restaurant items. */
  calories: { min: 0, max: 10_000 },
  /** Protein, carbohydrates, fat, fibre and sugar in grams per serving (or per 100 g). */
  macroG: { min: 0, max: 2_000 },
  /** 100 g of table salt carries ~39,000 mg sodium. */
  sodiumMg: { min: 0, max: 100_000 },
  /** Organ meats top out near 3,000 mg per 100 g. */
  cholesterolMg: { min: 0, max: 5_000 },
} as const satisfies Record<string, NumericLimit>;

export const MEAL_ITEM_LIMITS = {
  servingMultiplier: { min: 0.01, max: 5_000 },
  /** A single logged item above 10 kg is a typo, not a meal. */
  loggedWeightG: { min: 0.01, max: 10_000 },
  calories: { min: 0, max: 10_000 },
  macroG: { min: 0, max: 2_000 },
} as const satisfies Record<string, NumericLimit>;

export const MEAL_LIMITS = {
  maxItems: 50,
  /** Daily needs are ~2,000-4,000 kcal; 50,000 is far beyond a plausible single meal yet < column capacity. */
  totalCalories: { min: 0, max: 50_000 },
  totalMacroG: { min: 0, max: 5_000 },
} as const;

export const WATER_LIMITS = {
  amountMl: { min: 1, max: 10_000 },
} as const satisfies Record<string, NumericLimit>;

export const FOOD_NAME_MAX_LENGTH = 150;
export const FOOD_BRAND_MAX_LENGTH = 100;
export const FOOD_BARCODE_MAX_LENGTH = 64;
export const SERVING_UNIT_MAX_LENGTH = 30;

function invalid(message: string, details?: Record<string, unknown>): AppError {
  return new AppError('unprocessable', 'VALIDATION_FAILED', message, details);
}

export function assertInRange(field: string, value: unknown, limit: NumericLimit): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(`${field} must be a finite number`, { field });
  }
  if (value < limit.min || value > limit.max) {
    throw invalid(`${field} must be between ${limit.min} and ${limit.max}`, {
      field,
      min: limit.min,
      max: limit.max,
    });
  }
}

function assertOptionalInRange(field: string, value: number | null | undefined, limit: NumericLimit): void {
  if (value === null || value === undefined) return;
  assertInRange(field, value, limit);
}

export function assertMaxLength(field: string, value: string | null | undefined, max: number): void {
  if (value !== null && value !== undefined && value.length > max) {
    throw invalid(`${field} cannot exceed ${max} characters`, { field, max });
  }
}

/** Every numeric a food definition can carry. Fields left undefined are skipped (partial admin updates). */
export interface FoodLimitInput {
  servingSize?: number;
  servingWeightG?: number;
  servingVolumeMl?: number | null;
  densityGPerMl?: number | null;
  calories?: number;
  proteinG?: number;
  carbohydratesG?: number;
  fatG?: number;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  cholesterolMg?: number | null;
}

export function assertFoodWithinLimits(food: FoodLimitInput): void {
  assertOptionalInRange('servingSize', food.servingSize, FOOD_LIMITS.servingSize);
  assertOptionalInRange('servingWeightG', food.servingWeightG, FOOD_LIMITS.servingWeightG);
  assertOptionalInRange('servingVolumeMl', food.servingVolumeMl, FOOD_LIMITS.servingVolumeMl);
  assertOptionalInRange('densityGPerMl', food.densityGPerMl, FOOD_LIMITS.densityGPerMl);
  assertOptionalInRange('calories', food.calories, FOOD_LIMITS.calories);
  assertOptionalInRange('proteinG', food.proteinG, FOOD_LIMITS.macroG);
  assertOptionalInRange('carbohydratesG', food.carbohydratesG, FOOD_LIMITS.macroG);
  assertOptionalInRange('fatG', food.fatG, FOOD_LIMITS.macroG);
  assertOptionalInRange('fiberG', food.fiberG, FOOD_LIMITS.macroG);
  assertOptionalInRange('sugarG', food.sugarG, FOOD_LIMITS.macroG);
  assertOptionalInRange('sodiumMg', food.sodiumMg, FOOD_LIMITS.sodiumMg);
  assertOptionalInRange('cholesterolMg', food.cholesterolMg, FOOD_LIMITS.cholesterolMg);
}

export interface MealItemServingLimitInput {
  servingSize: number;
  servingWeightG: number;
}

export interface MealItemPortionLimitInput {
  servingMultiplier: number;
  loggedWeightG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export type MealItemLimitInput = MealItemServingLimitInput & MealItemPortionLimitInput;

/** The serving a typed-in (ad-hoc) item is measured in. Not applied to servings copied from a stored food. */
export function assertMealItemServingWithinLimits(item: MealItemServingLimitInput): void {
  assertInRange('servingSize', item.servingSize, FOOD_LIMITS.servingSize);
  assertInRange('servingWeightG', item.servingWeightG, FOOD_LIMITS.servingWeightG);
}

/**
 * Guards the portion of one meal item about to be stored, whether its numbers were typed in (ad-hoc items,
 * AI estimates the client logs) or COMPUTED from a catalog food (`calories = per-100g value x weight / 100`).
 * A product of two individually legal values can still exceed what a single item may hold, which is exactly
 * what this catches.
 */
export function assertMealItemPortionWithinLimits(item: MealItemPortionLimitInput): void {
  assertInRange('servingMultiplier', item.servingMultiplier, MEAL_ITEM_LIMITS.servingMultiplier);
  assertInRange('loggedWeightG', item.loggedWeightG, MEAL_ITEM_LIMITS.loggedWeightG);
  assertInRange('calories', item.calories, MEAL_ITEM_LIMITS.calories);
  assertInRange('proteinG', item.proteinG, MEAL_ITEM_LIMITS.macroG);
  assertInRange('carbsG', item.carbsG, MEAL_ITEM_LIMITS.macroG);
  assertInRange('fatG', item.fatG, MEAL_ITEM_LIMITS.macroG);
  assertInRange('fiberG', item.fiberG, MEAL_ITEM_LIMITS.macroG);
}

/** Full guard for a meal item whose serving and portion were both supplied by the caller. */
export function assertMealItemWithinLimits(item: MealItemLimitInput): void {
  assertMealItemServingWithinLimits(item);
  assertMealItemPortionWithinLimits(item);
}

export interface MealLimitInput {
  items: readonly unknown[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
}

/** Guards a meal about to be stored: item count and the summed totals written to the `meals` row. */
export function assertMealWithinLimits(meal: MealLimitInput): void {
  if (meal.items.length > MEAL_LIMITS.maxItems) {
    throw invalid(`A meal cannot contain more than ${MEAL_LIMITS.maxItems} items`, {
      field: 'items',
      max: MEAL_LIMITS.maxItems,
    });
  }
  assertInRange('totalCalories', meal.totalCalories, MEAL_LIMITS.totalCalories);
  assertInRange('totalProteinG', meal.totalProteinG, MEAL_LIMITS.totalMacroG);
  assertInRange('totalCarbsG', meal.totalCarbsG, MEAL_LIMITS.totalMacroG);
  assertInRange('totalFatG', meal.totalFatG, MEAL_LIMITS.totalMacroG);
  assertInRange('totalFiberG', meal.totalFiberG, MEAL_LIMITS.totalMacroG);
}

/** The domain rounds a water entry to whole millilitres, so the range is checked on the rounded value. */
export function assertWaterAmount(amountMl: unknown): void {
  if (typeof amountMl !== 'number' || !Number.isFinite(amountMl)) {
    throw invalid('amountMl must be a finite number', { field: 'amountMl' });
  }
  assertInRange('amountMl', Math.round(amountMl), WATER_LIMITS.amountMl);
}

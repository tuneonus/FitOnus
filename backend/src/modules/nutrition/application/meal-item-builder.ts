import crypto from 'node:crypto';
import { AppError } from '../../../shared/errors/app-error.js';
import { MealItem } from '../domain/meal.js';
import { calculatePortionNutrients, type PortionSpecification } from '../domain/nutrition-calculator.js';
import {
  FOOD_BRAND_MAX_LENGTH,
  FOOD_NAME_MAX_LENGTH,
  MEAL_ITEM_LIMITS,
  SERVING_UNIT_MAX_LENGTH,
  assertInRange,
  assertMaxLength,
  assertMealItemPortionWithinLimits,
  assertMealItemServingWithinLimits,
} from '../domain/nutrition-limits.js';
import type { IFoodRepository } from './ports.js';

export interface LogMealItemInput {
  foodId?: string | null;
  foodName?: string;
  foodBrand?: string | null;
  servingSize?: number;
  servingUnit?: string;
  servingWeightG?: number;
  servingMultiplier: number;
  loggedWeightG?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
}

export interface BuildMealItemParams {
  item: LogMealItemInput;
  mealId: string;
  userId: string;
  foodRepo: IFoodRepository;
  now: Date;
}

/**
 * Turns one requested meal line into a persistable `MealItem`.
 *
 * Catalog items are priced server-side from the food record (client nutrition numbers are ignored); ad-hoc
 * items carry the numbers the client sent (typed in, or an AI estimate the user accepted). Both paths end in
 * the same guard, so no value can reach PostgreSQL outside the capacity of its column, whether it was typed
 * or computed (`per-100g value x weight / 100` can exceed what one item may hold even when both inputs are
 * individually legal).
 */
export async function buildMealItem(params: BuildMealItemParams): Promise<MealItem> {
  const { item, mealId, userId, foodRepo, now } = params;

  if (item.servingMultiplier <= 0) {
    throw new AppError('bad_request', 'VALIDATION_FAILED', 'Item serving multiplier must be greater than 0');
  }
  assertInRange('servingMultiplier', item.servingMultiplier, MEAL_ITEM_LIMITS.servingMultiplier);
  if (item.loggedWeightG !== undefined) {
    assertInRange('loggedWeightG', item.loggedWeightG, MEAL_ITEM_LIMITS.loggedWeightG);
  }

  if (item.foodId) {
    // Enforce food catalog & visibility
    const food = await foodRepo.findById(item.foodId, userId);
    if (!food) {
      const unconstrained = await foodRepo.findById(item.foodId);
      if (unconstrained && unconstrained.isCustom && unconstrained.createdBy !== userId) {
        throw new AppError('forbidden', 'FORBIDDEN', 'Unauthorized access to custom food');
      }
      throw new AppError('not_found', 'NOT_FOUND', `Food not found: ${item.foodId}`);
    }

    // Calculate portions server-side: never trust client nutrition totals
    const portionSpec: PortionSpecification =
      item.loggedWeightG && item.loggedWeightG > 0
        ? { type: 'weight_g', value: item.loggedWeightG }
        : { type: 'multiplier', value: item.servingMultiplier };

    const portion = calculatePortionNutrients(food, portionSpec);

    // The stored multiplier has two decimals; a tiny portion of a huge serving would round to 0.00 and
    // violate the `> 0` constraint, so it is floored. The exact portion is preserved in logged_weight_g.
    const servingMultiplier = Math.max(portion.servingMultiplier, MEAL_ITEM_LIMITS.servingMultiplier.min);

    // The serving size/weight are copied from a stored food row, so only the computed portion is checked.
    assertMealItemPortionWithinLimits({
      servingMultiplier,
      loggedWeightG: portion.effectiveWeightG,
      calories: portion.calories,
      proteinG: portion.proteinG,
      carbsG: portion.carbsG,
      fatG: portion.fatG,
      fiberG: portion.fiberG,
    });

    return new MealItem({
      id: crypto.randomUUID(),
      mealId,
      foodId: food.id,
      foodName: food.name,
      foodBrand: food.brand,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      servingWeightG: food.servingWeightG,
      servingMultiplier,
      loggedWeightG: portion.effectiveWeightG,
      calories: portion.calories,
      proteinG: portion.proteinG,
      carbsG: portion.carbsG,
      fatG: portion.fatG,
      fiberG: portion.fiberG,
      createdAt: now,
    });
  }

  // Non-catalog / ad-hoc item
  if (!item.foodName || item.foodName.trim().length === 0) {
    throw new AppError('bad_request', 'VALIDATION_FAILED', 'Food name is required for unlisted items');
  }
  const servingSize = item.servingSize ?? 1;
  const servingUnit = item.servingUnit ?? 'serving';
  assertMaxLength('foodName', item.foodName.trim(), FOOD_NAME_MAX_LENGTH);
  assertMaxLength('foodBrand', item.foodBrand?.trim(), FOOD_BRAND_MAX_LENGTH);
  assertMaxLength('servingUnit', servingUnit.trim(), SERVING_UNIT_MAX_LENGTH);
  const servingWeightG = item.servingWeightG ?? 100;
  assertMealItemServingWithinLimits({ servingSize, servingWeightG });
  // The default weight is the product of two legal values, so it is range-checked like any other.
  const loggedWeightG = item.loggedWeightG ?? Math.round(servingWeightG * item.servingMultiplier * 10) / 10;

  const calories = item.calories ?? 0;
  const proteinG = item.proteinG ?? 0;
  const carbsG = item.carbsG ?? 0;
  const fatG = item.fatG ?? 0;
  const fiberG = item.fiberG ?? 0;
  assertMealItemPortionWithinLimits({
    servingMultiplier: item.servingMultiplier,
    loggedWeightG,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
  });

  return new MealItem({
    id: crypto.randomUUID(),
    mealId,
    foodId: null,
    foodName: item.foodName.trim(),
    foodBrand: item.foodBrand?.trim() ?? null,
    servingSize,
    servingUnit,
    servingWeightG,
    servingMultiplier: item.servingMultiplier,
    loggedWeightG,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    createdAt: now,
  });
}

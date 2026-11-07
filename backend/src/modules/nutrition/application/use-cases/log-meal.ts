import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type { IFoodRepository, IMealRepository } from '../ports.js';
import { toMealView, type MealView } from '../nutrition-view.js';
import { Meal, MealItem, type MealType } from '../../domain/meal.js';
import { calculatePortionNutrients, type PortionSpecification } from '../../domain/nutrition-calculator.js';

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

export interface LogMealInput {
  id?: string;
  userId: string;
  mealType: MealType | 'snacks';
  date: string;
  notes?: string | null;
  items: LogMealItemInput[];
}

export interface LogMealResult {
  meal: MealView;
  created: boolean;
}

function normalizeMealType(type: string): MealType {
  const lower = type.trim().toLowerCase();
  if (lower === 'snacks' || lower === 'snack') return 'snack';
  if (lower === 'breakfast') return 'breakfast';
  if (lower === 'lunch') return 'lunch';
  if (lower === 'dinner') return 'dinner';
  throw new AppError('bad_request', 'VALIDATION_FAILED', `Invalid meal type: ${type}`);
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class LogMealUseCase {
  constructor(
    private readonly mealRepo: IMealRepository,
    private readonly foodRepo: IFoodRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: LogMealInput): Promise<LogMealResult> {
    if (!DATE_REGEX.test(input.date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }
    if (!input.items || input.items.length === 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Meal must contain at least one item');
    }

    const normalizedMealType = normalizeMealType(input.mealType);
    const mealId = input.id ?? crypto.randomUUID();

    // 1. Cross-user ID collision & idempotent retry check
    if (input.id) {
      const existing = await this.mealRepo.findById(input.id);
      if (existing) {
        if (existing.userId !== input.userId) {
          throw new AppError('conflict', 'CONFLICT', 'Meal ID collision with another user');
        }
        return { meal: toMealView(existing), created: false };
      }
    }

    // 2. Resolve items and calculate nutrition server-side
    const domainItems: MealItem[] = [];
    const now = new Date();

    for (const item of input.items) {
      if (item.servingMultiplier <= 0) {
        throw new AppError(
          'bad_request',
          'VALIDATION_FAILED',
          'Item serving multiplier must be greater than 0',
        );
      }

      if (item.foodId) {
        // Enforce food catalog & visibility
        const food = await this.foodRepo.findById(item.foodId, input.userId);
        if (!food) {
          const unconstrained = await this.foodRepo.findById(item.foodId);
          if (unconstrained && unconstrained.isCustom && unconstrained.createdBy !== input.userId) {
            throw new AppError('forbidden', 'FORBIDDEN', 'Unauthorized access to custom food');
          }
          throw new AppError('not_found', 'NOT_FOUND', `Food not found: ${item.foodId}`);
        }

        // Calculate portions server-side — never trust client nutrition totals
        const portionSpec: PortionSpecification =
          item.loggedWeightG && item.loggedWeightG > 0
            ? { type: 'weight_g', value: item.loggedWeightG }
            : { type: 'multiplier', value: item.servingMultiplier };

        const portion = calculatePortionNutrients(food, portionSpec);

        domainItems.push(
          new MealItem({
            id: crypto.randomUUID(),
            mealId,
            foodId: food.id,
            foodName: food.name,
            foodBrand: food.brand,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            servingWeightG: food.servingWeightG,
            servingMultiplier: portion.servingMultiplier,
            loggedWeightG: portion.effectiveWeightG,
            calories: portion.calories,
            proteinG: portion.proteinG,
            carbsG: portion.carbsG,
            fatG: portion.fatG,
            fiberG: portion.fiberG,
            createdAt: now,
          }),
        );
      } else {
        // Non-catalog / ad-hoc item
        if (!item.foodName || item.foodName.trim().length === 0) {
          throw new AppError('bad_request', 'VALIDATION_FAILED', 'Food name is required for unlisted items');
        }
        const servingSize = item.servingSize ?? 1;
        const servingUnit = item.servingUnit ?? 'serving';
        const servingWeightG = item.servingWeightG ?? 100;
        const loggedWeightG =
          item.loggedWeightG ?? Math.round(servingWeightG * item.servingMultiplier * 10) / 10;

        domainItems.push(
          new MealItem({
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
            calories: item.calories ?? 0,
            proteinG: item.proteinG ?? 0,
            carbsG: item.carbsG ?? 0,
            fatG: item.fatG ?? 0,
            fiberG: item.fiberG ?? 0,
            createdAt: now,
          }),
        );
      }
    }

    // 3. Construct domain Meal entity (automatically sums macro totals)
    const meal = new Meal({
      id: mealId,
      userId: input.userId,
      mealType: normalizedMealType,
      date: input.date,
      notes: input.notes?.trim() ?? null,
      items: domainItems,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Atomic persistence within UnitOfWork
    const result = await this.uow.run(async () => {
      return this.mealRepo.create(meal);
    });

    if (!result.created && result.meal.userId !== input.userId) {
      throw new AppError('conflict', 'CONFLICT', 'Meal ID collision with another user');
    }

    return {
      meal: toMealView(result.meal),
      created: result.created,
    };
  }
}

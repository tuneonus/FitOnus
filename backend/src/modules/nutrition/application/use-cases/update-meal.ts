import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type { IFoodRepository, IMealRepository } from '../ports.js';
import { toMealView, type MealView } from '../nutrition-view.js';
import { Meal, MealItem, type MealType } from '../../domain/meal.js';
import { calculatePortionNutrients, type PortionSpecification } from '../../domain/nutrition-calculator.js';
import type { LogMealItemInput } from './log-meal.js';

export interface UpdateMealInput {
  id: string;
  userId: string;
  mealType?: MealType | 'snacks';
  date?: string;
  notes?: string | null;
  items?: LogMealItemInput[];
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

export class UpdateMealUseCase {
  constructor(
    private readonly mealRepo: IMealRepository,
    private readonly foodRepo: IFoodRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: UpdateMealInput): Promise<MealView> {
    const existing = await this.mealRepo.findById(input.id, input.userId);
    if (!existing) {
      const anyUserMeal = await this.mealRepo.findById(input.id);
      if (anyUserMeal) {
        throw new AppError('forbidden', 'FORBIDDEN', 'Cannot update a meal belonging to another user');
      }
      throw new AppError('not_found', 'NOT_FOUND', 'Meal not found');
    }

    if (input.date && !DATE_REGEX.test(input.date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }

    const mealType = input.mealType ? normalizeMealType(input.mealType) : existing.mealType;
    const date = input.date ?? existing.date;
    const notes = input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes;

    let domainItems = existing.items;

    if (input.items !== undefined) {
      if (input.items.length === 0) {
        throw new AppError('bad_request', 'VALIDATION_FAILED', 'Meal must contain at least one item');
      }

      domainItems = [];
      const now = new Date();

      for (const item of input.items) {
        if (item.servingMultiplier <= 0) {
          throw new AppError('bad_request', 'VALIDATION_FAILED', 'Item serving multiplier must be greater than 0');
        }

        if (item.foodId) {
          const food = await this.foodRepo.findById(item.foodId, input.userId);
          if (!food) {
            const unconstrained = await this.foodRepo.findById(item.foodId);
            if (unconstrained && unconstrained.isCustom && unconstrained.createdBy !== input.userId) {
              throw new AppError('forbidden', 'FORBIDDEN', 'Unauthorized access to custom food');
            }
            throw new AppError('not_found', 'NOT_FOUND', `Food not found: ${item.foodId}`);
          }

          const portionSpec: PortionSpecification =
            item.loggedWeightG && item.loggedWeightG > 0
              ? { type: 'weight_g', value: item.loggedWeightG }
              : { type: 'multiplier', value: item.servingMultiplier };

          const portion = calculatePortionNutrients(food, portionSpec);

          domainItems.push(
            new MealItem({
              id: crypto.randomUUID(),
              mealId: existing.id,
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
              mealId: existing.id,
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
    }

    const updatedMeal = new Meal({
      id: existing.id,
      userId: input.userId,
      mealType,
      date,
      notes,
      items: domainItems,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    const saved = await this.uow.run(async () => {
      return this.mealRepo.update(input.id, input.userId, updatedMeal);
    });

    if (!saved) {
      throw new AppError('not_found', 'NOT_FOUND', 'Failed to update meal');
    }

    return toMealView(saved);
  }
}

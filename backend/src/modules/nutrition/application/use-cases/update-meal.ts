import { AppError } from '../../../../shared/errors/app-error.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type { IFoodRepository, IMealRepository } from '../ports.js';
import { toMealView, type MealView } from '../nutrition-view.js';
import { buildMealItem, type LogMealItemInput } from '../meal-item-builder.js';
import { Meal, type MealItem, type MealType } from '../../domain/meal.js';
import { isValidCalendarDate } from '../../domain/local-date.js';
import { MEAL_LIMITS, assertMealWithinLimits } from '../../domain/nutrition-limits.js';

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
    if (input.date && !isValidCalendarDate(input.date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date (must be a real calendar day)');
    }

    const mealType = input.mealType ? normalizeMealType(input.mealType) : existing.mealType;
    const date = input.date ?? existing.date;
    const notes = input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes;

    let domainItems = existing.items;

    if (input.items !== undefined) {
      if (input.items.length === 0) {
        throw new AppError('bad_request', 'VALIDATION_FAILED', 'Meal must contain at least one item');
      }
      if (input.items.length > MEAL_LIMITS.maxItems) {
        throw new AppError(
          'bad_request',
          'VALIDATION_FAILED',
          `A meal cannot contain more than ${MEAL_LIMITS.maxItems} items`,
        );
      }

      const rebuilt: MealItem[] = [];
      const now = new Date();

      for (const item of input.items) {
        rebuilt.push(
          await buildMealItem({
            item,
            mealId: existing.id,
            userId: input.userId,
            foodRepo: this.foodRepo,
            now,
          }),
        );
      }
      domainItems = rebuilt;
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
    // Totals are re-summed from the items, so only a changed item list can push them past the limits.
    if (input.items !== undefined) assertMealWithinLimits(updatedMeal);

    const saved = await this.uow.run(async () => {
      return this.mealRepo.update(input.id, input.userId, updatedMeal);
    });

    if (!saved) {
      throw new AppError('not_found', 'NOT_FOUND', 'Failed to update meal');
    }

    return toMealView(saved);
  }
}

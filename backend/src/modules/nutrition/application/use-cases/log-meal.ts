import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type { IFoodRepository, IMealRepository } from '../ports.js';
import { toMealView, type MealView } from '../nutrition-view.js';
import { buildMealItem, type LogMealItemInput } from '../meal-item-builder.js';
import { Meal, type MealItem, type MealType } from '../../domain/meal.js';
import { isValidCalendarDate, systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import { MEAL_LIMITS, assertMealWithinLimits } from '../../domain/nutrition-limits.js';

export type { LogMealItemInput };

export interface LogMealInput {
  id?: string;
  userId: string;
  mealType: MealType | 'snacks';
  /**
   * Calendar day (YYYY-MM-DD) the meal belongs to, chosen by the client and used as given.
   * When omitted the meal is logged for "today" in `timezone`.
   */
  date?: string;
  /** IANA timezone of the user; decides "today" when `date` is omitted (UTC when missing/invalid). */
  timezone?: string;
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
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: LogMealInput): Promise<LogMealResult> {
    // An explicit client date is a calendar day and is used as given; only the implicit default is "today".
    const date = input.date ?? todayInTimeZone(this.clock, input.timezone);
    if (!DATE_REGEX.test(date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }
    if (!isValidCalendarDate(date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date (must be a real calendar day)');
    }
    if (!input.items || input.items.length === 0) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Meal must contain at least one item');
    }
    if (input.items.length > MEAL_LIMITS.maxItems) {
      throw new AppError(
        'bad_request',
        'VALIDATION_FAILED',
        `A meal cannot contain more than ${MEAL_LIMITS.maxItems} items`,
      );
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
    const now = this.clock();

    for (const item of input.items) {
      domainItems.push(
        await buildMealItem({ item, mealId, userId: input.userId, foodRepo: this.foodRepo, now }),
      );
    }

    // 3. Construct domain Meal entity (automatically sums macro totals)
    const meal = new Meal({
      id: mealId,
      userId: input.userId,
      mealType: normalizedMealType,
      date,
      notes: input.notes?.trim() ?? null,
      items: domainItems,
      createdAt: now,
      updatedAt: now,
    });
    // The summed totals are what the `meals` row stores, so they are guarded too.
    assertMealWithinLimits(meal);

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

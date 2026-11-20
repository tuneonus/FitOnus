import { AppError } from '../../../../shared/errors/app-error.js';
import type { IMealRepository } from '../ports.js';
import { toMealView, type MealView } from '../nutrition-view.js';

export interface RestoreMealResult {
  meal: MealView;
  /** False when the meal was not deleted (a retry or a meal that was never deleted): nothing changed. */
  restored: boolean;
}

/**
 * Undoes `DeleteMealUseCase`: the same meal comes back with the same id and the item snapshots it had when it
 * was deleted (no re-creation, so nothing is recalculated).
 *
 * Idempotent: restoring a meal that is live succeeds and returns it with `restored: false`. A meal that never
 * existed is 404; another user's meal is 403.
 */
export class RestoreMealUseCase {
  constructor(private readonly mealRepo: IMealRepository) {}

  async execute(input: { userId: string; id: string }): Promise<RestoreMealResult> {
    const meal = await this.mealRepo.findById(input.id, undefined, true);
    if (!meal) throw new AppError('not_found', 'NOT_FOUND', 'Meal not found');
    if (!meal.isOwnedBy(input.userId)) {
      throw new AppError('forbidden', 'FORBIDDEN', 'Cannot restore a meal belonging to another user');
    }
    if (!meal.deletedAt) return { meal: toMealView(meal), restored: false };

    const restored = await this.mealRepo.restore(input.id, input.userId);
    // Re-read so the response carries the row as stored now (updated_at moved on restore).
    const current = await this.mealRepo.findById(input.id, input.userId);
    if (!current) throw new AppError('not_found', 'NOT_FOUND', 'Meal not found');
    return { meal: toMealView(current), restored };
  }
}

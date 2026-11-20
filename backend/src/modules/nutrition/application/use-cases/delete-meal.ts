import { AppError } from '../../../../shared/errors/app-error.js';
import type { IMealRepository } from '../ports.js';

export interface DeleteMealResult {
  id: string;
  /** True when the meal was already deleted before this call (a retry): nothing changed. */
  alreadyDeleted: boolean;
}

/**
 * Deletes one of the user's meals by marking it deleted. The row keeps its id and its item snapshots, so
 * `RestoreMealUseCase` can bring back exactly what was logged.
 *
 * Idempotent: deleting a meal that is already deleted succeeds with `alreadyDeleted: true`, so a client that
 * lost the first response can simply retry. A meal that never existed is 404; another user's meal is 403
 * (the same rule `UpdateMealUseCase` uses).
 */
export class DeleteMealUseCase {
  constructor(private readonly mealRepo: IMealRepository) {}

  async execute(input: { userId: string; id: string }): Promise<DeleteMealResult> {
    const meal = await this.mealRepo.findById(input.id, undefined, true);
    if (!meal) throw new AppError('not_found', 'NOT_FOUND', 'Meal not found');
    if (!meal.isOwnedBy(input.userId)) {
      throw new AppError('forbidden', 'FORBIDDEN', 'Cannot delete a meal belonging to another user');
    }
    if (meal.deletedAt) return { id: meal.id, alreadyDeleted: true };

    // False means a concurrent request deleted it between the read and the write: the outcome is the same.
    const deleted = await this.mealRepo.softDelete(input.id, input.userId);
    return { id: meal.id, alreadyDeleted: !deleted };
  }
}

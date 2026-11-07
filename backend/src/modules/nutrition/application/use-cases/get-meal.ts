import { AppError } from '../../../../shared/errors/app-error.js';
import type { IMealRepository } from '../ports.js';
import { toMealView, type MealView } from '../nutrition-view.js';

export class GetMealUseCase {
  constructor(private readonly mealRepo: IMealRepository) {}

  async execute(userId: string, mealId: string): Promise<MealView> {
    const meal = await this.mealRepo.findById(mealId, userId);
    if (!meal) {
      const anyUserMeal = await this.mealRepo.findById(mealId);
      if (anyUserMeal) {
        throw new AppError('forbidden', 'FORBIDDEN', 'Access to meal is forbidden');
      }
      throw new AppError('not_found', 'NOT_FOUND', 'Meal not found');
    }
    return toMealView(meal);
  }
}

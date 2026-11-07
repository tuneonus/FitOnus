import { AppError } from '../../../../shared/errors/app-error.js';
import type { IMealRepository, IUserProfileTargetPort, IWaterRepository } from '../ports.js';
import { toMealView, type DailyNutritionView } from '../nutrition-view.js';

export interface GetDailyNutritionInput {
  userId: string;
  date: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class GetDailyNutritionUseCase {
  constructor(
    private readonly mealRepo: IMealRepository,
    private readonly waterRepo: IWaterRepository,
    private readonly targetPort: IUserProfileTargetPort,
  ) {}

  async execute(input: GetDailyNutritionInput): Promise<DailyNutritionView> {
    if (!DATE_REGEX.test(input.date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }

    const [meals, waterMl, profileTargets] = await Promise.all([
      this.mealRepo.listByDate(input.userId, input.date),
      this.waterRepo.getTotalByDate(input.userId, input.date),
      this.targetPort.findTargetsByUserId(input.userId),
    ]);

    let calories = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    let fiberG = 0;

    for (const meal of meals) {
      calories += meal.totalCalories;
      proteinG += meal.totalProteinG;
      carbsG += meal.totalCarbsG;
      fatG += meal.totalFatG;
      fiberG += meal.totalFiberG;
    }

    const consumed = {
      calories: Math.round(calories * 10) / 10,
      proteinG: Math.round(proteinG * 10) / 10,
      carbsG: Math.round(carbsG * 10) / 10,
      fatG: Math.round(fatG * 10) / 10,
      fiberG: Math.round(fiberG * 10) / 10,
      waterMl,
    };

    const hasAnyTarget =
      profileTargets &&
      (profileTargets.dailyCalorieTarget !== null || profileTargets.dailyProteinGrams !== null);

    const targets = hasAnyTarget
      ? {
          calories: profileTargets.dailyCalorieTarget ?? null,
          proteinG: profileTargets.dailyProteinGrams ?? null,
          carbsG: null, // do not invent missing targets
          fatG: null,
          waterMl: null,
        }
      : null;

    const remaining = targets
      ? {
          calories:
            targets.calories !== null
              ? Math.max(0, Math.round((targets.calories - consumed.calories) * 10) / 10)
              : 0,
          proteinG:
            targets.proteinG !== null
              ? Math.max(0, Math.round((targets.proteinG - consumed.proteinG) * 10) / 10)
              : 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
          waterMl: 0,
        }
      : null;

    return {
      date: input.date,
      targets,
      consumed,
      remaining,
      meals: meals.map(toMealView),
    };
  }
}

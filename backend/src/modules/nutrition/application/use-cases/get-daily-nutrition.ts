import { AppError } from '../../../../shared/errors/app-error.js';
import type { IMealRepository, IUserProfileTargetPort, IWaterRepository } from '../ports.js';
import { toMealView, toWaterIntakeView, type DailyNutritionView } from '../nutrition-view.js';
import { isValidCalendarDate, systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';

export interface GetDailyNutritionInput {
  userId: string;
  /** Calendar day (YYYY-MM-DD) chosen by the client and used as given. Defaults to today in `timezone`. */
  date?: string;
  /** IANA timezone of the user; decides "today" when `date` is omitted (UTC when missing/invalid). */
  timezone?: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class GetDailyNutritionUseCase {
  constructor(
    private readonly mealRepo: IMealRepository,
    private readonly waterRepo: IWaterRepository,
    private readonly targetPort: IUserProfileTargetPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: GetDailyNutritionInput): Promise<DailyNutritionView> {
    const date = input.date ?? todayInTimeZone(this.clock, input.timezone);
    if (!DATE_REGEX.test(date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date format (must be YYYY-MM-DD)');
    }
    if (!isValidCalendarDate(date)) {
      throw new AppError('bad_request', 'VALIDATION_FAILED', 'Invalid date (must be a real calendar day)');
    }

    const [meals, waterMl, waterEntries, profileTargets] = await Promise.all([
      this.mealRepo.listByDate(input.userId, date),
      this.waterRepo.getTotalByDate(input.userId, date),
      this.waterRepo.listByDate(input.userId, date),
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

    // The port already resolved every target (saved, else estimated from the profile) and never invents one:
    // anything it does not know is null here and shows as "no goal" rather than a made-up number.
    const hasAnyTarget = [
      profileTargets.calories,
      profileTargets.proteinG,
      profileTargets.carbsG,
      profileTargets.fatG,
      profileTargets.waterMl,
    ].some((target) => target !== null);

    const targets = hasAnyTarget
      ? {
          calories: profileTargets.calories,
          proteinG: profileTargets.proteinG,
          carbsG: profileTargets.carbsG,
          fatG: profileTargets.fatG,
          waterMl: profileTargets.waterMl,
          source: profileTargets.source,
          waterSource: profileTargets.waterSource,
        }
      : null;

    const left = (target: number | null, eaten: number): number =>
      target === null ? 0 : Math.max(0, Math.round((target - eaten) * 10) / 10);

    const remaining = targets
      ? {
          calories: left(targets.calories, consumed.calories),
          proteinG: left(targets.proteinG, consumed.proteinG),
          carbsG: left(targets.carbsG, consumed.carbsG),
          fatG: left(targets.fatG, consumed.fatG),
          fiberG: 0,
          waterMl: left(targets.waterMl, consumed.waterMl),
        }
      : null;

    return {
      date,
      targets,
      consumed,
      remaining,
      meals: meals.map(toMealView),
      waterEntries: waterEntries.map(toWaterIntakeView),
    };
  }
}

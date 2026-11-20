import type { SqlExecutor } from '../../../database/transaction.js';
import {
  ageFromDateOfBirth,
  personalFoodTargets,
  resolveDailyTargets,
  type ResolvedDailyTargets,
} from '../../profile/index.js';
import type { IUserProfileTargetPort, UserProfileNutritionTargets } from '../application/ports.js';

interface TargetRow {
  daily_calorie_target: number | string | null;
  daily_protein_grams: number | string | null;
  current_weight_kg: number | string | null;
  height_cm: number | string | null;
  date_of_birth: Date | string | null;
  sex: string | null;
  primary_goal: string | null;
  workout_days_per_week: number | string | null;
  water_target_ml: number | string | null;
}

const toNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

/** The resolver always has food numbers (placeholders for an unknown member); the diary shows none of those. */
export function toNutritionTargets(resolved: ResolvedDailyTargets): UserProfileNutritionTargets {
  const food = personalFoodTargets(resolved);
  return {
    source: food?.source ?? null,
    calories: food?.caloriesGoal ?? null,
    proteinG: food?.proteinGoal ?? null,
    carbsG: food?.carbsGoal ?? null,
    fatG: food?.fatGoal ?? null,
    waterMl: resolved.water?.targetMl ?? null,
    waterSource: resolved.water?.source ?? null,
  };
}

/**
 * Reads what the resolver needs (profile facts + the member's own water target) in one query. This module owns
 * `user_nutrition_settings`; `user_profiles` is only read.
 */
export class PgUserProfileTargetAdapter implements IUserProfileTargetPort {
  constructor(private readonly db: SqlExecutor) {}

  async findTargetsByUserId(userId: string): Promise<UserProfileNutritionTargets> {
    const res = await this.db.query<TargetRow>(
      `SELECT p.daily_calorie_target, p.daily_protein_grams, p.current_weight_kg, p.height_cm, p.date_of_birth,
              p.sex, p.primary_goal, p.workout_days_per_week, s.water_target_ml
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         LEFT JOIN user_nutrition_settings s ON s.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );

    const row = res.rows[0];
    return toNutritionTargets(
      resolveDailyTargets({
        savedCalorieTarget: toNumber(row?.daily_calorie_target ?? null),
        savedProteinGrams: toNumber(row?.daily_protein_grams ?? null),
        savedWaterTargetMl: toNumber(row?.water_target_ml ?? null),
        weightKg: toNumber(row?.current_weight_kg ?? null),
        heightCm: toNumber(row?.height_cm ?? null),
        age: ageFromDateOfBirth(row?.date_of_birth ?? null),
        sex: row?.sex ?? null,
        primaryGoal: row?.primary_goal ?? null,
        workoutDaysPerWeek: toNumber(row?.workout_days_per_week ?? null),
      }),
    );
  }
}

import type { SqlExecutor } from '../../../database/transaction.js';
import type { IUserProfileTargetPort, UserProfileNutritionTargets } from '../application/ports.js';

interface ProfileTargetRow {
  daily_calorie_target: number | string | null;
  daily_protein_grams: number | string | null;
}

export class PgUserProfileTargetAdapter implements IUserProfileTargetPort {
  constructor(private readonly db: SqlExecutor) {}

  async findTargetsByUserId(userId: string): Promise<UserProfileNutritionTargets | null> {
    const res = await this.db.query<ProfileTargetRow>(
      `SELECT daily_calorie_target, daily_protein_grams FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );

    const row = res.rows[0];
    if (!row) {
      return null;
    }

    return {
      dailyCalorieTarget: row.daily_calorie_target !== null ? Number(row.daily_calorie_target) : null,
      dailyProteinGrams: row.daily_protein_grams !== null ? Number(row.daily_protein_grams) : null,
    };
  }
}

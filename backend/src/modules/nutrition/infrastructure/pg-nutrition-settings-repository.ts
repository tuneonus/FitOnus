import type { SqlExecutor } from '../../../database/transaction.js';
import type { INutritionSettingsRepository } from '../application/ports.js';

export class PgNutritionSettingsRepository implements INutritionSettingsRepository {
  constructor(private readonly db: SqlExecutor) {}

  async saveWaterTarget(userId: string, targetMl: number | null): Promise<void> {
    // An upsert, so the first save creates the row and every later one (or a clear) just updates it.
    await this.db.query(
      `INSERT INTO user_nutrition_settings (user_id, water_target_ml)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET water_target_ml = EXCLUDED.water_target_ml, updated_at = now()`,
      [userId, targetMl],
    );
  }
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';
import { seedUser } from '../../helpers/test-app.js';
import { Database } from '../../../src/database/transaction.js';
import {
  PgNutritionSettingsRepository,
  PgUserProfileTargetAdapter,
  SetWaterTargetUseCase,
} from '../../../src/modules/nutrition/index.js';

/**
 * The target adapter and the settings table (migration 0028) against a real PostgreSQL: the numbers a member sees come
 * from the profile row and their own water target, joined in one query.
 */
describe('nutrition targets and water target (real PostgreSQL)', () => {
  let db: TestDatabase;
  let adapter: PgUserProfileTargetAdapter;
  let settings: PgNutritionSettingsRepository;
  let setWaterTarget: SetWaterTargetUseCase;

  beforeAll(async () => {
    db = await createTestDatabase();
    const database = new Database(db.pool);
    adapter = new PgUserProfileTargetAdapter(database);
    settings = new PgNutritionSettingsRepository(database);
    setWaterTarget = new SetWaterTargetUseCase(settings, adapter);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('a member with no profile and no settings has no targets at all (nothing is invented)', async () => {
    const user = await seedUser(db.pool);

    expect(await adapter.findTargetsByUserId(user.id)).toEqual({
      source: null,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      waterMl: null,
      waterSource: null,
    });
  });

  it('an unknown user id also yields no targets instead of failing', async () => {
    const targets = await adapter.findTargetsByUserId('00000000-0000-4000-8000-000000000000');

    expect(targets.calories).toBeNull();
    expect(targets.waterMl).toBeNull();
  });

  it('returns the saved calories and protein with fat and carbs from the shared split, plus a water estimate', async () => {
    const user = await seedUser(db.pool);
    await db.pool.query(
      `INSERT INTO user_profiles (user_id, daily_calorie_target, daily_protein_grams, current_weight_kg, onboarding_completed)
       VALUES ($1, 2100, 160, 80.0, true)`,
      [user.id],
    );

    expect(await adapter.findTargetsByUserId(user.id)).toEqual({
      source: 'saved',
      calories: 2100,
      proteinG: 160,
      carbsG: 235,
      fatG: 58,
      waterMl: 2800,
      waterSource: 'estimated',
    });
  });

  it('estimates calories from the profile when none were saved (age from the date of birth)', async () => {
    const user = await seedUser(db.pool);
    const born = new Date();
    born.setFullYear(born.getFullYear() - 30);
    born.setMonth(born.getMonth() - 1); // safely past the birthday, so the age is exactly 30
    await db.pool.query(
      `INSERT INTO user_profiles (user_id, sex, date_of_birth, height_cm, current_weight_kg, primary_goal, workout_days_per_week)
       VALUES ($1, 'male', $2, 180.0, 80.0, 'maintain', 4)`,
      [user.id, born.toISOString().slice(0, 10)],
    );

    const targets = await adapter.findTargetsByUserId(user.id);

    expect(targets).toMatchObject({ source: 'estimated', calories: 2759, proteinG: 128, waterMl: 2800 });
  });

  describe('SetWaterTargetUseCase', () => {
    it('saving wins over the estimate, a second save replaces it, and clearing falls back to the estimate', async () => {
      const user = await seedUser(db.pool);
      await db.pool.query(`INSERT INTO user_profiles (user_id, current_weight_kg) VALUES ($1, 80.0)`, [
        user.id,
      ]);

      expect(await setWaterTarget.execute({ userId: user.id, targetMl: 3200 })).toEqual({
        targetMl: 3200,
        source: 'saved',
      });
      expect((await adapter.findTargetsByUserId(user.id)).waterMl).toBe(3200);

      expect(await setWaterTarget.execute({ userId: user.id, targetMl: 3500 })).toEqual({
        targetMl: 3500,
        source: 'saved',
      });
      const { rows } = await db.pool.query(
        `SELECT count(*)::int AS n FROM user_nutrition_settings WHERE user_id = $1`,
        [user.id],
      );
      expect(rows[0]).toEqual({ n: 1 });

      expect(await setWaterTarget.execute({ userId: user.id, targetMl: null })).toEqual({
        targetMl: 2800,
        source: 'estimated',
      });
    });

    it('works for a member who has no profile row yet', async () => {
      const user = await seedUser(db.pool);

      expect(await setWaterTarget.execute({ userId: user.id, targetMl: 2500 })).toEqual({
        targetMl: 2500,
        source: 'saved',
      });
    });

    it('is private to the member: another member is not affected', async () => {
      const a = await seedUser(db.pool);
      const b = await seedUser(db.pool);
      await setWaterTarget.execute({ userId: a.id, targetMl: 4000 });

      expect((await adapter.findTargetsByUserId(b.id)).waterMl).toBeNull();
    });
  });

  describe('the table itself', () => {
    it('refuses a target outside 500-8000 ml, even if the application is bypassed', async () => {
      const user = await seedUser(db.pool);

      for (const bad of [0, 499, 8001, -5]) {
        await expect(
          db.pool.query(`INSERT INTO user_nutrition_settings (user_id, water_target_ml) VALUES ($1, $2)`, [
            user.id,
            bad,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });

    it('is removed with the account', async () => {
      const user = await seedUser(db.pool);
      await setWaterTarget.execute({ userId: user.id, targetMl: 3000 });

      await db.pool.query(`DELETE FROM users WHERE id = $1`, [user.id]);

      const { rows } = await db.pool.query(`SELECT 1 FROM user_nutrition_settings WHERE user_id = $1`, [
        user.id,
      ]);
      expect(rows).toHaveLength(0);
    });
  });
});

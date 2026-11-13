import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type SeededUser,
  type TestContext,
} from '../../helpers/test-app.js';
import {
  CHECKPOINT_SOURCE_MAX_LENGTH,
  GOAL_DEADLINE_LABEL_MAX_LENGTH,
  GOAL_METRIC_UNIT_MAX_LENGTH,
  GOAL_TITLE_MAX_LENGTH,
  GOAL_VALUE_MAX,
  HABIT_COLOR_MAX_LENGTH,
  HABIT_ICON_MAX_LENGTH,
} from '../../../src/modules/goals/index.js';
import {
  FOOD_LIMITS,
  MEAL_ITEM_LIMITS,
  MEAL_LIMITS,
  SERVING_UNIT_MAX_LENGTH,
  FOOD_NAME_MAX_LENGTH,
  WATER_LIMITS,
  type NumericLimit,
} from '../../../src/modules/nutrition/domain/nutrition-limits.js';

/**
 * The numeric limits in the goals and nutrition modules are only worth anything if they sit inside the real
 * columns. This file checks that against the migrated schema itself, then pushes the largest legal values
 * through the real HTTP stack into PostgreSQL, and checks that one step beyond is a clean 400/422 and writes
 * nothing. Disposable database only.
 */
describe('goals + nutrition numeric limits against real PostgreSQL', () => {
  let ctx: TestContext;
  let user: SeededUser;
  let member: LoggedIn;
  let adminUser: SeededUser;
  let admin: LoggedIn;

  beforeAll(async () => {
    ctx = await createTestContext();
    user = await seedUser(ctx.db.pool, { email: 'numeric-member@example.com' });
    adminUser = await seedUser(ctx.db.pool, { role: 'admin', email: 'numeric-admin@example.com' });
    member = await login(ctx.app, user);
    admin = await login(ctx.app, adminUser);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const api = () => request(ctx.app);
  const count = async (table: string, where = 'true'): Promise<number> => {
    const { rows } = await ctx.db.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE ${where}`,
    );
    return Number(rows[0]!.n);
  };

  interface ColumnInfo {
    data_type: string;
    numeric_precision: number | null;
    numeric_scale: number | null;
    character_maximum_length: number | null;
  }
  async function column(table: string, name: string): Promise<ColumnInfo> {
    const { rows } = await ctx.db.pool.query<ColumnInfo>(
      `SELECT data_type, numeric_precision, numeric_scale, character_maximum_length
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, name],
    );
    if (!rows[0]) throw new Error(`column ${table}.${name} not found`);
    return rows[0];
  }
  /** Exclusive capacity of a column as PostgreSQL itself reports it. */
  async function capacity(table: string, name: string): Promise<number> {
    const c = await column(table, name);
    if (c.data_type === 'numeric') return 10 ** (c.numeric_precision! - c.numeric_scale!);
    if (c.data_type === 'integer') return 2 ** 31;
    if (c.data_type === 'smallint') return 2 ** 15;
    throw new Error(`unexpected type ${c.data_type} for ${table}.${name}`);
  }

  describe('limits vs the migrated schema', () => {
    const numericColumns: [string, string, NumericLimit][] = [
      ['foods', 'serving_size', FOOD_LIMITS.servingSize],
      ['foods', 'serving_weight_g', FOOD_LIMITS.servingWeightG],
      ['foods', 'serving_volume_ml', FOOD_LIMITS.servingVolumeMl],
      ['foods', 'density_g_per_ml', FOOD_LIMITS.densityGPerMl],
      ['foods', 'calories', FOOD_LIMITS.calories],
      ['foods', 'protein_g', FOOD_LIMITS.macroG],
      ['foods', 'carbohydrates_g', FOOD_LIMITS.macroG],
      ['foods', 'fat_g', FOOD_LIMITS.macroG],
      ['foods', 'fiber_g', FOOD_LIMITS.macroG],
      ['foods', 'sugar_g', FOOD_LIMITS.macroG],
      ['foods', 'sodium_mg', FOOD_LIMITS.sodiumMg],
      ['foods', 'cholesterol_mg', FOOD_LIMITS.cholesterolMg],
      ['meal_items', 'serving_size', FOOD_LIMITS.servingSize],
      ['meal_items', 'serving_weight_g', FOOD_LIMITS.servingWeightG],
      ['meal_items', 'serving_multiplier', MEAL_ITEM_LIMITS.servingMultiplier],
      ['meal_items', 'logged_weight_g', MEAL_ITEM_LIMITS.loggedWeightG],
      ['meal_items', 'calories', MEAL_ITEM_LIMITS.calories],
      ['meal_items', 'protein_g', MEAL_ITEM_LIMITS.macroG],
      ['meal_items', 'carbs_g', MEAL_ITEM_LIMITS.macroG],
      ['meal_items', 'fat_g', MEAL_ITEM_LIMITS.macroG],
      ['meal_items', 'fiber_g', MEAL_ITEM_LIMITS.macroG],
      ['meals', 'total_calories', MEAL_LIMITS.totalCalories],
      ['meals', 'total_protein_g', MEAL_LIMITS.totalMacroG],
      ['meals', 'total_carbs_g', MEAL_LIMITS.totalMacroG],
      ['meals', 'total_fat_g', MEAL_LIMITS.totalMacroG],
      ['meals', 'total_fiber_g', MEAL_LIMITS.totalMacroG],
      ['water_intake', 'amount_ml', WATER_LIMITS.amountMl],
      ['goals', 'start_value', { min: 0, max: GOAL_VALUE_MAX }],
      ['goals', 'current_value', { min: 0, max: GOAL_VALUE_MAX }],
      ['goals', 'target_value', { min: 0, max: GOAL_VALUE_MAX }],
      ['goal_checkpoints', 'value', { min: 0, max: GOAL_VALUE_MAX }],
    ];

    it.each(numericColumns)(
      '%s.%s capacity exceeds its limit (incl. two-decimal rounding)',
      async (table, name, limit) => {
        const cap = await capacity(table, name);
        expect(limit.max + 0.01).toBeLessThan(cap);
      },
    );

    const textColumns: [string, string, number][] = [
      ['foods', 'name', FOOD_NAME_MAX_LENGTH],
      ['meal_items', 'food_name', FOOD_NAME_MAX_LENGTH],
      ['foods', 'serving_unit', SERVING_UNIT_MAX_LENGTH],
      ['meal_items', 'serving_unit', SERVING_UNIT_MAX_LENGTH],
      ['goals', 'title', GOAL_TITLE_MAX_LENGTH],
      ['goals', 'metric_unit', GOAL_METRIC_UNIT_MAX_LENGTH],
      ['goals', 'deadline_label', GOAL_DEADLINE_LABEL_MAX_LENGTH],
      ['goal_checkpoints', 'source', CHECKPOINT_SOURCE_MAX_LENGTH],
      ['habits', 'icon', HABIT_ICON_MAX_LENGTH],
      ['habits', 'color', HABIT_COLOR_MAX_LENGTH],
    ];

    it.each(textColumns)('%s.%s is at least as wide as the text limit', async (table, name, max) => {
      expect((await column(table, name)).character_maximum_length).toBeGreaterThanOrEqual(max);
    });

    it('PostgreSQL really does overflow just beyond the capacities the limits are measured against', async () => {
      await expect(ctx.db.pool.query(`SELECT 1000000::numeric(8,2)`)).rejects.toMatchObject({
        code: '22003',
      });
      await expect(ctx.db.pool.query(`SELECT 10000::numeric(6,2)`)).rejects.toMatchObject({ code: '22003' });
      await expect(ctx.db.pool.query(`SELECT 100::numeric(6,4)`)).rejects.toMatchObject({ code: '22003' });
      await expect(ctx.db.pool.query(`SELECT 100000000::numeric(10,2)`)).rejects.toMatchObject({
        code: '22003',
      });
      await expect(ctx.db.pool.query(`SELECT 999999.99::numeric(8,2)`)).resolves.toBeDefined();
    });
  });

  describe('the largest legal values insert without overflow (HTTP -> use case -> PostgreSQL)', () => {
    it('custom food with every field at its maximum', async () => {
      const res = await api()
        .post('/api/v1/nutrition/foods')
        .set(member.auth)
        .send({
          name: 'n'.repeat(FOOD_NAME_MAX_LENGTH),
          servingSize: FOOD_LIMITS.servingSize.max,
          servingUnit: 'u'.repeat(SERVING_UNIT_MAX_LENGTH),
          servingWeightG: FOOD_LIMITS.servingWeightG.max,
          servingVolumeMl: FOOD_LIMITS.servingVolumeMl.max,
          densityGPerMl: FOOD_LIMITS.densityGPerMl.max,
          calories: FOOD_LIMITS.calories.max,
          proteinG: FOOD_LIMITS.macroG.max,
          carbohydratesG: FOOD_LIMITS.macroG.max,
          fatG: FOOD_LIMITS.macroG.max,
          fiberG: FOOD_LIMITS.macroG.max,
          sugarG: FOOD_LIMITS.macroG.max,
          sodiumMg: FOOD_LIMITS.sodiumMg.max,
          cholesterolMg: FOOD_LIMITS.cholesterolMg.max,
        });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const { rows } = await ctx.db.pool.query(
        `SELECT calories::float8, protein_g::float8, sodium_mg::float8, serving_weight_g::float8 FROM foods WHERE id = $1`,
        [res.body.data.id],
      );
      expect(rows[0]).toEqual({
        calories: 10_000,
        protein_g: 2_000,
        sodium_mg: 100_000,
        serving_weight_g: 10_000,
      });
    });

    it('admin catalog food at its maximum (create and update)', async () => {
      const res = await api().post('/api/v1/admin/nutrition/foods').set(admin.auth).send({
        name: 'Admin max food',
        servingSize: FOOD_LIMITS.servingSize.max,
        servingUnit: 'g',
        servingWeightG: FOOD_LIMITS.servingWeightG.max,
        servingBasis: 'serving',
        calories: FOOD_LIMITS.calories.max,
        proteinG: FOOD_LIMITS.macroG.max,
        carbohydratesG: FOOD_LIMITS.macroG.max,
        fatG: FOOD_LIMITS.macroG.max,
        dataSource: 'manufacturer_label',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const update = await api()
        .put(`/api/v1/admin/nutrition/foods/${res.body.data.id}`)
        .set(admin.auth)
        .send({ sodiumMg: FOOD_LIMITS.sodiumMg.max, cholesterolMg: FOOD_LIMITS.cholesterolMg.max });
      expect(update.status, JSON.stringify(update.body)).toBe(200);
    });

    it('a meal whose summed totals sit exactly at the meal maxima', async () => {
      const item = {
        foodName: 'Max item',
        servingMultiplier: MEAL_ITEM_LIMITS.servingMultiplier.max,
        servingWeightG: 1,
        loggedWeightG: MEAL_ITEM_LIMITS.loggedWeightG.max,
        calories: MEAL_ITEM_LIMITS.calories.max,
        proteinG: 1_000,
        carbsG: 1_000,
        fatG: 1_000,
        fiberG: 1_000,
      };
      const res = await api()
        .post('/api/v1/nutrition/meals')
        .set(member.auth)
        .send({ mealType: 'dinner', date: '2026-11-13', items: [item, item, item, item, item] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.totalCalories).toBe(MEAL_LIMITS.totalCalories.max);
      expect(res.body.data.totalProteinG).toBe(MEAL_LIMITS.totalMacroG.max);
      const { rows } = await ctx.db.pool.query(
        `SELECT total_calories::float8 AS kcal, total_fiber_g::float8 AS fiber FROM meals WHERE id = $1`,
        [res.body.data.id],
      );
      expect(rows[0]).toEqual({ kcal: 50_000, fiber: 5_000 });
      const items = await ctx.db.pool.query(
        `SELECT serving_multiplier::float8 AS m, logged_weight_g::float8 AS w FROM meal_items WHERE meal_id = $1`,
        [res.body.data.id],
      );
      expect(items.rows).toHaveLength(5);
      expect(items.rows[0]).toEqual({ m: 5_000, w: 10_000 });
    });

    it('the largest and smallest water entries', async () => {
      for (const amountMl of [WATER_LIMITS.amountMl.max, WATER_LIMITS.amountMl.min]) {
        const res = await api()
          .post('/api/v1/nutrition/water')
          .set(member.auth)
          .send({ date: '2026-11-13', amountMl });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
      }
      const { rows } = await ctx.db.pool.query(
        `SELECT max(amount_ml) AS big FROM water_intake WHERE user_id = $1`,
        [user.id],
      );
      expect(rows[0]!.big).toBe(10_000);
    });

    it('a goal, its checkpoint and a habit with every field at its maximum', async () => {
      const goal = await api()
        .post('/api/v1/goals')
        .set(member.auth)
        .send({
          type: 'custom',
          title: 't'.repeat(100),
          metricUnit: 'u'.repeat(GOAL_METRIC_UNIT_MAX_LENGTH),
          deadlineLabel: 'd'.repeat(GOAL_DEADLINE_LABEL_MAX_LENGTH),
          targetValue: GOAL_VALUE_MAX,
          startValue: GOAL_VALUE_MAX,
          targetDate: '2100-12-31',
        });
      expect(goal.status, JSON.stringify(goal.body)).toBe(201);

      const checkpoint = await api()
        .post(`/api/v1/goals/${goal.body.data.id}/checkpoints`)
        .set(member.auth)
        .send({
          value: GOAL_VALUE_MAX,
          source: 's'.repeat(CHECKPOINT_SOURCE_MAX_LENGTH),
          date: '2026-11-13',
        });
      expect(checkpoint.status, JSON.stringify(checkpoint.body)).toBe(201);

      const update = await api()
        .patch(`/api/v1/goals/${goal.body.data.id}`)
        .set(member.auth)
        .send({ currentValue: GOAL_VALUE_MAX, targetValue: GOAL_VALUE_MAX });
      expect(update.status, JSON.stringify(update.body)).toBe(200);

      const { rows } = await ctx.db.pool.query(
        `SELECT start_value::float8 AS s, target_value::float8 AS t, current_value::float8 AS c FROM goals WHERE id = $1`,
        [goal.body.data.id],
      );
      expect(rows[0]).toEqual({ s: GOAL_VALUE_MAX, t: GOAL_VALUE_MAX, c: GOAL_VALUE_MAX });

      const habit = await api()
        .post('/api/v1/habits')
        .set(member.auth)
        .send({
          title: 'h'.repeat(100),
          icon: 'i'.repeat(HABIT_ICON_MAX_LENGTH),
          color: 'c'.repeat(HABIT_COLOR_MAX_LENGTH),
          frequency: 'weekly',
          targetDaysPerWeek: 7,
        });
      expect(habit.status, JSON.stringify(habit.body)).toBe(201);
    });
  });

  describe('one step beyond the limit is a clean validation error, never a 500, and writes nothing', () => {
    let goalsCreatedByThisTest = 0;

    const expectValidation = (res: request.Response, statuses: number[] = [400]) => {
      expect(statuses, JSON.stringify(res.body)).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    };

    it('rejects out-of-range food, meal, water, goal, checkpoint and habit inputs', async () => {
      const before = {
        foods: await count('foods'),
        meals: await count('meals'),
        water: await count('water_intake'),
        goals: await count('goals'),
        checkpoints: await count('goal_checkpoints'),
        habits: await count('habits'),
      };

      const baseFood = {
        name: 'Over',
        servingSize: 1,
        servingUnit: 'g',
        servingWeightG: 100,
        calories: 100,
        proteinG: 1,
        carbohydratesG: 1,
        fatG: 1,
      };
      expectValidation(
        await api()
          .post('/api/v1/nutrition/foods')
          .set(member.auth)
          .send({ ...baseFood, calories: 10_000.01 }),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/foods')
          .set(member.auth)
          .send({ ...baseFood, proteinG: 99_999_999 }),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/foods')
          .set(member.auth)
          .send({ ...baseFood, servingWeightG: 1e9 }),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/foods')
          .set(member.auth)
          .send({ ...baseFood, name: 'n'.repeat(151) }),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/foods')
          .set(member.auth)
          .send({ ...baseFood, servingUnit: 'u'.repeat(31) }),
      );
      expectValidation(
        await api()
          .post('/api/v1/admin/nutrition/foods')
          .set(admin.auth)
          .send({ ...baseFood, dataSource: 'usda_fdc', sodiumMg: 100_000.01 }),
      );

      const meal = (item: Record<string, unknown>) => ({
        mealType: 'lunch',
        date: '2026-11-13',
        items: [{ foodName: 'x', servingMultiplier: 1, ...item }],
      });
      expectValidation(
        await api()
          .post('/api/v1/nutrition/meals')
          .set(member.auth)
          .send(meal({ calories: 10_000.01 })),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/meals')
          .set(member.auth)
          .send(meal({ proteinG: 2_000.01 })),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/meals')
          .set(member.auth)
          .send(meal({ servingMultiplier: 5_000.01 })),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/meals')
          .set(member.auth)
          .send(meal({ foodName: 'n'.repeat(151) })),
      );

      expectValidation(
        await api()
          .post('/api/v1/nutrition/water')
          .set(member.auth)
          .send({ date: '2026-11-13', amountMl: 10_001 }),
      );
      expectValidation(
        await api()
          .post('/api/v1/nutrition/water')
          .set(member.auth)
          .send({ date: '2026-11-13', amountMl: 2_147_483_648 }),
      );

      expectValidation(
        await api()
          .post('/api/v1/goals')
          .set(member.auth)
          .send({ type: 'custom', targetValue: GOAL_VALUE_MAX + 0.01 }),
      );
      expectValidation(
        await api()
          .post('/api/v1/goals')
          .set(member.auth)
          .send({ type: 'custom', targetValue: 99_999_999.99 }),
      );
      expectValidation(
        await api()
          .post('/api/v1/goals')
          .set(member.auth)
          .send({ type: 'custom', targetValue: 1, targetDate: '2026-02-30' }),
      );
      expectValidation(
        await api()
          .post('/api/v1/habits')
          .set(member.auth)
          .send({ title: 'x', color: 'c'.repeat(31) }),
      );
      expectValidation(
        await api()
          .post('/api/v1/habits')
          .set(member.auth)
          .send({ title: 'x', icon: 'i'.repeat(51) }),
      );

      const goal = await api()
        .post('/api/v1/goals')
        .set(member.auth)
        .send({ type: 'custom', targetValue: 5 });
      expect(goal.status).toBe(201);
      goalsCreatedByThisTest = 1;
      expectValidation(
        await api()
          .post(`/api/v1/goals/${goal.body.data.id}/checkpoints`)
          .set(member.auth)
          .send({ value: GOAL_VALUE_MAX + 1 }),
      );
      expectValidation(
        await api()
          .post(`/api/v1/goals/${goal.body.data.id}/checkpoints`)
          .set(member.auth)
          .send({ value: 1, source: 's'.repeat(31) }),
      );
      expectValidation(
        await api()
          .patch(`/api/v1/goals/${goal.body.data.id}`)
          .set(member.auth)
          .send({ currentValue: 100_000_000 }),
      );

      expect(await count('foods')).toBe(before.foods);
      expect(await count('meals')).toBe(before.meals);
      expect(await count('water_intake')).toBe(before.water);
      expect(await count('goals')).toBe(before.goals + goalsCreatedByThisTest);
      expect(await count('goal_checkpoints')).toBe(before.checkpoints + 1); // only the baseline of the goal above
      expect(await count('habits')).toBe(before.habits);
    });

    it('rejects a value that is legal on its own but whose COMPUTED result is too large (422), writing nothing', async () => {
      // A catalog food with a very dense 100 g basis: individually legal numbers, huge product.
      const food = await api().post('/api/v1/nutrition/foods').set(member.auth).send({
        name: 'Dense paste',
        servingSize: 100,
        servingUnit: 'g',
        servingWeightG: 100,
        servingBasis: '100g',
        calories: 9_000,
        proteinG: 90,
        carbohydratesG: 0,
        fatG: 0,
      });
      expect(food.status, JSON.stringify(food.body)).toBe(201);

      const meals = await count('meals');
      const items = await count('meal_items');

      // 10,000 g x 9,000 kcal / 100 g = 9,000,000 kcal would overflow numeric(8,2) and exceed any real item
      const heavy = await api()
        .post('/api/v1/nutrition/meals')
        .set(member.auth)
        .send({
          mealType: 'lunch',
          date: '2026-11-13',
          items: [{ foodId: food.body.data.id, servingMultiplier: 1, loggedWeightG: 10_000 }],
        });
      expectValidation(heavy, [422]);

      // 5,000 servings x 100 g per serving = 500,000 g: legal multiplier, impossible weight
      const many = await api()
        .post('/api/v1/nutrition/meals')
        .set(member.auth)
        .send({
          mealType: 'lunch',
          date: '2026-11-13',
          items: [{ foodId: food.body.data.id, servingMultiplier: 5_000 }],
        });
      expectValidation(many, [422]);

      expect(await count('meals')).toBe(meals);
      expect(await count('meal_items')).toBe(items);

      // the same food in a sensible portion works: 100 g = 9,000 kcal (=< item limit)
      const ok = await api()
        .post('/api/v1/nutrition/meals')
        .set(member.auth)
        .send({
          mealType: 'lunch',
          date: '2026-11-13',
          items: [{ foodId: food.body.data.id, servingMultiplier: 1 }],
        });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect(ok.body.data.items[0].calories).toBe(9_000);
    });

    it('a meal whose items are individually legal but whose total is not is rejected (422)', async () => {
      const item = { foodName: 'Big', servingMultiplier: 1, loggedWeightG: 500, calories: 9_000 };
      const before = await count('meals');
      const res = await api()
        .post('/api/v1/nutrition/meals')
        .set(member.auth)
        .send({ mealType: 'lunch', date: '2026-11-13', items: [item, item, item, item, item, item] }); // 54,000 > 50,000
      expectValidation(res, [422]);
      expect(await count('meals')).toBe(before);
    });
  });
});

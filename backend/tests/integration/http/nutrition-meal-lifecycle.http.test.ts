import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoods } from '../../../scripts/seed-foods.js';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type SeededUser,
  type TestContext,
} from '../../helpers/test-app.js';

/**
 * Meal edit, delete, restore and water deletion against real PostgreSQL through the full HTTP stack.
 * Every date below is a fixed fixture date so nothing depends on "today".
 */
describe('Nutrition meal lifecycle (Real PostgreSQL)', () => {
  let ctx: TestContext;
  let owner: LoggedIn;
  let other: LoggedIn;
  let admin: LoggedIn;
  let ownerUser: SeededUser;
  let adminFoodId: string;

  const day = '2026-11-06';
  const eggFoodId = 'f0000000-0000-4000-8000-000000000002';
  const riceFoodId = 'f0000000-0000-4000-8000-000000000004';
  const api = () => request(ctx.app);

  beforeAll(async () => {
    ctx = await createTestContext();
    await seedFoods(ctx.db.pool);

    ownerUser = await seedUser(ctx.db.pool, { email: 'lifecycle-owner@example.com' });
    const otherUser = await seedUser(ctx.db.pool, { email: 'lifecycle-other@example.com' });
    const adminUser = await seedUser(ctx.db.pool, { role: 'admin', email: 'lifecycle-admin@example.com' });
    owner = await login(ctx.app, ownerUser);
    other = await login(ctx.app, otherUser);
    admin = await login(ctx.app, adminUser);

    // A catalog food the test is free to correct later, like an admin fixing a wrong value.
    const created = await api().post('/api/v1/admin/nutrition/foods').set(admin.auth).send({
      name: 'Lifecycle Test Paneer',
      servingSize: 100,
      servingUnit: 'g',
      servingWeightG: 100,
      servingBasis: '100g',
      calories: 260,
      proteinG: 18,
      carbohydratesG: 3,
      fatG: 20,
      fiberG: 0,
      dataSource: 'manufacturer_label',
      sourceId: 'LIFECYCLE-1',
    });
    expect(created.status).toBe(201);
    adminFoodId = created.body.data.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function logMeal(
    auth: LoggedIn['auth'],
    items: unknown[],
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; body: any }> {
    const id = crypto.randomUUID();
    const res = await api()
      .post('/api/v1/nutrition/meals')
      .set(auth)
      .send({ id, mealType: 'lunch', date: day, items, ...extra });
    expect(res.status).toBe(201);
    return { id, body: res.body.data };
  }

  const daily = (auth: LoggedIn['auth'], date = day) =>
    api().get(`/api/v1/nutrition/daily?date=${date}`).set(auth);

  describe('editing keeps what was logged', () => {
    it('removing one item leaves the other exactly as logged, even after the catalog changed', async () => {
      const { id, body } = await logMeal(owner.auth, [
        { foodId: adminFoodId, servingMultiplier: 1.5 }, // 150 g paneer at 260 kcal / 100 g = 390 kcal
        { foodId: riceFoodId, servingMultiplier: 1 },
      ]);
      const paneer = body.items.find((i: any) => i.foodId === adminFoodId);
      expect(paneer.calories).toBe(390);
      const rice = body.items.find((i: any) => i.foodId === riceFoodId);

      // The catalog value is corrected afterwards. History must not move.
      const fix = await api()
        .put(`/api/v1/admin/nutrition/foods/${adminFoodId}`)
        .set(admin.auth)
        .send({ calories: 300 });
      expect(fix.status).toBe(200);

      const edit = await api()
        .put(`/api/v1/nutrition/meals/${id}`)
        .set(owner.auth)
        .send({
          items: [
            { mealItemId: paneer.id, foodId: adminFoodId, servingMultiplier: paneer.servingMultiplier },
          ],
        });

      expect(edit.status).toBe(200);
      expect(edit.body.data.items).toHaveLength(1);
      const kept = edit.body.data.items[0];
      expect(kept.id).toBe(paneer.id); // same item, not re-created
      expect(kept.calories).toBe(390); // not 450 from the corrected catalog
      expect(kept.proteinG).toBe(paneer.proteinG);
      expect(edit.body.data.totalCalories).toBe(390);
      expect(rice).toBeDefined();
    });

    it('changing one portion scales that item from its snapshot and leaves the others alone', async () => {
      const { id, body } = await logMeal(owner.auth, [
        { foodId: eggFoodId, servingMultiplier: 2 },
        { foodId: riceFoodId, servingMultiplier: 1 },
      ]);
      const egg = body.items.find((i: any) => i.foodId === eggFoodId);
      const rice = body.items.find((i: any) => i.foodId === riceFoodId);
      expect(egg.loggedWeightG).toBe(100);

      // The UI multiplies the CURRENT portion: 2x edited by 1.5x is 3x of the base serving.
      const edit = await api()
        .put(`/api/v1/nutrition/meals/${id}`)
        .set(owner.auth)
        .send({
          items: [
            { mealItemId: egg.id, foodId: eggFoodId, servingMultiplier: egg.servingMultiplier * 1.5 },
            { mealItemId: rice.id, foodId: riceFoodId, servingMultiplier: rice.servingMultiplier },
          ],
        });

      expect(edit.status).toBe(200);
      const newEgg = edit.body.data.items.find((i: any) => i.foodId === eggFoodId);
      const newRice = edit.body.data.items.find((i: any) => i.foodId === riceFoodId);
      expect(newEgg.id).toBe(egg.id);
      expect(newEgg.servingMultiplier).toBe(3);
      expect(newEgg.loggedWeightG).toBe(150);
      expect(newEgg.calories).toBe(Math.round(egg.calories * 1.5 * 10) / 10);
      expect(newRice).toEqual(rice);
    });

    it('keeps an AI estimate labelled as an estimate through an edit and a re-read', async () => {
      const { id, body } = await logMeal(owner.auth, [
        {
          foodName: 'Plain Dosa',
          foodBrand: 'AI Voice Estimate',
          servingSize: 2,
          servingUnit: 'piece',
          servingWeightG: 160,
          servingMultiplier: 1,
          calories: 266,
          proteinG: 6,
          carbsG: 45,
          fatG: 7,
          fiberG: 2,
        },
        { foodId: eggFoodId, servingMultiplier: 1 },
      ]);
      const dosa = body.items.find((i: any) => i.foodName === 'Plain Dosa');
      const egg = body.items.find((i: any) => i.foodId === eggFoodId);
      expect(dosa.isEstimated).toBe(true);
      expect(egg.isEstimated).toBe(false);

      const edit = await api()
        .put(`/api/v1/nutrition/meals/${id}`)
        .set(owner.auth)
        .send({ items: [{ mealItemId: dosa.id, foodId: null, servingMultiplier: 2 }] });

      expect(edit.status).toBe(200);
      const scaled = edit.body.data.items[0];
      expect(scaled.calories).toBe(532);
      expect(scaled.isEstimated).toBe(true);

      const reread = await api().get(`/api/v1/nutrition/meals/${id}`).set(owner.auth);
      expect(reread.body.data.items[0].isEstimated).toBe(true);
    });

    it('a meal item id is not a food id: sending it as foodId is a 404, never a silent re-price', async () => {
      const { id, body } = await logMeal(owner.auth, [{ foodId: eggFoodId, servingMultiplier: 1 }]);

      const res = await api()
        .put(`/api/v1/nutrition/meals/${id}`)
        .set(owner.auth)
        .send({ items: [{ foodId: body.items[0].id, servingMultiplier: 1 }] });

      expect(res.status).toBe(404);
    });
  });

  describe('delete and restore', () => {
    it('a deleted meal disappears everywhere and comes back whole, with the same id and snapshots', async () => {
      const { id, body } = await logMeal(owner.auth, [
        { foodId: eggFoodId, servingMultiplier: 2 },
        { foodId: riceFoodId, servingMultiplier: 1 },
      ]);
      const before = await daily(owner.auth);
      expect(before.body.data.meals.map((m: any) => m.id)).toContain(id);
      const caloriesBefore = before.body.data.consumed.calories;

      const del = await api().delete(`/api/v1/nutrition/meals/${id}`).set(owner.auth);
      expect(del.status).toBe(200);
      expect(del.body.data).toEqual({ id, deleted: true });
      expect(del.headers['idempotent-replayed']).toBeUndefined();

      // Gone from the daily summary (and its totals), from direct reads and from edits.
      const during = await daily(owner.auth);
      expect(during.body.data.meals.map((m: any) => m.id)).not.toContain(id);
      expect(during.body.data.consumed.calories).toBe(
        Math.round((caloriesBefore - body.totalCalories) * 10) / 10,
      );
      expect((await api().get(`/api/v1/nutrition/meals/${id}`).set(owner.auth)).status).toBe(404);
      expect(
        (await api().put(`/api/v1/nutrition/meals/${id}`).set(owner.auth).send({ notes: 'x' })).status,
      ).toBe(404);

      // Gone from analytics.
      const analytics = await api()
        .get(`/api/v1/nutrition/analytics?range=week&endDate=${day}`)
        .set(owner.auth);
      const dayPoint = analytics.body.data.caloriesTrend.find((p: any) => p.date === day);
      expect(dayPoint.value).toBe(during.body.data.consumed.calories);

      // The row is soft-deleted, not removed: the data is still there for the restore.
      const row = await ctx.db.pool.query('SELECT deleted_at FROM meals WHERE id = $1', [id]);
      expect(row.rows[0].deleted_at).not.toBeNull();
      const items = await ctx.db.pool.query('SELECT count(*)::int AS n FROM meal_items WHERE meal_id = $1', [
        id,
      ]);
      expect(items.rows[0].n).toBe(2);

      const restored = await api().post(`/api/v1/nutrition/meals/${id}/restore`).set(owner.auth);
      expect(restored.status).toBe(200);
      expect(restored.headers['idempotent-replayed']).toBeUndefined();
      expect(restored.body.data.id).toBe(id);
      expect(restored.body.data.totalCalories).toBe(body.totalCalories);
      expect(restored.body.data.items.map((i: any) => i.id).sort()).toEqual(
        body.items.map((i: any) => i.id).sort(),
      );
      expect(restored.body.data.items.map((i: any) => i.calories).sort()).toEqual(
        body.items.map((i: any) => i.calories).sort(),
      );

      const after = await daily(owner.auth);
      expect(after.body.data.meals.map((m: any) => m.id)).toContain(id);
      expect(after.body.data.consumed.calories).toBe(caloriesBefore);
    });

    it('delete and restore are idempotent', async () => {
      const { id } = await logMeal(owner.auth, [{ foodId: eggFoodId, servingMultiplier: 1 }]);

      expect((await api().delete(`/api/v1/nutrition/meals/${id}`).set(owner.auth)).status).toBe(200);
      const secondDelete = await api().delete(`/api/v1/nutrition/meals/${id}`).set(owner.auth);
      expect(secondDelete.status).toBe(200);
      expect(secondDelete.headers['idempotent-replayed']).toBe('true');

      expect((await api().post(`/api/v1/nutrition/meals/${id}/restore`).set(owner.auth)).status).toBe(200);
      const secondRestore = await api().post(`/api/v1/nutrition/meals/${id}/restore`).set(owner.auth);
      expect(secondRestore.status).toBe(200);
      expect(secondRestore.headers['idempotent-replayed']).toBe('true');
      expect(secondRestore.body.data.id).toBe(id);

      // Still exactly one meal row for that id.
      const rows = await ctx.db.pool.query('SELECT count(*)::int AS n FROM meals WHERE id = $1', [id]);
      expect(rows.rows[0].n).toBe(1);
    });

    it('a retried create for a deleted meal id does not bring the meal back or duplicate it', async () => {
      const { id } = await logMeal(owner.auth, [{ foodId: eggFoodId, servingMultiplier: 1 }]);
      await api().delete(`/api/v1/nutrition/meals/${id}`).set(owner.auth);

      const replay = await api()
        .post('/api/v1/nutrition/meals')
        .set(owner.auth)
        .send({ id, mealType: 'lunch', date: day, items: [{ foodId: eggFoodId, servingMultiplier: 1 }] });

      expect(replay.status).toBe(200);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect((await daily(owner.auth)).body.data.meals.map((m: any) => m.id)).not.toContain(id);
      const rows = await ctx.db.pool.query('SELECT count(*)::int AS n FROM meals WHERE id = $1', [id]);
      expect(rows.rows[0].n).toBe(1);
    });

    it("another member can neither delete nor restore someone else's meal", async () => {
      const { id } = await logMeal(owner.auth, [{ foodId: eggFoodId, servingMultiplier: 1 }]);

      expect((await api().delete(`/api/v1/nutrition/meals/${id}`).set(other.auth)).status).toBe(403);
      expect((await daily(owner.auth)).body.data.meals.map((m: any) => m.id)).toContain(id);

      await api().delete(`/api/v1/nutrition/meals/${id}`).set(owner.auth);
      expect((await api().post(`/api/v1/nutrition/meals/${id}/restore`).set(other.auth)).status).toBe(403);
      expect((await daily(owner.auth)).body.data.meals.map((m: any) => m.id)).not.toContain(id);
    });

    it('unknown ids are 404 and unauthenticated calls are 401', async () => {
      const missing = crypto.randomUUID();
      expect((await api().delete(`/api/v1/nutrition/meals/${missing}`).set(owner.auth)).status).toBe(404);
      expect((await api().post(`/api/v1/nutrition/meals/${missing}/restore`).set(owner.auth)).status).toBe(
        404,
      );
      expect((await api().delete(`/api/v1/nutrition/meals/${missing}`)).status).toBe(401);
      expect((await api().post(`/api/v1/nutrition/meals/${missing}/restore`)).status).toBe(401);
      expect((await api().delete('/api/v1/nutrition/meals/not-a-uuid').set(owner.auth)).status).toBe(400);
    });

    it('a deleted meal no longer counts in the admin catalog stats', async () => {
      const read = async () =>
        (await api().get('/api/v1/admin/nutrition/stats').set(admin.auth)).body.data
          .totalMealsLogged as number;
      const { id } = await logMeal(owner.auth, [{ foodId: eggFoodId, servingMultiplier: 1 }]);
      const withMeal = await read();

      await api().delete(`/api/v1/nutrition/meals/${id}`).set(owner.auth);
      expect(await read()).toBe(withMeal - 1);

      await api().post(`/api/v1/nutrition/meals/${id}/restore`).set(owner.auth);
      expect(await read()).toBe(withMeal);
    });
  });

  describe('water entries', () => {
    const waterDay = '2026-11-07';

    async function logWater(auth: LoggedIn['auth'], amountMl: number, id = crypto.randomUUID()) {
      const res = await api()
        .post('/api/v1/nutrition/water')
        .set(auth)
        .send({ id, date: waterDay, amountMl });
      expect(res.status).toBe(201);
      return id;
    }

    it('lists each entry of the day, deletes one, and the undo is logging it again with the same id', async () => {
      const first = await logWater(owner.auth, 250);
      const second = await logWater(owner.auth, 500);

      const listed = await daily(owner.auth, waterDay);
      expect(listed.body.data.consumed.waterMl).toBe(750);
      expect(listed.body.data.waterEntries.map((e: any) => [e.id, e.amountMl])).toEqual([
        [first, 250],
        [second, 500],
      ]);

      const del = await api().delete(`/api/v1/nutrition/water/${second}`).set(owner.auth);
      expect(del.status).toBe(200);
      expect(del.body.data).toEqual({ id: second, deleted: true });

      const afterDelete = await daily(owner.auth, waterDay);
      expect(afterDelete.body.data.consumed.waterMl).toBe(250);
      expect(afterDelete.body.data.waterEntries.map((e: any) => e.id)).toEqual([first]);

      // Undo: the same id is free again and logging is idempotent per id.
      const undo = await api()
        .post('/api/v1/nutrition/water')
        .set(owner.auth)
        .send({ id: second, date: waterDay, amountMl: 500 });
      expect(undo.status).toBe(201);

      const afterUndo = await daily(owner.auth, waterDay);
      expect(afterUndo.body.data.consumed.waterMl).toBe(750);
      expect(afterUndo.body.data.waterEntries.map((e: any) => e.id)).toContain(second);
    });

    it('a second delete is 404, and nobody else can delete the entry', async () => {
      const id = await logWater(owner.auth, 300);

      expect((await api().delete(`/api/v1/nutrition/water/${id}`).set(other.auth)).status).toBe(403);
      expect((await api().delete(`/api/v1/nutrition/water/${id}`).set(owner.auth)).status).toBe(200);
      expect((await api().delete(`/api/v1/nutrition/water/${id}`).set(owner.auth)).status).toBe(404);
      expect((await api().delete(`/api/v1/nutrition/water/${crypto.randomUUID()}`)).status).toBe(401);
    });

    it('another member never sees the entries of this member', async () => {
      const id = await logWater(owner.auth, 125);

      const theirs = await daily(other.auth, waterDay);
      expect(theirs.body.data.waterEntries.map((e: any) => e.id)).not.toContain(id);
    });
  });
});

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

describe('Nutrition HTTP API (Real PostgreSQL)', () => {
  let ctx: TestContext;
  let member1: LoggedIn;
  let member2: LoggedIn;
  let admin: LoggedIn;
  let user1: SeededUser;
  let user2: SeededUser;
  let adminUser: SeededUser;

  beforeAll(async () => {
    ctx = await createTestContext();
    await seedFoods(ctx.db.pool);

    user1 = await seedUser(ctx.db.pool, { email: 'nutri-http-1@example.com' });
    user2 = await seedUser(ctx.db.pool, { email: 'nutri-http-2@example.com' });
    adminUser = await seedUser(ctx.db.pool, { role: 'admin', email: 'nutri-admin-http@example.com' });

    member1 = await login(ctx.app, user1);
    member2 = await login(ctx.app, user2);
    admin = await login(ctx.app, adminUser);

    // Setup user 1 profile target
    await ctx.db.pool.query(
      `INSERT INTO user_profiles (user_id, daily_calorie_target, daily_protein_grams, onboarding_completed)
       VALUES ($1, 2400, 160, true)
       ON CONFLICT (user_id) DO UPDATE SET daily_calorie_target = 2400, daily_protein_grams = 160`,
      [user1.id],
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  const api = () => request(ctx.app);
  const eggFoodId = 'f0000000-0000-4000-8000-000000000002';

  it('1. GET /api/v1/nutrition/foods/search returns verified foods', async () => {
    const res = await api()
      .get('/api/v1/nutrition/foods/search?q=egg')
      .set(member1.auth);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].id).toBe(eggFoodId);
    expect(res.body.data[0].standardServingNutrients.calories).toBe(71.5);
  });

  it('2. POST /api/v1/nutrition/foods creates custom food visible only to creator', async () => {
    const res = await api()
      .post('/api/v1/nutrition/foods')
      .set(member1.auth)
      .send({
        name: 'Member 1 Custom Shake',
        servingSize: 1,
        servingUnit: 'shake',
        servingWeightG: 250,
        calories: 180,
        proteinG: 25,
        carbohydratesG: 12,
        fatG: 3,
        fiberG: 2,
      });

    expect(res.status).toBe(201);
    const customFoodId = res.body.data.id;

    // Member 1 can get details
    const m1Details = await api()
      .get(`/api/v1/nutrition/foods/${customFoodId}`)
      .set(member1.auth);
    expect(m1Details.status).toBe(200);

    // Member 2 is forbidden
    const m2Details = await api()
      .get(`/api/v1/nutrition/foods/${customFoodId}`)
      .set(member2.auth);
    expect(m2Details.status).toBe(403);
  });

  it('3. POST /api/v1/nutrition/meals logs meal and recalculates portions server-side', async () => {
    const mealId = crypto.randomUUID();
    const res = await api()
      .post('/api/v1/nutrition/meals')
      .set(member1.auth)
      .send({
        id: mealId,
        mealType: 'snacks', // alias check
        date: '2026-11-05',
        notes: 'Pre-workout snack',
        items: [
          {
            foodId: eggFoodId,
            servingMultiplier: 2, // 2 eggs = 143.0 kcal
            calories: 9999, // spoofed client numbers must be ignored
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.mealType).toBe('snack'); // canonicalized
    expect(res.body.data.totalCalories).toBe(143.0);
    expect(res.body.data.totalProteinG).toBe(12.56);

    // Retry with same UUID returns 200 with idempotent header
    const retryRes = await api()
      .post('/api/v1/nutrition/meals')
      .set(member1.auth)
      .send({
        id: mealId,
        mealType: 'snack',
        date: '2026-11-05',
        items: [{ foodId: eggFoodId, servingMultiplier: 2 }],
      });

    expect(retryRes.status).toBe(200);
    expect(retryRes.headers['idempotent-replayed']).toBe('true');
  });

  it('4. PUT & GET /api/v1/nutrition/meals/:id updates and retrieves meals', async () => {
    const mealId = crypto.randomUUID();
    await api()
      .post('/api/v1/nutrition/meals')
      .set(member1.auth)
      .send({
        id: mealId,
        mealType: 'dinner',
        date: '2026-11-05',
        items: [{ foodId: eggFoodId, servingMultiplier: 1 }],
      });

    // Update to 3 eggs
    const updateRes = await api()
      .put(`/api/v1/nutrition/meals/${mealId}`)
      .set(member1.auth)
      .send({
        notes: 'Updated dinner',
        items: [{ foodId: eggFoodId, servingMultiplier: 3 }],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.totalCalories).toBe(214.5);

    // Member 2 cannot view or update Member 1's meal
    const m2Get = await api()
      .get(`/api/v1/nutrition/meals/${mealId}`)
      .set(member2.auth);
    expect(m2Get.status).toBe(403);

    const m2Put = await api()
      .put(`/api/v1/nutrition/meals/${mealId}`)
      .set(member2.auth)
      .send({ notes: 'Intruder edit' });
    expect(m2Put.status).toBe(403);
  });

  it('5. POST /api/v1/nutrition/water logs hydration and handles retry', async () => {
    const waterId = crypto.randomUUID();
    const res = await api()
      .post('/api/v1/nutrition/water')
      .set(member1.auth)
      .send({
        id: waterId,
        date: '2026-11-05',
        amountMl: 400,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.amountMl).toBe(400);

    // Replay returns 200
    const retry = await api()
      .post('/api/v1/nutrition/water')
      .set(member1.auth)
      .send({
        id: waterId,
        date: '2026-11-05',
        amountMl: 400,
      });
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
  });

  it('6. GET /api/v1/nutrition/daily aggregates day meals and water vs target', async () => {
    const res = await api()
      .get('/api/v1/nutrition/daily?date=2026-11-05')
      .set(member1.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.targets.calories).toBe(2400);
    expect(res.body.data.consumed.calories).toBeGreaterThan(0);
    expect(res.body.data.consumed.waterMl).toBe(400);
    expect(res.body.data.remaining.calories).toBe(
      Math.max(0, 2400 - res.body.data.consumed.calories),
    );
  });

  it('7. GET /api/v1/nutrition/analytics returns real aggregated trends', async () => {
    const res = await api()
      .get('/api/v1/nutrition/analytics?range=week')
      .set(member1.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.range).toBe('week');
    expect(res.body.data.loggedDaysCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.avgCalories).toBeGreaterThan(0);
    expect(res.body.data.macroSplit).toHaveLength(3);
  });

  it('8. POST / DELETE / GET /api/v1/nutrition/favorites manages bookmarks', async () => {
    // Add favorite
    const addRes = await api()
      .post('/api/v1/nutrition/favorites')
      .set(member1.auth)
      .send({ foodId: eggFoodId });
    expect(addRes.status).toBe(201);
    expect(addRes.body.data.isFavorite).toBe(true);

    // List favorites
    const listRes = await api()
      .get('/api/v1/nutrition/favorites')
      .set(member1.auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((f: any) => f.id === eggFoodId)).toBe(true);

    // Remove favorite
    const delRes = await api()
      .delete(`/api/v1/nutrition/favorites/${eggFoodId}`)
      .set(member1.auth);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.success).toBe(true);
  });

  it('9. GET /api/v1/admin/nutrition/stats enforces admin-only access and returns real stats', async () => {
    // Member forbidden
    const memberRes = await api()
      .get('/api/v1/admin/nutrition/stats')
      .set(member1.auth);
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe('FORBIDDEN');

    // Admin allowed
    const adminRes = await api()
      .get('/api/v1/admin/nutrition/stats')
      .set(admin.auth);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.totalVerifiedFoods).toBe(25);
    expect(adminRes.body.data.totalMealsLogged).toBeGreaterThanOrEqual(1);
    expect(adminRes.body.data.totalWaterLogs).toBeGreaterThanOrEqual(1);
  });

  it('10. Admin food lifecycle: Create, Update, Verify, and Soft-delete with audit logging', async () => {
    // 1. Create verified system food
    const createRes = await api()
      .post('/api/v1/admin/nutrition/foods')
      .set(admin.auth)
      .send({
        name: 'Whey Protein Isolate',
        brand: 'Optimum Nutrition',
        barcode: '0748927028669',
        servingSize: 30,
        servingUnit: 'g',
        servingWeightG: 30,
        servingBasis: '100g',
        calories: 380,
        proteinG: 80,
        carbohydratesG: 6,
        fatG: 3,
        fiberG: 1,
        dataSource: 'manufacturer_label',
        sourceId: 'ON-WPI-100',
      });
    expect(createRes.status).toBe(201);
    const newFoodId = createRes.body.data.id;
    expect(createRes.body.data.isVerified).toBe(true);
    expect(createRes.body.data.isCustom).toBe(false);

    // 2. Update food
    const updateRes = await api()
      .put(`/api/v1/admin/nutrition/foods/${newFoodId}`)
      .set(admin.auth)
      .send({
        calories: 385,
        proteinG: 82,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.referenceNutrients.calories).toBe(385);

    // 3. Verify / Unverify
    const verifyRes = await api()
      .post(`/api/v1/admin/nutrition/foods/${newFoodId}/verify`)
      .set(admin.auth)
      .send({
        verificationStatus: 'unverified',
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.isVerified).toBe(false);

    // 4. Soft-delete
    const deleteRes = await api()
      .delete(`/api/v1/admin/nutrition/foods/${newFoodId}`)
      .set(admin.auth);
    expect(deleteRes.status).toBe(204);

    // Verify audit logs were written into admin_audit_logs table
    const auditRes = await ctx.db.pool.query(
      `SELECT action FROM admin_audit_logs WHERE admin_id = $1 ORDER BY created_at ASC`,
      [adminUser.id],
    );
    const actions = auditRes.rows.map((r: any) => r.action);
    expect(actions).toContain('nutrition.food.create');
    expect(actions).toContain('nutrition.food.update');
    expect(actions).toContain('nutrition.food.verify');
    expect(actions).toContain('nutrition.food.delete');
  });
});


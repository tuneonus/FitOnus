import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type SeededUser,
  type TestContext,
} from '../../helpers/test-app.js';

/**
 * End-to-end through the real container, routes, middleware and PostgreSQL. No Gemini API key is
 * configured, so an admitted request fails at key resolution BEFORE any provider call: that makes
 * the "blocked / admitted / refunded" behaviour observable without touching the network.
 */
describe('AI usage gate over HTTP (real container + PostgreSQL)', () => {
  let ctx: TestContext;
  let member: LoggedIn;
  let memberUser: SeededUser;
  let admin: LoggedIn;

  const api = () => request(ctx.app);
  const photo = { image: 'aGVsbG8=', mimeType: 'image/jpeg' };

  const setting = async (key: string, value: Record<string, unknown>) => {
    const current = await api().get('/api/v1/admin/application-settings').set(admin.auth);
    const record = (current.body.data.settings as { key: string; version: number }[]).find(
      (s) => s.key === key,
    )!;
    const res = await api()
      .patch('/api/v1/admin/application-settings')
      .set(admin.auth)
      .send({ settings: [{ key, value, expectedVersion: record.version }] });
    expect(res.status).toBe(200);
  };

  const flags = (overrides: Record<string, boolean> = {}) => ({
    aiCoach: true,
    mealPhotoScanner: true,
    voiceMealEntry: true,
    workoutGenerator: true,
    ...overrides,
  });
  const limits = (overrides: Record<string, number> = {}) => ({
    dailyGlobalLimit: 50,
    coachChatDailyLimit: 20,
    mealPhotoDailyLimit: 10,
    voiceMealDailyLimit: 10,
    workoutGeneratorDailyLimit: 10,
    ...overrides,
  });

  const usageRows = async () =>
    Number(
      (
        await ctx.db.pool.query<{ n: string }>(
          'SELECT COALESCE(SUM(request_count),0) AS n FROM user_ai_usage',
        )
      ).rows[0]!.n,
    );
  const rows = async (table: string) =>
    Number((await ctx.db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]!.n);

  beforeAll(async () => {
    ctx = await createTestContext();
    memberUser = await seedUser(ctx.db.pool, { email: 'ai-member@example.com' });
    const adminUser = await seedUser(ctx.db.pool, { role: 'admin', email: 'ai-admin@example.com' });
    member = await login(ctx.app, memberUser);
    admin = await login(ctx.app, adminUser);
  });
  afterAll(() => ctx.close());

  it('an admitted request that fails before the provider (no API key configured) is refunded', async () => {
    await ctx.db.pool.query('DELETE FROM user_ai_usage');

    const res = await api().post('/api/v1/nutrition/meal-photo/analyze').set(member.auth).send(photo);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await usageRows()).toBe(0);
    expect(await rows('gemini_usage_events')).toBe(0);
  });

  it('a disabled feature is rejected with 422 FEATURE_DISABLED on every AI route, with no usage and no side effects', async () => {
    await setting(
      'features.flags',
      flags({ aiCoach: false, mealPhotoScanner: false, voiceMealEntry: false }),
    );

    const responses = await Promise.all([
      api().post('/api/v1/nutrition/meal-photo/analyze').set(member.auth).send(photo),
      api().post('/api/v1/nutrition/voice-meal/parse').set(member.auth).send({ transcript: 'two idlis' }),
      api().post('/api/v1/coach/chat').set(member.auth).send({ message: 'hello coach' }),
      api().get('/api/v1/coach/insights').set(member.auth),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ success: false, error: { code: 'FEATURE_DISABLED' } });
      expect(typeof res.body.error.requestId).toBe('string');
    }
    expect(await usageRows()).toBe(0);
    expect(await rows('coach_conversations')).toBe(0);
    expect(await rows('coach_messages')).toBe(0);
    expect(await rows('gemini_usage_events')).toBe(0);
  });

  it('re-enabling a feature in the admin panel takes effect on the next request', async () => {
    await setting('features.flags', flags());

    const res = await api().post('/api/v1/nutrition/meal-photo/analyze').set(member.auth).send(photo);

    expect(res.status).toBe(503); // admitted; stops at "no API key", not at the gate
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('the per-user daily quota blocks with 429 AI_QUOTA_EXCEEDED and structured details', async () => {
    await setting('ai.limits', limits({ mealPhotoDailyLimit: 1 }));
    await ctx.db.pool.query(
      `INSERT INTO user_ai_usage (user_id, usage_date, action_type, request_count)
       VALUES ($1, CURRENT_DATE, 'meal_photo', 1)
       ON CONFLICT (user_id, usage_date, action_type) DO UPDATE SET request_count = 1`,
      [memberUser.id],
    );

    const res = await api().post('/api/v1/nutrition/meal-photo/analyze').set(member.auth).send(photo);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AI_QUOTA_EXCEEDED');
    expect(res.body.error.message).toContain('Daily limit for this AI feature (1 requests)');
    expect(res.body.error.details).toMatchObject({
      scope: 'feature',
      action: 'meal_photo',
      limit: 1,
      used: 1,
    });
    expect(await usageRows()).toBe(1);
  });

  it('the total (global) daily quota blocks every AI feature once reached', async () => {
    await ctx.db.pool.query('DELETE FROM user_ai_usage');
    await setting('ai.limits', limits({ dailyGlobalLimit: 2 }));
    await ctx.db.pool.query(
      `INSERT INTO user_ai_usage (user_id, usage_date, action_type, request_count)
       VALUES ($1, CURRENT_DATE, 'coach_chat', 1), ($1, CURRENT_DATE, 'voice_meal', 1)`,
      [memberUser.id],
    );

    const res = await api().post('/api/v1/nutrition/meal-photo/analyze').set(member.auth).send(photo);
    const chat = await api().post('/api/v1/coach/chat').set(member.auth).send({ message: 'hello coach' });

    for (const r of [res, chat]) {
      expect(r.status).toBe(429);
      expect(r.body.error.code).toBe('AI_QUOTA_EXCEEDED');
      expect(r.body.error.details).toMatchObject({ scope: 'total', limit: 2, used: 2 });
    }
    expect(await usageRows()).toBe(2);
    expect(await rows('coach_conversations')).toBe(0);
  });

  it('other users are unaffected by this user’s exhausted quota', async () => {
    const other = await seedUser(ctx.db.pool, { email: 'ai-other@example.com' });
    const otherSession = await login(ctx.app, other);

    const res = await api().post('/api/v1/nutrition/meal-photo/analyze').set(otherSession.auth).send(photo);

    expect(res.status).toBe(503); // admitted, then stopped by the missing API key
  });

  it('requests rejected by validation are never charged', async () => {
    await ctx.db.pool.query('DELETE FROM user_ai_usage');
    await setting('ai.limits', limits());

    const invalid = await Promise.all([
      api().post('/api/v1/nutrition/meal-photo/analyze').set(member.auth).send({ image: '' }),
      api().post('/api/v1/nutrition/voice-meal/parse').set(member.auth).send({}),
      api().post('/api/v1/coach/chat').set(member.auth).send({ message: '' }),
    ]);

    for (const res of invalid) expect(res.status).toBe(400);
    expect(await usageRows()).toBe(0);
  });

  it('unauthenticated callers never reach the gate', async () => {
    const res = await api().post('/api/v1/nutrition/meal-photo/analyze').send(photo);

    expect(res.status).toBe(401);
  });
});

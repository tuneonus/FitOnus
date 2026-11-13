import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import { PgAppSettingsRepository } from '../../../src/modules/app-settings/index.js';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type SeededUser,
  type TestContext,
} from '../../helpers/test-app.js';

/**
 * Per-user AI rate limiting end to end: real container, routes, auth middleware and PostgreSQL.
 *
 * No Gemini API key is configured, so an admitted request is rejected with 503 at key resolution
 * BEFORE any provider call (and its quota unit is refunded). That makes "admitted" (503) and
 * "rate limited" (429) directly observable without touching the network.
 *
 * Every request in this file comes from the same loopback address, exactly like users sharing one
 * carrier NAT: any 429 that hit a different user would show up as an IP-keyed limit.
 */
describe('AI rate limiting over HTTP (per user, not per token or IP)', () => {
  let ctx: TestContext;

  const api = () => request(ctx.app);
  const photo = { image: 'aGVsbG8=', mimeType: 'image/jpeg' };

  const ENDPOINTS = {
    mealPhoto: {
      limit: 10,
      call: (auth: LoggedIn['auth']) => api().post('/api/v1/nutrition/meal-photo/analyze').set(auth).send(photo),
    },
    voiceMeal: {
      limit: 10,
      call: (auth: LoggedIn['auth']) =>
        api().post('/api/v1/nutrition/voice-meal/parse').set(auth).send({ transcript: 'two idlis' }),
    },
    coachChat: {
      limit: 30,
      call: (auth: LoggedIn['auth']) => api().post('/api/v1/coach/chat').set(auth).send({ message: 'hello coach' }),
    },
  } as const;

  const newUser = async (name: string): Promise<{ user: SeededUser; session: LoggedIn }> => {
    const user = await seedUser(ctx.db.pool, { email: `${name}-${Date.now()}@example.test` });
    return { user, session: await login(ctx.app, user) };
  };
  /** A brand-new access token for the same user (what a token refresh or a new login hands out). */
  const freshToken = async (user: SeededUser): Promise<LoggedIn['auth']> => (await login(ctx.app, user)).auth;
  const refreshedToken = async (session: LoggedIn): Promise<LoggedIn['auth']> => {
    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(200);
    return { Authorization: `Bearer ${res.body.data.accessToken as string}` };
  };
  const count = async (sql: string) =>
    Number((await ctx.db.pool.query<{ n: string }>(sql)).rows[0]!.n);

  beforeAll(async () => {
    ctx = await createTestContext();
    // Lift the DAILY quota out of the way so these tests observe only the burst limiter.
    const database = new Database(ctx.db.pool);
    const settings = new PgAppSettingsRepository(database, new PgUnitOfWork(database));
    const limits = await settings.getSettingByKey('ai.limits');
    await settings.updateSetting(
      'ai.limits',
      {
        ...limits!.value,
        dailyGlobalLimit: 10_000,
        coachChatDailyLimit: 10_000,
        mealPhotoDailyLimit: 10_000,
        voiceMealDailyLimit: 10_000,
        workoutGeneratorDailyLimit: 10_000,
      },
      limits!.version,
    );
  });
  afterAll(() => ctx.close());

  describe.each(Object.entries(ENDPOINTS).filter(([name]) => name !== 'coachChat'))('%s', (_name, endpoint) => {
    it('admits the budget, then answers 429 with the standard envelope; nothing is charged for the rejected call', async () => {
      const { session } = await newUser('limit');

      for (let i = 0; i < endpoint.limit; i += 1) {
        const admitted = await endpoint.call(session.auth);
        expect(admitted.status).toBe(503); // reached the (unconfigured) provider stage
      }
      const limited = await endpoint.call(session.auth);

      expect(limited.status).toBe(429);
      expect(limited.body).toMatchObject({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
      });
      expect(typeof limited.body.error.requestId).toBe('string');
      expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(limited.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
      expect(JSON.stringify(limited.body)).not.toMatch(/gemini|api key|token/i);
    });

    it('refreshing or re-issuing tokens does NOT reset the budget', async () => {
      const { user, session } = await newUser('refresh');
      for (let i = 0; i < endpoint.limit; i += 1) await endpoint.call(session.auth);
      expect((await endpoint.call(session.auth)).status).toBe(429);

      const rotated = await refreshedToken(session);
      const secondLogin = await freshToken(user);
      const thirdLogin = await freshToken(user);

      // Genuinely different tokens, different suffixes (the old limiter keyed on the last 24 characters).
      const suffixes = new Set(
        [session.auth, rotated, secondLogin, thirdLogin].map((a) => a.Authorization.slice(-24)),
      );
      expect(suffixes.size).toBe(4);
      for (const auth of [rotated, secondLogin, thirdLogin]) {
        expect((await endpoint.call(auth)).status).toBe(429);
      }
    });

    it('an unrelated user on the same IP is not blocked behind a limited user', async () => {
      const heavy = await newUser('heavy');
      const bystander = await newUser('bystander');
      for (let i = 0; i < endpoint.limit; i += 1) await endpoint.call(heavy.session.auth);
      expect((await endpoint.call(heavy.session.auth)).status).toBe(429);

      for (let i = 0; i < endpoint.limit; i += 1) {
        expect((await endpoint.call(bystander.session.auth)).status).toBe(503);
      }
    });
  });

  describe('coach chat (also exercises the legacy per-token limiter that stays in place)', () => {
    const { limit, call } = ENDPOINTS.coachChat;

    it('30 requests per user, spread over refreshed tokens so no single token ever nears its own limit', async () => {
      const { user, session } = await newUser('chat');
      const tokens = [session.auth, await refreshedToken(session), await freshToken(user)];

      const conversationsBefore = await count('SELECT count(*) AS n FROM coach_conversations');
      for (let i = 0; i < limit; i += 1) {
        expect((await call(tokens[i % 3]!)).status).toBe(503); // 10 requests per token
      }
      // A token that has made ZERO requests: only a per-user limiter can refuse this one.
      const brandNew = await freshToken(user);
      const limited = await call(brandNew);

      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      // The rejected request did no work: no conversation, no message was created for it.
      expect(await count('SELECT count(*) AS n FROM coach_conversations')).toBe(conversationsBefore + limit);
    });

    it('a second user on the same IP keeps working while the first is limited', async () => {
      const heavy = await newUser('chat-heavy');
      const bystander = await newUser('chat-bystander');
      const tokens = [heavy.session.auth, await freshToken(heavy.user), await freshToken(heavy.user)];
      for (let i = 0; i < limit; i += 1) await call(tokens[i % 3]!);
      expect((await call(await freshToken(heavy.user))).status).toBe(429);

      expect((await call(bystander.session.auth)).status).toBe(503);
    });
  });

  describe('coach insights', () => {
    const insights = (auth: LoggedIn['auth'], refresh: boolean) =>
      api().get(`/api/v1/coach/insights${refresh ? '?refresh=true' : ''}`).set(auth);

    it('regeneration is limited per user across refreshed tokens (shares the coach budget)', async () => {
      const { user, session } = await newUser('insights');
      const tokens = [session.auth, await refreshedToken(session), await freshToken(user)];

      for (let i = 0; i < 30; i += 1) expect((await insights(tokens[i % 3]!, true)).status).toBe(200);
      const limited = await insights(await freshToken(user), true);

      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    });

    it('cached reads call no provider, so they are not metered by the AI limiter (documented behaviour)', async () => {
      const { session } = await newUser('insights-cached');

      for (let i = 0; i < 12; i += 1) expect((await insights(session.auth, false)).status).toBe(200);
    });
  });

  it('the AI limiter 429 and the legacy per-token limiter 429 share one envelope', async () => {
    const { session } = await newUser('envelope');
    // The legacy limiter counts every insights read for one token; the 31st is refused by it.
    for (let i = 0; i < 30; i += 1) await api().get('/api/v1/coach/insights').set(session.auth);
    const legacy = await api().get('/api/v1/coach/insights').set(session.auth);

    const heavy = await newUser('envelope-ai');
    for (let i = 0; i < 10; i += 1) await ENDPOINTS.mealPhoto.call(heavy.session.auth);
    const ai = await ENDPOINTS.mealPhoto.call(heavy.session.auth);

    expect(legacy.status).toBe(429);
    expect(ai.status).toBe(429);
    expect(Object.keys(ai.body).sort()).toEqual(Object.keys(legacy.body).sort());
    expect(ai.body.error.code).toBe(legacy.body.error.code);
    expect(ai.body.error.message).toBe(legacy.body.error.message);
    expect(Object.keys(ai.body.error).filter((k) => !(k in legacy.body.error))).toEqual(['details']);
  });

  it('Step 1 quotas are untouched: a limited request reserves nothing and refunded requests leave zero usage', async () => {
    const { user, session } = await newUser('quota');
    for (let i = 0; i < 10; i += 1) await ENDPOINTS.mealPhoto.call(session.auth);
    expect((await ENDPOINTS.mealPhoto.call(session.auth)).status).toBe(429);

    const used = await ctx.db.pool.query<{ n: string }>(
      'SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1',
      [user.id],
    );
    expect(Number(used.rows[0]!.n)).toBe(0); // 10 admitted-then-refunded, 1 never reserved
  });
});

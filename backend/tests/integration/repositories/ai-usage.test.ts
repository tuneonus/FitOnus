import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  PgAppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import type { AiUsageAction } from '../../../src/shared/ai/ai-usage.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { seedUser } from '../../helpers/test-app.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

const ACTIONS: AiUsageAction[] = ['coach_chat', 'meal_photo', 'voice_meal', 'workout_generator'];

describe('AI usage quota against real PostgreSQL', () => {
  let db: TestDatabase;
  let repo: PgAppSettingsRepository;
  let gate: AiUsageGateService;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    const database = new Database(db.pool);
    // Same wiring as the composition root: repository and unit of work share one Database.
    repo = new PgAppSettingsRepository(database, new PgUnitOfWork(database));
    gate = new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(repo));
    userA = (await seedUser(db.pool)).id;
    userB = (await seedUser(db.pool)).id;
  });
  afterAll(() => db.drop());

  const reset = () => db.pool.query('DELETE FROM user_ai_usage');
  const total = async (userId: string) =>
    Number(
      (
        await db.pool.query<{ n: string }>(
          'SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1',
          [userId],
        )
      ).rows[0]!.n,
    );
  const count = async (userId: string, action: string) =>
    Number(
      (
        await db.pool.query<{ n: string }>(
          'SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1 AND action_type = $2',
          [userId, action],
        )
      ).rows[0]!.n,
    );

  it('creates and increments the real columns (request_count) and reports the UTC usage date', async () => {
    await reset();

    const first = await repo.reserveAiUsage({
      userId: userA,
      actionType: 'coach_chat',
      actionLimit: 5,
      totalLimit: 50,
    });
    const second = await repo.reserveAiUsage({
      userId: userA,
      actionType: 'coach_chat',
      actionLimit: 5,
      totalLimit: 50,
    });

    expect(first).toMatchObject({ allowed: true, actionCount: 1, totalCount: 1 });
    expect(second).toMatchObject({ allowed: true, actionCount: 2, totalCount: 2 });
    expect(first.usageDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await repo.getUserTodayAiUsage(userA, 'coach_chat')).toBe(2);
  });

  it('60 parallel reservations for one user and action admit exactly the limit (no lost update, no overshoot)', async () => {
    await reset();

    const results = await Promise.all(
      Array.from({ length: 60 }, () =>
        repo.reserveAiUsage({ userId: userA, actionType: 'meal_photo', actionLimit: 10, totalLimit: 500 }),
      ),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed && r.reason === 'action_limit')).toHaveLength(50);
    expect(await count(userA, 'meal_photo')).toBe(10);
  });

  it('60 parallel reservations spread over all four actions admit exactly the TOTAL limit', async () => {
    await reset();

    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        repo.reserveAiUsage({ userId: userA, actionType: ACTIONS[i % 4]!, actionLimit: 100, totalLimit: 7 }),
      ),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(7);
    expect(await total(userA)).toBe(7);
  });

  it('users never consume each other’s quota, even when reserving in parallel', async () => {
    await reset();

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        repo.reserveAiUsage({
          userId: i % 2 === 0 ? userA : userB,
          actionType: 'voice_meal',
          actionLimit: 5,
          totalLimit: 50,
        }),
      ),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(await count(userA, 'voice_meal')).toBe(5);
    expect(await count(userB, 'voice_meal')).toBe(5);
  });

  it('a rejected reservation writes nothing', async () => {
    await reset();
    await repo.reserveAiUsage({ userId: userA, actionType: 'coach_chat', actionLimit: 1, totalLimit: 50 });

    const rejected = await repo.reserveAiUsage({
      userId: userA,
      actionType: 'coach_chat',
      actionLimit: 1,
      totalLimit: 50,
    });

    expect(rejected).toMatchObject({ allowed: false, reason: 'action_limit', actionCount: 1 });
    expect(await count(userA, 'coach_chat')).toBe(1);
  });

  it('release returns one unit and never goes below zero', async () => {
    await reset();
    const reserved = await repo.reserveAiUsage({
      userId: userA,
      actionType: 'meal_photo',
      actionLimit: 5,
      totalLimit: 50,
    });
    if (!reserved.allowed) throw new Error('expected admission');

    await repo.releaseAiUsage({ userId: userA, actionType: 'meal_photo', usageDate: reserved.usageDate });
    await repo.releaseAiUsage({ userId: userA, actionType: 'meal_photo', usageDate: reserved.usageDate });

    expect(await count(userA, 'meal_photo')).toBe(0);
  });

  it('through the real gate and real settings: the admin-configured limit is enforced under 30 parallel requests', async () => {
    await reset();
    const current = await repo.getSettingByKey('ai.limits');
    await repo.updateSetting(
      'ai.limits',
      { ...current!.value, mealPhotoDailyLimit: 3, dailyGlobalLimit: 50 },
      current!.version,
    );
    let executed = 0;

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        gate.run({ userId: userA, action: 'meal_photo' }, async () => {
          executed += 1;
        }),
      ),
    );

    expect(executed).toBe(3);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => isAppError(r.reason) && r.reason.code === 'AI_QUOTA_EXCEEDED')).toBe(true);
  });

  it('through the real gate and real settings: an admin kill switch stops the next request and charges nothing', async () => {
    await reset();
    const flags = await repo.getSettingByKey('features.flags');
    await repo.updateSetting('features.flags', { ...flags!.value, voiceMealEntry: false }, flags!.version);
    let executed = 0;

    await expect(
      gate.run({ userId: userA, action: 'voice_meal' }, async () => {
        executed += 1;
      }),
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });

    expect(executed).toBe(0);
    expect(await total(userA)).toBe(0);
  });
});

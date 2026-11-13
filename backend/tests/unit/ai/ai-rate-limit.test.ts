import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
} from '../../../src/modules/app-settings/index.js';
import { STATUS_BY_KIND } from '../../../src/middleware/error-handler.js';
import {
  AI_RATE_LIMIT_MESSAGE,
  DEFAULT_AI_RATE_LIMITS,
  DEFAULT_AI_RATE_LIMIT_WINDOW_MS,
  InMemoryAiRateLimitStore,
  createAiRateLimiter,
  type AiRateLimitStore,
} from '../../../src/shared/ai/ai-rate-limit.js';
import { isAppError, type AppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const caught = async (promise: Promise<unknown>): Promise<AppError> => {
  try {
    await promise;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be rejected');
};

describe('createAiRateLimiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('admits up to the limit, then rejects with the standard 429 envelope', async () => {
    const limiter = createAiRateLimiter({ limits: { coach_chat: 3 } });

    for (let i = 0; i < 3; i += 1) await limiter.consume(ALICE, 'coach_chat');
    const error = await caught(limiter.consume(ALICE, 'coach_chat'));

    expect(error).toMatchObject({ kind: 'rate_limited', code: 'RATE_LIMITED', message: AI_RATE_LIMIT_MESSAGE });
    expect(STATUS_BY_KIND[error.kind]).toBe(429);
  });

  it('uses exactly the same code and message as the global HTTP limiters so clients see one 429 shape', () => {
    // Literal copy of the text in src/middleware/rate-limit.ts (`rejectWithAppError`).
    expect(AI_RATE_LIMIT_MESSAGE).toBe('Too many requests. Try again later.');
  });

  it('tells the client when to retry, within the window', async () => {
    const limiter = createAiRateLimiter({ windowMs: 60_000, limits: { meal_photo: 1 } });
    await limiter.consume(ALICE, 'meal_photo');

    await vi.advanceTimersByTimeAsync(20_000);
    const error = await caught(limiter.consume(ALICE, 'meal_photo'));

    const { retryAfterSeconds } = error.details as { retryAfterSeconds: number };
    expect(retryAfterSeconds).toBeGreaterThan(30);
    expect(retryAfterSeconds).toBeLessThanOrEqual(40);
  });

  it('budgets are per USER: one user hitting the limit never affects another', async () => {
    const limiter = createAiRateLimiter({ limits: { coach_chat: 2 } });
    await limiter.consume(ALICE, 'coach_chat');
    await limiter.consume(ALICE, 'coach_chat');
    await caught(limiter.consume(ALICE, 'coach_chat'));

    await expect(limiter.consume(BOB, 'coach_chat')).resolves.toBeUndefined();
    await expect(limiter.consume(BOB, 'coach_chat')).resolves.toBeUndefined();
    await caught(limiter.consume(BOB, 'coach_chat'));
  });

  it('budgets are per ACTION: exhausting coach chat does not block meal photos', async () => {
    const limiter = createAiRateLimiter({ limits: { coach_chat: 1, meal_photo: 1, voice_meal: 1 } });
    await limiter.consume(ALICE, 'coach_chat');
    await caught(limiter.consume(ALICE, 'coach_chat'));

    await expect(limiter.consume(ALICE, 'meal_photo')).resolves.toBeUndefined();
    await expect(limiter.consume(ALICE, 'voice_meal')).resolves.toBeUndefined();
  });

  it('the window resets, restoring the full budget', async () => {
    const limiter = createAiRateLimiter({ windowMs: 60_000, limits: { coach_chat: 2 } });
    await limiter.consume(ALICE, 'coach_chat');
    await limiter.consume(ALICE, 'coach_chat');
    await caught(limiter.consume(ALICE, 'coach_chat'));

    await vi.advanceTimersByTimeAsync(60_001);

    await expect(limiter.consume(ALICE, 'coach_chat')).resolves.toBeUndefined();
    await expect(limiter.consume(ALICE, 'coach_chat')).resolves.toBeUndefined();
    await caught(limiter.consume(ALICE, 'coach_chat'));
  });

  it('is exact under concurrency: 100 parallel requests admit exactly the limit', async () => {
    const limiter = createAiRateLimiter({ limits: { coach_chat: 30 } });

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () => limiter.consume(ALICE, 'coach_chat')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(30);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(70);
  });

  it('ships sensible defaults: coach 30 / heavier media calls 10 per 15 minutes per user', () => {
    expect(DEFAULT_AI_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(DEFAULT_AI_RATE_LIMITS).toEqual({ coach_chat: 30, meal_photo: 10, voice_meal: 10, workout_generator: 10 });
  });

  it('works with an asynchronous store (remote stores such as Redis return promises)', async () => {
    const hits = new Map<string, number>();
    const store: AiRateLimitStore = {
      hit: async (key, windowMs) => {
        await Promise.resolve(); // a network hop
        const count = (hits.get(key) ?? 0) + 1;
        hits.set(key, count);
        return { count, resetAt: Date.now() + windowMs };
      },
    };
    const limiter = createAiRateLimiter({ store, limits: { coach_chat: 5 } });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => limiter.consume(ALICE, 'coach_chat')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
  });

  it('keys contain only the action and the user id: never an IP address and never any part of a token', async () => {
    const store = new InMemoryAiRateLimitStore();
    const hit = vi.spyOn(store, 'hit');
    const limiter = createAiRateLimiter({ store, limits: { coach_chat: 1 } });

    await limiter.consume(ALICE, 'coach_chat');
    await caught(limiter.consume(ALICE, 'coach_chat'));

    expect(hit).toHaveBeenCalledTimes(2);
    expect(hit.mock.calls[0]![0]).toBe(`ai:coach_chat:${ALICE}`);
  });
});

describe('InMemoryAiRateLimitStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns an independent snapshot per hit, so same-tick callers each see their own count', () => {
    const store = new InMemoryAiRateLimitStore();

    const hits = Array.from({ length: 5 }, () => store.hit('k', 1_000));

    expect(hits.map((h) => h.count)).toEqual([1, 2, 3, 4, 5]);
  });

  it('starts a fresh window after the previous one ends', async () => {
    const store = new InMemoryAiRateLimitStore();
    store.hit('k', 1_000);
    store.hit('k', 1_000);

    await vi.advanceTimersByTimeAsync(1_001);

    expect(store.hit('k', 1_000).count).toBe(1);
  });

  it('forgets idle keys, so memory is bounded by users active within one window', async () => {
    const store = new InMemoryAiRateLimitStore();
    for (let i = 0; i < 1_000; i += 1) store.hit(`user-${i}`, 1_000);
    expect(
      (store as unknown as { windows: Map<string, unknown> }).windows.size,
    ).toBe(1_000);

    await vi.advanceTimersByTimeAsync(61_000);
    store.hit('someone-new', 1_000); // any later hit triggers the lazy sweep

    expect((store as unknown as { windows: Map<string, unknown> }).windows.size).toBe(1);
  });
});

describe('AiUsageGateService with the rate limiter', () => {
  const buildGate = (limits: Parameters<typeof createAiRateLimiter>[0]) => {
    const usage = new InMemoryAiUsageStore();
    const settings = {
      getSettingByKey: async () => null,
      reserveAiUsage: (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => usage.reserveAiUsage(input),
      releaseAiUsage: (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => usage.releaseAiUsage(input),
    };
    const gate = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(settings as never),
      createAiRateLimiter(limits),
    );
    return { gate, usage };
  };

  it('a rate-limited request never reaches the provider and is NOT charged (Step 1 quota semantics unchanged)', async () => {
    const { gate, usage } = buildGate({ limits: { coach_chat: 2 } });
    const work = vi.fn(async () => 'ok');

    await gate.run({ userId: ALICE, action: 'coach_chat' }, work);
    await gate.run({ userId: ALICE, action: 'coach_chat' }, work);
    const reservationsBefore = usage.reserveCalls;
    const error = await caught(gate.run({ userId: ALICE, action: 'coach_chat' }, work));

    expect(error.code).toBe('RATE_LIMITED');
    expect(work).toHaveBeenCalledTimes(2);
    expect(usage.reserveCalls).toBe(reservationsBefore); // rejected before any quota work
    expect(usage.actionCount(ALICE, 'coach_chat')).toBe(2);
  });

  it('the rate limiter does not weaken the daily quota: both limits apply independently', async () => {
    const { gate, usage } = buildGate({ limits: { coach_chat: 1_000 } });
    usage.setCount(ALICE, 'coach_chat', 20); // default daily coach limit already used

    const error = await caught(gate.run({ userId: ALICE, action: 'coach_chat' }, async () => 'ok'));

    expect(error.code).toBe('AI_QUOTA_EXCEEDED');
  });

  it('works without a limiter (existing wiring stays valid)', async () => {
    const usage = new InMemoryAiUsageStore();
    const settings = {
      getSettingByKey: async () => null,
      reserveAiUsage: (i: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) => usage.reserveAiUsage(i),
      releaseAiUsage: (i: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) => usage.releaseAiUsage(i),
    };
    const gate = new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as never));

    await expect(gate.run({ userId: ALICE, action: 'coach_chat' }, async () => 'ok')).resolves.toBe('ok');
  });

  it('a limited user never blocks another user going through the same gate', async () => {
    const { gate } = buildGate({ limits: { meal_photo: 1 } });
    await gate.run({ userId: ALICE, action: 'meal_photo' }, async () => 'ok');
    expect((await caught(gate.run({ userId: ALICE, action: 'meal_photo' }, async () => 'ok'))).code).toBe('RATE_LIMITED');

    await expect(gate.run({ userId: BOB, action: 'meal_photo' }, async () => 'bob ok')).resolves.toBe('bob ok');
  });

  it('assertEnabled (cached reads that call no provider) is not rate limited', async () => {
    const { gate } = buildGate({ limits: { coach_chat: 1 } });

    for (let i = 0; i < 50; i += 1) await gate.assertEnabled('coach_chat');
  });
});

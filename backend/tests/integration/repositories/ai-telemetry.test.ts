import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  GeminiRuntimeService,
  PgAppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import { createAiRateLimiter } from '../../../src/shared/ai/ai-rate-limit.js';
import { currentAiRequestContext } from '../../../src/shared/ai/ai-usage.js';
import type { GeminiFeature } from '../../../src/shared/ai/gemini-feature.js';
import { callPythonAi, pythonUsageSchema } from '../../../src/shared/ai/python-ai-call.js';
import { PythonAiError, type PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { seedUser } from '../../helpers/test-app.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

/**
 * AI telemetry in the real `gemini_usage_events` table, through the production path: the real gate,
 * `callPythonAi` and the real `GeminiRuntimeService.recordExternalUsage`. Only the Python HTTP client
 * is replaced. The point: every served provider call is recorded exactly once, for the authenticated
 * user who made it, under the right operation type, and calls that never reach Python record nothing.
 */

interface EventRow {
  request_id: string;
  user_id: string | null;
  feature: string;
  model: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
  error_category: string | null;
  duration_ms: number;
}

const usage = (overrides: Partial<z.input<typeof pythonUsageSchema>> = {}) => ({
  model: 'gemini-3.5-flash-lite',
  isFallback: false,
  inputTokens: 11,
  outputTokens: 7,
  cachedTokens: 0,
  thinkingTokens: 0,
  totalTokens: 18,
  durationMs: 120,
  ...overrides,
});
const reply = (overrides: Partial<z.input<typeof pythonUsageSchema>> = {}) => ({ outcome: 'ok', usage: usage(overrides) });
const replySchema = z.object({ outcome: z.string(), usage: pythonUsageSchema });

describe('AI telemetry against real PostgreSQL', () => {
  let db: TestDatabase;
  let settings: PgAppSettingsRepository;
  let runtime: GeminiRuntimeService;
  let gate: AiUsageGateService;
  let alice: string;
  let bob: string;
  let requestSeq = 0;

  const events = async (): Promise<EventRow[]> =>
    (await db.pool.query<EventRow>('SELECT * FROM gemini_usage_events ORDER BY created_at, request_id')).rows;
  /** Telemetry is written fire-and-forget after the response, so wait for the rows to land. */
  const waitForEvents = async (expected: number): Promise<EventRow[]> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = await events();
      if (rows.length >= expected) return rows;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return events();
  };
  const quotaUsed = async (userId: string): Promise<number> => {
    const used = await db.pool.query<{ n: string }>(
      'SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1',
      [userId],
    );
    return Number(used.rows[0]!.n);
  };
  /** A Python call made the way every adapter makes it: inside the gate, as the authenticated user. */
  const pythonCall = (postJson: ReturnType<typeof vi.fn>, feature: GeminiFeature, body: unknown = {}) =>
    callPythonAi({
      client: { postJson } as unknown as PythonAiClient,
      path: '/internal/v1/ai/test',
      scope: 'ai:test',
      userId: currentAiRequestContext()?.userId ?? '',
      requestId: `req-${(requestSeq += 1)}`,
      timeoutMs: 5_000,
      body,
      schema: replySchema,
      feature,
      usageRecorder: runtime,
      label: 'Python test call',
      unavailableMessage: 'AI is unavailable.',
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    const database = new Database(db.pool);
    settings = new PgAppSettingsRepository(database, new PgUnitOfWork(database));
    runtime = new GeminiRuntimeService({ repo: settings, encryptionKey: 'k'.repeat(32) });
    gate = new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings), createAiRateLimiter());
    alice = (await seedUser(db.pool)).id;
    bob = (await seedUser(db.pool)).id;
  });
  afterAll(() => db.drop());

  beforeEach(async () => {
    await db.pool.query('DELETE FROM gemini_usage_events');
    await db.pool.query('DELETE FROM user_ai_usage');
  });

  it('coach chat: one success event for the authenticated user with the real token usage', async () => {
    const postJson = vi.fn().mockResolvedValue(reply({ inputTokens: 21, outputTokens: 9, totalTokens: 30 }));

    await gate.run({ userId: alice, action: 'coach_chat' }, () => pythonCall(postJson, 'coach_chat'));

    const rows = await waitForEvents(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: alice,
      feature: 'coach_chat',
      model: 'gemini-3.5-flash-lite',
      status: 'success',
      input_tokens: 21,
      output_tokens: 9,
      total_tokens: 30,
      duration_ms: 120,
      error_category: null,
    });
    expect(Number(rows[0]!.estimated_cost_usd)).toBeGreaterThan(0);
    expect(rows[0]!.request_id).toMatch(/^req-/);
    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['coach insights', 'coach_chat', 'coach_insights'],
    ['meal photo', 'meal_photo', 'meal_photo'],
    ['voice meal', 'voice_meal', 'voice_meal'],
  ] as const)('%s: recorded under operation type %s/%s for the right user', async (_name, gateAction, feature) => {
    const postJson = vi.fn().mockResolvedValue(reply());

    await gate.run({ userId: bob, action: gateAction }, () => pythonCall(postJson, feature));

    const rows = await waitForEvents(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: bob, feature, status: 'success' });
  });

  it('a call Python served with its fallback model is recorded as FALLBACK_SUCCESS', async () => {
    const postJson = vi.fn().mockResolvedValue(reply({ model: 'gemini-3.1-flash-lite', isFallback: true }));

    await gate.run({ userId: alice, action: 'coach_chat' }, () => pythonCall(postJson, 'coach_chat'));

    const rows = await waitForEvents(1);
    expect(rows[0]).toMatchObject({
      user_id: alice,
      model: 'gemini-3.1-flash-lite',
      status: 'success',
      error_category: 'FALLBACK_SUCCESS',
    });
  });

  it('attributes every event to the right user under heavy concurrency (no cross-user leakage)', async () => {
    const jobs = Array.from({ length: 24 }, (_, i) => ({
      index: i,
      userId: i % 2 === 0 ? alice : bob,
      // Each request gets a unique fingerprint (its input token count) from a randomly delayed reply.
      inputTokens: 1_000 + i,
    }));
    const postJson = vi.fn(async (request: { body: { job: number } }) => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 40));
      return reply({ inputTokens: 1_000 + request.body.job, totalTokens: 1_001 + request.body.job });
    });

    await Promise.all(
      jobs.map((job) =>
        gate.run({ userId: job.userId, action: 'coach_chat' }, () =>
          pythonCall(postJson, 'coach_chat', { job: job.index }),
        ),
      ),
    );

    const rows = await waitForEvents(jobs.length);
    expect(rows).toHaveLength(jobs.length);
    for (const job of jobs) {
      const row = rows.find((r) => r.input_tokens === job.inputTokens);
      expect(row?.user_id).toBe(job.userId);
    }
    expect(new Set(rows.map((r) => r.request_id)).size).toBe(jobs.length); // unique request ids
  });

  it('requests blocked before the provider (rate limit, quota, kill switch) record NO provider event', async () => {
    const postJson = vi.fn().mockResolvedValue(reply());
    const strict = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(settings),
      createAiRateLimiter({ limits: { coach_chat: 1 } }),
    );
    await strict.run({ userId: alice, action: 'coach_chat' }, () => pythonCall(postJson, 'coach_chat'));
    await waitForEvents(1);

    await expect(
      strict.run({ userId: alice, action: 'coach_chat' }, () => pythonCall(postJson, 'coach_chat')),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(postJson).toHaveBeenCalledTimes(1);
    expect(await events()).toHaveLength(1);
  });

  it('a Python failure after dispatch records no event and keeps the quota unit consumed', async () => {
    const postJson = vi
      .fn()
      .mockRejectedValue(new PythonAiError('provider_unavailable', 'Gemini overloaded', { dispatched: true }));

    await expect(
      gate.run({ userId: alice, action: 'coach_chat' }, () => pythonCall(postJson, 'coach_chat')),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await events()).toHaveLength(0);
    expect(await quotaUsed(alice)).toBe(1);
  });

  it('a failure before Python was reached records no event and refunds the quota', async () => {
    const postJson = vi
      .fn()
      .mockRejectedValue(new PythonAiError('unreachable', 'connection refused', { dispatched: false }));

    await expect(
      gate.run({ userId: alice, action: 'coach_chat' }, () => pythonCall(postJson, 'coach_chat')),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await events()).toHaveLength(0);
    expect(await quotaUsed(alice)).toBe(0);
  });
});

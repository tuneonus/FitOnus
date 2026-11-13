import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  GeminiRuntimeService,
  PgAppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import { GeminiClient } from '../../../src/modules/coach/infrastructure/gemini-client.js';
import { createAiRateLimiter } from '../../../src/shared/ai/ai-rate-limit.js';
import { seedUser } from '../../helpers/test-app.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

/**
 * AI telemetry in the real `gemini_usage_events` table, through the real gate, runtime service and
 * Google SDK. Only `fetch` is replaced. The point: every provider call is recorded exactly once, for
 * the authenticated user who made it, under the right operation type, with the right outcome.
 */

interface EventRow {
  request_id: string;
  user_id: string | null;
  feature: string;
  model: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  error_category: string | null;
  duration_ms: number;
}

const okBody = (text: string, promptTokenCount = 11, candidatesTokenCount = 7) =>
  JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: {
      promptTokenCount,
      candidatesTokenCount,
      totalTokenCount: promptTokenCount + candidatesTokenCount,
    },
  });
const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

describe('AI telemetry against real PostgreSQL', () => {
  let db: TestDatabase;
  let client: GeminiClient;
  let gate: AiUsageGateService;
  let alice: string;
  let bob: string;

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
  const stubFetch = (handler: (init: RequestInit | undefined) => Promise<Response> | Response) => {
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => handler(init));
    vi.stubGlobal('fetch', fetchStub);
    return fetchStub;
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    const database = new Database(db.pool);
    const settings = new PgAppSettingsRepository(database, new PgUnitOfWork(database));
    const runtime = new GeminiRuntimeService({
      repo: settings,
      encryptionKey: 'k'.repeat(32),
      fallbackApiKey: 'test-key-not-real',
    });
    client = new GeminiClient({ runtimeService: runtime });
    gate = new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings), createAiRateLimiter());
    alice = (await seedUser(db.pool)).id;
    bob = (await seedUser(db.pool)).id;
  });
  afterAll(() => db.drop());

  beforeEach(async () => {
    await db.pool.query('DELETE FROM gemini_usage_events');
    await db.pool.query('DELETE FROM user_ai_usage');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('coach chat: one success event for the authenticated user with the real token usage', async () => {
    const fetchStub = stubFetch(() => json(okBody('hi there', 21, 9)));

    await gate.run({ userId: alice, action: 'coach_chat' }, () => client.generateText('hello', 5_000));

    const rows = await waitForEvents(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: alice,
      feature: 'coach_chat',
      status: 'success',
      input_tokens: 21,
      output_tokens: 9,
      total_tokens: 30,
      error_category: null,
    });
    expect(rows[0]!.model).toBeTruthy();
    expect(rows[0]!.request_id).toMatch(/^req-/);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['coach insights', 'coach_chat', 'coach_insights', (c: GeminiClient) => c.generateText('p', 5_000, 'coach_insights')],
    ['meal photo', 'meal_photo', 'meal_photo', (c: GeminiClient) => c.generateFromImage({ mimeType: 'image/jpeg', base64: 'aGVsbG8=' }, 'p', 5_000)],
    ['voice meal (audio)', 'voice_meal', 'voice_meal', (c: GeminiClient) => c.generateFromAudio({ mimeType: 'audio/webm', base64: 'aGVsbG8=' }, 'p', 5_000)],
    ['voice meal (text)', 'voice_meal', 'voice_meal', (c: GeminiClient) => c.generateText('p', 5_000, 'voice_meal')],
  ] as const)(
    '%s: recorded under operation type %s/%s for the right user',
    async (_name, gateAction, feature, call) => {
      stubFetch(() => json(okBody('ok')));

      await gate.run({ userId: bob, action: gateAction }, () => call(client));

      const rows = await waitForEvents(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: bob, feature, status: 'success' });
    },
  );

  it('a timeout is recorded as `timeout` / TIMEOUT for the user, with no tokens or cost, and one provider request', async () => {
    const fetchStub = stubFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    await expect(
      gate.run({ userId: alice, action: 'coach_chat' }, () => client.generateText('hello', 80)),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: 'AI request timed out. Please try again.' });

    const rows = await waitForEvents(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: alice,
      feature: 'coach_chat',
      status: 'timeout',
      error_category: 'TIMEOUT',
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });
    expect(rows[0]!.duration_ms).toBeGreaterThanOrEqual(70);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    // Step 1 semantics: the provider was dispatched, so the quota unit stays consumed.
    const used = await db.pool.query<{ n: string }>(
      "SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1 AND action_type = 'coach_chat'",
      [alice],
    );
    expect(Number(used.rows[0]!.n)).toBe(1);
  });

  it.each([
    [429, 'rate_limited', 'RATE_LIMITED'],
    [404, 'failed', 'MODEL_NOT_FOUND'],
    [500, 'failed', 'PROVIDER_ERROR'],
  ] as const)('provider HTTP %s is recorded as %s / %s', async (httpStatus, status, category) => {
    stubFetch(() =>
      json(JSON.stringify({ error: { code: httpStatus, message: `provider said ${httpStatus}`, status: 'X' } }), httpStatus),
    );

    await expect(gate.run({ userId: alice, action: 'coach_chat' }, () => client.generateText('hi', 5_000))).rejects.toBeDefined();

    const rows = await waitForEvents(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: alice, status, error_category: category });
  });

  it('attributes every event to the right user under heavy concurrency (no cross-user leakage)', async () => {
    const jobs = Array.from({ length: 24 }, (_, i) => ({
      index: i,
      userId: i % 2 === 0 ? alice : bob,
      // Each request gets a unique fingerprint (its input token count) from a randomly delayed reply.
      inputTokens: 1_000 + i,
    }));
    stubFetch(async (init) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { contents: { parts: { text: string }[] }[] };
      const index = Number(/job-(\d+)/.exec(body.contents[0]!.parts[0]!.text)![1]);
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 40));
      return json(okBody('ok', 1_000 + index, 1));
    });

    await Promise.all(
      jobs.map((job) =>
        gate.run({ userId: job.userId, action: 'coach_chat' }, () => client.generateText(`job-${job.index}`, 5_000)),
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
    const fetchStub = stubFetch(() => json(okBody('ok')));
    const strict = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(
        new PgAppSettingsRepository(new Database(db.pool), new PgUnitOfWork(new Database(db.pool))),
      ),
      createAiRateLimiter({ limits: { coach_chat: 1 } }),
    );
    await strict.run({ userId: alice, action: 'coach_chat' }, () => client.generateText('one', 5_000));
    await waitForEvents(1);

    await expect(
      strict.run({ userId: alice, action: 'coach_chat' }, () => client.generateText('two', 5_000)),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(await events()).toHaveLength(1);
  });

  it('a call made outside the gate is still recorded, with no user (never a wrong one)', async () => {
    stubFetch(() => json(okBody('ok')));

    await client.generateText('system job', 5_000, 'coach_insights');

    const rows = await waitForEvents(1);
    expect(rows[0]).toMatchObject({ user_id: null, feature: 'coach_insights', status: 'success' });
  });

  it('a failure before the provider (no API key) records no event and refunds the quota', async () => {
    const database = new Database(db.pool);
    const settings = new PgAppSettingsRepository(database, new PgUnitOfWork(database));
    const keyless = new GeminiClient({
      runtimeService: new GeminiRuntimeService({ repo: settings, encryptionKey: 'k'.repeat(32) }),
    });
    const fetchStub = stubFetch(() => json(okBody('ok')));

    await expect(
      gate.run({ userId: alice, action: 'coach_chat' }, () => keyless.generateText('hi', 5_000)),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fetchStub).not.toHaveBeenCalled();
    expect(await events()).toHaveLength(0);
    const used = await db.pool.query<{ n: string }>(
      'SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1',
      [alice],
    );
    expect(Number(used.rows[0]!.n)).toBe(0);
  });
});

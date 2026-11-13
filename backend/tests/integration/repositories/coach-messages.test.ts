import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  PgAppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import type {
  GeminiService,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { PgConversationRepository } from '../../../src/modules/coach/infrastructure/pg-conversation-repository.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { seedUser } from '../../helpers/test-app.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

/**
 * `coach_messages.id` is a GLOBAL primary key and clients may choose it (`clientMessageId`).
 * These tests run the real SQL against PostgreSQL to prove that one user can never overwrite,
 * hijack or corrupt another user's message by reusing its ID.
 */

const SHARED_ID = 'msg-1700000000000-2'; // the exact shape the mobile client generates: guessable
const A_SECRET = 'A-PRIVATE: my blood pressure is 150/95';
const B_ATTACK = 'B-OVERWRITE: this must never be stored under A';

interface Row {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  text: string;
  blocks: unknown;
  sources: unknown;
  follow_ups: unknown;
  created_at: Date;
}

describe('Coach message ownership against real PostgreSQL', () => {
  let db: TestDatabase;
  let repo: PgConversationRepository;
  let userA: string;
  let userB: string;
  let convoA: string;
  let convoB: string;

  const message = (overrides: Partial<Parameters<PgConversationRepository['addMessage']>[2]> = {}) => ({
    id: SHARED_ID,
    conversationId: convoA,
    role: 'user' as const,
    text: A_SECRET,
    blocks: [],
    sources: ['profile'],
    followUps: ['follow up A'],
    createdAt: '2026-11-13T00:00:00.000Z',
    ...overrides,
  });

  const rowsById = async (id: string) =>
    (await db.pool.query<Row>('SELECT * FROM coach_messages WHERE id = $1', [id])).rows;
  const count = async () =>
    Number((await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM coach_messages')).rows[0]!.n);
  const convoUpdatedAt = async (id: string) =>
    (await db.pool.query<{ u: Date }>('SELECT updated_at AS u FROM coach_conversations WHERE id = $1', [id]))
      .rows[0]!.u.getTime();

  beforeAll(async () => {
    db = await createTestDatabase();
    repo = new PgConversationRepository(new Database(db.pool));
    userA = (await seedUser(db.pool)).id;
    userB = (await seedUser(db.pool)).id;
  });
  afterAll(() => db.drop());

  beforeEach(async () => {
    await db.pool.query('DELETE FROM coach_messages');
    await db.pool.query('DELETE FROM coach_conversations');
    convoA = (await repo.createConversation(userA, 'A conversation')).id;
    convoB = (await repo.createConversation(userB, 'B conversation')).id;
  });

  describe('repository', () => {
    it('user A creates a message', async () => {
      await repo.addMessage(userA, convoA, message());

      const rows = await rowsById(SHARED_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: userA, conversation_id: convoA, role: 'user', text: A_SECRET });
    });

    it('user A retrying the same message is idempotent: one row, same content, no error', async () => {
      await repo.addMessage(userA, convoA, message());
      const before = (await rowsById(SHARED_ID))[0]!;

      await expect(repo.addMessage(userA, convoA, message())).resolves.toBeUndefined();
      await expect(repo.addMessage(userA, convoA, message())).resolves.toBeUndefined();

      const rows = await rowsById(SHARED_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(before);
    });

    it('user B reusing user A’s message ID in B’s own conversation is rejected and A’s message is untouched', async () => {
      await repo.addMessage(userA, convoA, message());
      const before = (await rowsById(SHARED_ID))[0]!;
      const convoAUpdatedBefore = await convoUpdatedAt(convoA);
      const convoBUpdatedBefore = await convoUpdatedAt(convoB);

      const attack = repo.addMessage(
        userB,
        convoB,
        message({
          conversationId: convoB,
          text: B_ATTACK,
          sources: ['attacker'],
          followUps: ['attacker follow up'],
          blocks: [{ type: 'metrics', title: 'attacker', items: [] }],
        }),
      );

      await expect(attack).rejects.toSatisfy(
        (error: unknown) => isAppError(error) && error.kind === 'conflict' && error.code === 'CONFLICT',
      );
      const rows = await rowsById(SHARED_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(before); // every column, including text, blocks, sources, follow_ups, owner
      expect(await count()).toBe(1);
      // A rejected write must not touch either conversation.
      expect(await convoUpdatedAt(convoA)).toBe(convoAUpdatedBefore);
      expect(await convoUpdatedAt(convoB)).toBe(convoBUpdatedBefore);
    });

    it('the rejection never reveals another user’s content, owner or conversation', async () => {
      await repo.addMessage(userA, convoA, message());

      const error = await repo
        .addMessage(userB, convoB, message({ conversationId: convoB, text: B_ATTACK }))
        .then(
          () => null,
          (e: unknown) => e,
        );

      expect(isAppError(error)).toBe(true);
      const serialised = JSON.stringify({
        message: (error as Error).message,
        details: (error as { details?: unknown }).details,
      });
      for (const secret of [A_SECRET, 'A-PRIVATE', userA, convoA, 'blood pressure']) {
        expect(serialised).not.toContain(secret);
      }
    });

    it('user B writing into user A’s conversation is rejected and stores nothing', async () => {
      await repo.addMessage(userA, convoA, message());
      const before = (await rowsById(SHARED_ID))[0]!;

      await expect(
        repo.addMessage(userB, convoA, message({ id: 'msg-b-fresh-id', text: B_ATTACK })),
      ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.kind === 'not_found');
      await expect(
        repo.addMessage(userB, convoA, message({ text: B_ATTACK })), // colliding id + foreign conversation
      ).rejects.toSatisfy((error: unknown) => isAppError(error));

      expect(await rowsById('msg-b-fresh-id')).toHaveLength(0);
      expect(await count()).toBe(1);
      expect((await rowsById(SHARED_ID))[0]).toEqual(before);
    });

    it('the same user cannot overwrite a message of their other conversation by reusing its ID', async () => {
      const convoA2 = (await repo.createConversation(userA, 'A second conversation')).id;
      await repo.addMessage(userA, convoA, message());
      const before = (await rowsById(SHARED_ID))[0]!;

      await expect(
        repo.addMessage(userA, convoA2, message({ conversationId: convoA2, text: 'different text' })),
      ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.kind === 'conflict');

      expect((await rowsById(SHARED_ID))[0]).toEqual(before);
    });

    it('a user message cannot overwrite a stored assistant answer by reusing its ID', async () => {
      await repo.addMessage(userA, convoA, message({ id: 'msg-assistant-1', role: 'assistant', text: 'AI answer' }));

      await expect(
        repo.addMessage(userA, convoA, message({ id: 'msg-assistant-1', role: 'user', text: 'forged' })),
      ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.kind === 'conflict');

      expect((await rowsById('msg-assistant-1'))[0]).toMatchObject({ role: 'assistant', text: 'AI answer' });
    });

    it('rejects a message for a conversation that does not exist without creating anything', async () => {
      await expect(
        repo.addMessage(userA, '00000000-0000-4000-8000-000000000000', message()),
      ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.kind === 'not_found');
      expect(await count()).toBe(0);
    });

    it('concurrent conflicting writes: exactly one user owns the ID, the other is rejected, content is never mixed', async () => {
      for (let round = 0; round < 25; round += 1) {
        const id = `msg-race-${round}`;
        const results = await Promise.allSettled([
          repo.addMessage(userA, convoA, message({ id, text: `A-${round}`, sources: ['A'], followUps: ['A'] })),
          repo.addMessage(
            userB,
            convoB,
            message({ id, conversationId: convoB, text: `B-${round}`, sources: ['B'], followUps: ['B'] }),
          ),
        ]);

        const winners = results.filter((r) => r.status === 'fulfilled');
        const losers = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(1);
        expect(isAppError(losers[0]!.reason) && losers[0]!.reason.kind === 'conflict').toBe(true);

        const rows = await rowsById(id);
        expect(rows).toHaveLength(1);
        const row = rows[0]!;
        const owner = row.user_id === userA ? 'A' : 'B';
        expect(row.text).toBe(`${owner}-${round}`); // no field-level mixing of the two writers
        expect(row.sources).toEqual([owner]);
        expect(row.follow_ups).toEqual([owner]);
        expect(row.conversation_id).toBe(owner === 'A' ? convoA : convoB);
      }
    });

    it('many concurrent retries by the owner all succeed and leave one row', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () => repo.addMessage(userA, convoA, message())),
      );

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const rows = await rowsById(SHARED_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: userA, text: A_SECRET });
    });

    it('a flood of concurrent attackers cannot displace the owner’s message', async () => {
      await repo.addMessage(userA, convoA, message());
      const before = (await rowsById(SHARED_ID))[0]!;

      const results = await Promise.allSettled([
        ...Array.from({ length: 15 }, () =>
          repo.addMessage(userB, convoB, message({ conversationId: convoB, text: B_ATTACK })),
        ),
        ...Array.from({ length: 5 }, () => repo.addMessage(userA, convoA, message())),
      ]);

      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(15);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect((await rowsById(SHARED_ID))[0]).toEqual(before);
    });

    it('existing conversation history stays readable, ordered, and isolated per user', async () => {
      // Rows exactly as the previous implementation (and older data) stored them: written with raw SQL.
      await db.pool.query(
        `INSERT INTO coach_messages (id, conversation_id, user_id, role, text, blocks, sources, follow_ups, created_at)
         VALUES ('legacy-1', $1, $2, 'user',      'legacy question', '[]', '[]', '[]', '2026-01-01T00:00:00Z'),
                ('legacy-2', $1, $2, 'assistant', 'legacy answer',   '[{"type":"metrics","title":"t","items":[]}]', '["src"]', '["next"]', '2026-01-01T00:00:01Z')`,
        [convoA, userA],
      );
      await repo.addMessage(userA, convoA, message({ createdAt: '2026-01-01T00:00:02Z' }));
      await expect(
        repo.addMessage(userB, convoB, message({ conversationId: convoB, text: B_ATTACK })),
      ).rejects.toBeDefined();

      const history = await repo.getMessages(userA, convoA);
      expect(history.map((m) => m.id)).toEqual(['legacy-1', 'legacy-2', SHARED_ID]);
      expect(history[1]).toMatchObject({
        role: 'assistant',
        text: 'legacy answer',
        blocks: [{ type: 'metrics', title: 't', items: [] }],
        sources: ['src'],
        followUps: ['next'],
      });
      expect(history[2]).toMatchObject({ text: A_SECRET, conversationId: convoA });

      const detail = await repo.getConversation(userA, convoA);
      expect(detail?.messages).toHaveLength(3);
      expect(await repo.getMessages(userB, convoB)).toHaveLength(0);
      expect(await repo.getMessages(userB, convoA)).toHaveLength(0); // B cannot read A's conversation
    });

    it('an assistant message refreshes the conversation preview; a user message does not', async () => {
      await repo.addMessage(userA, convoA, message({ id: 'u1', text: 'question' }));
      await repo.addMessage(userA, convoA, message({ id: 'a1', role: 'assistant', text: 'the answer' }));

      const detail = await repo.getConversation(userA, convoA);
      expect(detail?.preview).toBe('the answer');
    });
  });

  describe('chat use case with the real repository and the real Step 1 quota gate', () => {
    let gate: AiUsageGateService;
    let settings: PgAppSettingsRepository;
    let generate: ReturnType<typeof vi.fn>;
    let chat: ChatWithCoachUseCase;

    const usage = async (userId: string) =>
      Number(
        (
          await db.pool.query<{ n: string }>(
            "SELECT COALESCE(SUM(request_count), 0) AS n FROM user_ai_usage WHERE user_id = $1 AND action_type = 'coach_chat'",
            [userId],
          )
        ).rows[0]!.n,
      );
    const messagesOf = async (userId: string) =>
      (
        await db.pool.query<Row>('SELECT * FROM coach_messages WHERE user_id = $1 ORDER BY created_at', [userId])
      ).rows;

    beforeAll(async () => {
      const database = new Database(db.pool);
      settings = new PgAppSettingsRepository(database, new PgUnitOfWork(database));
      gate = new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings));
    });

    beforeEach(async () => {
      await db.pool.query('DELETE FROM user_ai_usage');
      const limits = await settings.getSettingByKey('ai.limits');
      await settings.updateSetting(
        'ai.limits',
        { ...limits!.value, coachChatDailyLimit: 3, dailyGlobalLimit: 50 },
        limits!.version,
      );
      generate = vi.fn().mockImplementation(async (text: string) => ({
        text: `reply to: ${text}`,
        sources: ['Profile'],
        followUps: ['more?'],
      }));
      const gemini: GeminiService = {
        generateCoachResponse: generate as unknown as GeminiService['generateCoachResponse'],
        generateInsights: vi.fn(),
      };
      const context: UserContextRepository = {
        getUserFitnessContext: vi.fn().mockResolvedValue({} as UserFitnessContext),
      };
      chat = new ChatWithCoachUseCase(context, gemini, gate, repo);
    });

    it('user A chats with a client message ID, then retries: A’s user message is stored once under that ID', async () => {
      const first = await chat.execute({ userId: userA, message: A_SECRET, clientMessageId: SHARED_ID });
      await chat.execute({
        userId: userA,
        message: A_SECRET,
        clientMessageId: SHARED_ID,
        conversationId: first.conversationId!,
      });

      const userRows = (await messagesOf(userA)).filter((r) => r.role === 'user');
      expect(userRows).toHaveLength(1);
      expect(userRows[0]).toMatchObject({ id: SHARED_ID, text: A_SECRET });
      expect(await usage(userA)).toBe(2); // each retry is a real, separately metered AI request
    });

    it('user B sending A’s message ID still gets a normal reply; A’s message is untouched; B’s message is kept under a server ID', async () => {
      const a = await chat.execute({ userId: userA, message: A_SECRET, clientMessageId: SHARED_ID });
      const aBefore = (await rowsById(SHARED_ID))[0]!;

      const b = await chat.execute({ userId: userB, message: B_ATTACK, clientMessageId: SHARED_ID });

      // Response contract is unchanged and carries no hint of the collision.
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      expect(b.text).toBe(`reply to: ${B_ATTACK}`);
      expect(b.conversationId).toBeTruthy();
      expect(b.conversationId).not.toBe(a.conversationId);

      expect((await rowsById(SHARED_ID))[0]).toEqual(aBefore);
      const bUser = (await messagesOf(userB)).filter((r) => r.role === 'user');
      expect(bUser).toHaveLength(1);
      expect(bUser[0]).toMatchObject({ text: B_ATTACK, conversation_id: b.conversationId });
      expect(bUser[0]!.id).not.toBe(SHARED_ID);

      // B sees their own message in history; A's history is unchanged.
      expect((await repo.getMessages(userB, b.conversationId!)).map((m) => m.text)).toEqual([
        B_ATTACK,
        `reply to: ${B_ATTACK}`,
      ]);
      expect((await repo.getMessages(userA, a.conversationId!))[0]).toMatchObject({ id: SHARED_ID, text: A_SECRET });
    });

    it('a colliding ID is charged exactly one quota unit and calls the provider exactly once', async () => {
      await chat.execute({ userId: userA, message: A_SECRET, clientMessageId: SHARED_ID });
      generate.mockClear();
      const before = await usage(userB);

      await chat.execute({ userId: userB, message: B_ATTACK, clientMessageId: SHARED_ID });

      expect(await usage(userB)).toBe(before + 1);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it('simultaneous requests from both users with the same client message ID both succeed and nothing is lost', async () => {
      const [a, b] = await Promise.all([
        chat.execute({ userId: userA, message: A_SECRET, clientMessageId: SHARED_ID }),
        chat.execute({ userId: userB, message: B_ATTACK, clientMessageId: SHARED_ID }),
      ]);

      const owners = await rowsById(SHARED_ID);
      expect(owners).toHaveLength(1);
      const ownerText = owners[0]!.user_id === userA ? A_SECRET : B_ATTACK;
      expect(owners[0]!.text).toBe(ownerText);

      for (const [userId, text, result] of [
        [userA, A_SECRET, a],
        [userB, B_ATTACK, b],
      ] as const) {
        const history = await repo.getMessages(userId, result.conversationId!);
        expect(history.map((m) => m.text)).toEqual([text, `reply to: ${text}`]);
      }
    });

    it('simultaneous requests in the same millisecond never collide on server-generated message IDs', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
      try {
        const results = await Promise.all([
          chat.execute({ userId: userA, message: 'question A' }),
          chat.execute({ userId: userB, message: 'question B' }),
        ]);

        for (const [userId, result] of [
          [userA, results[0]],
          [userB, results[1]],
        ] as const) {
          const history = await repo.getMessages(userId, result.conversationId!);
          expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
        }
        const ids = (await db.pool.query<{ id: string }>('SELECT id FROM coach_messages')).rows.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toHaveLength(4);
      } finally {
        now.mockRestore();
      }
    });

    it('Step 1 quota still gates chat: over the limit nothing is persisted and the provider is not called', async () => {
      for (let i = 0; i < 3; i += 1) await chat.execute({ userId: userA, message: `q${i}` });
      generate.mockClear();
      const messagesBefore = await count();

      const blocked = await chat
        .execute({ userId: userA, message: 'one too many', clientMessageId: 'msg-blocked' })
        .then(
          () => null,
          (e: unknown) => e,
        );

      expect(isAppError(blocked) && blocked.code === 'AI_QUOTA_EXCEEDED').toBe(true);
      expect(generate).not.toHaveBeenCalled();
      expect(await count()).toBe(messagesBefore);
      expect(await rowsById('msg-blocked')).toHaveLength(0);
      expect(await usage(userA)).toBe(3);
      // The quota is per user: B is unaffected by A hitting the limit.
      await expect(chat.execute({ userId: userB, message: 'hello' })).resolves.toMatchObject({
        text: 'reply to: hello',
      });
    });

    it('Step 1 refund still works: a failure before the provider call returns the quota unit', async () => {
      const conversation = await chat.execute({ userId: userA, message: 'first' });
      expect(await usage(userA)).toBe(1);
      // A conversation of another user is not "existing" for A, so A just gets a new one; the failure
      // below is injected on the context read, which runs before the provider is dispatched.
      const failing = new ChatWithCoachUseCase(
        { getUserFitnessContext: vi.fn().mockRejectedValue(new Error('db down')) },
        { generateCoachResponse: generate as never, generateInsights: vi.fn() },
        gate,
        repo,
      );

      await expect(
        failing.execute({ userId: userA, message: 'second', conversationId: conversation.conversationId! }),
      ).rejects.toThrow('db down');

      expect(await usage(userA)).toBe(1); // reserved, then refunded
    });
  });
});

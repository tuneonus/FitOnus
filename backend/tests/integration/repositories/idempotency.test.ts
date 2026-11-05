import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import { IdempotencyService } from '../../../src/shared/idempotency/idempotency.js';
import { PgIdempotencyStore } from '../../../src/shared/idempotency/pg-idempotency-store.js';
import { HmacKeyedHasher } from '../../../src/shared/security/hmac-keyed-hasher.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

describe('PostgreSQL idempotency store', () => {
  let db: TestDatabase;
  let database: Database;
  let uow: PgUnitOfWork;
  let store: PgIdempotencyStore;
  let service: IdempotencyService;

  beforeAll(async () => {
    db = await createTestDatabase();
    database = new Database(db.pool);
    uow = new PgUnitOfWork(database);
    store = new PgIdempotencyStore(database);
    service = new IdempotencyService(store, new HmacKeyedHasher('x'.repeat(40)), {
      ttlSeconds: 3600,
      leaseSeconds: 30,
    });
    await db.pool.query('CREATE TABLE side_effects (id serial PRIMARY KEY, note text NOT NULL)');
  });
  afterAll(() => db.drop());

  const sideEffects = async () =>
    Number((await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM side_effects')).rows[0]!.n);

  /** Simulates a business write plus completion in one transaction. */
  const work = (note: string) => async (complete: (value: { note: string }) => Promise<void>) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return uow.run(async () => {
      await database.query('INSERT INTO side_effects (note) VALUES ($1)', [note]);
      await complete({ note });
      return { note };
    });
  };

  it('executes concurrent duplicates once; others replay or are told to retry', async () => {
    const ref = { scope: 'actor-a', operation: 'demo.create', key: 'concurrent-key-1' };
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.execute(ref, { note: 'hello' }, work('hello'))),
    );
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(fulfilled.filter((outcome) => !outcome.value.replayed)).toHaveLength(1);
    for (const outcome of rejected) {
      expect(outcome.reason).toMatchObject({ code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
    }
    expect(await sideEffects()).toBe(1);

    const replay = await service.execute(ref, { note: 'hello' }, work('hello'));
    expect(replay).toEqual({ value: { note: 'hello' }, replayed: true });
    expect(await sideEffects()).toBe(1);
  });

  it('scopes keys per actor and rejects a reused key with another payload', async () => {
    await service.execute(
      { scope: 'actor-b', operation: 'demo.create', key: 'shared-key-1' },
      { n: 1 },
      work('b'),
    );
    await service.execute(
      { scope: 'actor-c', operation: 'demo.create', key: 'shared-key-1' },
      { n: 1 },
      work('c'),
    );
    await expect(
      service.execute(
        { scope: 'actor-b', operation: 'demo.create', key: 'shared-key-1' },
        { n: 2 },
        work('b2'),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('rolls back the completion with the business write and frees the key', async () => {
    const ref = { scope: 'actor-d', operation: 'demo.create', key: 'failing-key-1' };
    const before = await sideEffects();
    await expect(
      service.execute(ref, {}, (complete) =>
        uow.run(async () => {
          await database.query(`INSERT INTO side_effects (note) VALUES ('doomed')`);
          await complete('done');
          throw new Error('fails after complete');
        }),
      ),
    ).rejects.toThrow('fails after complete');
    expect(await sideEffects()).toBe(before);
    expect(await store.find(ref)).toBeNull();
  });

  it('lets a retry take over a claim abandoned by a crashed request', async () => {
    const ref = { scope: 'actor-e', operation: 'demo.create', key: 'crashed-key-1' };
    const hasher = new HmacKeyedHasher('x'.repeat(40));
    const fingerprint = hasher.digest(`demo.create\n${JSON.stringify({})}`);
    expect(
      await store.claim(ref, {
        fingerprint,
        lockToken: '00000000-0000-4000-8000-000000000001',
        leaseSeconds: 30,
        ttlSeconds: 3600,
      }),
    ).toBe(true);
    // Simulate the holder dying: its lease runs out.
    await db.pool.query(
      `UPDATE idempotency_keys SET locked_until = now() - interval '1 second' WHERE idempotency_key = $1`,
      [ref.key],
    );
    await expect(service.execute(ref, {}, work('recovered'))).resolves.toMatchObject({ replayed: false });
  });

  it('cleans up expired records', async () => {
    await db.pool.query(
      `UPDATE idempotency_keys SET expires_at = now() - interval '1 minute' WHERE scope = 'actor-c'`,
    );
    expect(await store.deleteExpired()).toBe(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

describe('Database transactions', () => {
  let db: TestDatabase;
  let database: Database;
  let uow: PgUnitOfWork;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
    database = new Database(db.pool);
    uow = new PgUnitOfWork(database);
    await db.pool.query('CREATE TABLE notes (id serial PRIMARY KEY, body text NOT NULL UNIQUE)');
  });
  afterAll(() => db.drop());

  const count = async () =>
    Number((await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM notes')).rows[0]!.n);
  const txid = async () =>
    (await database.query<{ id: string }>('SELECT txid_current()::text AS id')).rows[0]!.id;

  it('routes every query inside run() through one transaction', async () => {
    const ids = await uow.run(async () => {
      expect(database.inTransaction).toBe(true);
      return Promise.all([txid(), txid(), uow.run(() => txid())]); // nested run joins the outer transaction
    });
    expect(new Set(ids).size).toBe(1);
    expect(database.inTransaction).toBe(false);
  });

  it('commits on success and rolls back everything on failure', async () => {
    await uow.run(() => database.query(`INSERT INTO notes (body) VALUES ('kept')`));
    await expect(
      uow.run(async () => {
        await database.query(`INSERT INTO notes (body) VALUES ('discarded')`);
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');
    expect(await count()).toBe(1);
  });

  it('rolls back when a constraint fails mid-transaction and releases the client', async () => {
    const idleBefore = db.pool.totalCount;
    await expect(
      uow.run(async () => {
        await database.query(`INSERT INTO notes (body) VALUES ('first')`);
        await database.query(`INSERT INTO notes (body) VALUES ('kept')`); // unique violation
      }),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await count()).toBe(1);
    expect(db.pool.waitingCount).toBe(0);
    expect(db.pool.idleCount).toBeGreaterThanOrEqual(Math.min(idleBefore, 1));
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../../../src/database/transaction.js';
import { PgSessionRepository } from '../../../src/modules/auth/infrastructure/pg-session-repository.js';
import { PgUserRepository } from '../../../src/modules/users/infrastructure/pg-user-repository.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

describe('PostgreSQL repositories and constraints', () => {
  let db: TestDatabase;
  let users: PgUserRepository;
  let sessions: PgSessionRepository;

  beforeAll(async () => {
    db = await createTestDatabase();
    const database = new Database(db.pool);
    users = new PgUserRepository(database);
    sessions = new PgSessionRepository(database);
  });
  afterAll(() => db.drop());

  const newUser = (email: string, displayName = 'Someone') => ({
    email,
    displayName,
    passwordHash: 'hash',
    role: 'member' as const,
  });

  it('maps the unique e-mail constraint to EMAIL_ALREADY_EXISTS', async () => {
    await users.insert(newUser('dup@example.org'));
    await expect(users.insert(newUser('dup@example.org'))).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS',
    });
  });

  it('enforces integrity rules in the database itself', async () => {
    const attempt = (sql: string) => db.pool.query(sql);
    await expect(
      attempt(
        `INSERT INTO users (email, display_name, password_hash) VALUES ('Upper@Example.org', 'x', 'h')`,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'users_email_normalized' });
    await expect(
      attempt(
        `INSERT INTO users (email, display_name, password_hash, role) VALUES ('r@example.org', 'x', 'h', 'root')`,
      ),
    ).rejects.toMatchObject({ constraint: 'users_role_valid' });
    await expect(
      attempt(
        `INSERT INTO users (email, display_name, password_hash, status) VALUES ('s@example.org', 'x', 'h', 'disabled')`,
      ),
    ).rejects.toMatchObject({ constraint: 'users_disabled_at_consistent' });
  });

  it('lets exactly one of several concurrent compare-and-set updates win', async () => {
    const user = await users.insert(newUser('cas@example.org'));
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        users.updateProfile(user.id, user.version, { displayName: `Writer ${i}` }),
      ),
    );
    const winners = results.filter((result) => result !== null);
    expect(winners).toHaveLength(1);
    expect((await users.findById(user.id))!.version).toBe(user.version + 1);
  });

  it('applies status changes conditionally and keeps disabled_at consistent', async () => {
    const user = await users.insert(newUser('status@example.org'));
    const [a, b] = await Promise.all([
      users.changeStatus(user.id, user.version, 'disabled'),
      users.changeStatus(user.id, user.version, 'disabled'),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const disabled = (await users.findById(user.id))!;
    expect(disabled.status).toBe('disabled');
    expect(disabled.disabledAt).toBeInstanceOf(Date);
  });

  it('searches safely: LIKE wildcards in input are literals, sorting is whitelisted', async () => {
    await users.insert(newUser('percent@example.org', '100% Real'));
    await users.insert(newUser('plain@example.org', '100 Real'));
    const page = await users.list({ page: 1, limit: 10, search: '100%', sort: 'email', order: 'asc' });
    expect(page.items.map((user) => user.email)).toEqual(['percent@example.org']);
    expect(page.total).toBe(1);

    const all = await users.list({ page: 1, limit: 2, sort: 'email', order: 'asc' });
    expect(all.items).toHaveLength(2);
    expect(all.total).toBeGreaterThan(2);
  });

  it('rotates a refresh hash exactly once under concurrency', async () => {
    const user = await users.insert(newUser('rotate@example.org'));
    const session = await sessions.create({
      id: randomUUID(),
      userId: user.id,
      refreshTokenHash: 'hash-0',
      expiresAt: new Date(Date.now() + 86_400_000),
      userAgent: null,
      ipAddress: null,
    });
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        sessions.rotate({
          id: session.id,
          currentHash: 'hash-0',
          nextHash: `hash-${i + 1}`,
          expiresAt: session.expiresAt,
        }),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect((await sessions.findById(session.id))!.rotationCount).toBe(1);

    expect(await sessions.revoke(session.id, 'logout')).toBe(true);
    expect(await sessions.revoke(session.id, 'logout')).toBe(false);
    await expect(
      sessions.rotate({
        id: session.id,
        currentHash: attempts.find(Boolean)!.refreshTokenHash,
        nextHash: 'x',
        expiresAt: session.expiresAt,
      }),
    ).resolves.toBeNull();
  });
});

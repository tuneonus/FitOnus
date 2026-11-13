import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import type { UserAccountsPort } from '../../../src/modules/auth/application/ports.js';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/use-cases/request-password-reset.js';
import { ResetPasswordUseCase } from '../../../src/modules/auth/application/use-cases/reset-password.js';
import {
  otpDigestInput,
  resolvePasswordResetSettings,
} from '../../../src/modules/auth/domain/password-reset.js';
import { createAuthMaintenance } from '../../../src/modules/auth/index.js';
import { PgPasswordResetTokenRepository } from '../../../src/modules/auth/infrastructure/pg-password-reset-token-repository.js';
import { PgSessionRepository } from '../../../src/modules/auth/infrastructure/pg-session-repository.js';
import { createUserAccountsApi } from '../../../src/modules/users/application/accounts.js';
import { PgUserRepository } from '../../../src/modules/users/infrastructure/pg-user-repository.js';
import { Argon2PasswordHasher } from '../../../src/shared/security/argon2-password-hasher.js';
import { HmacKeyedHasher } from '../../../src/shared/security/hmac-keyed-hasher.js';
import {
  flush,
  MINUTE,
  MutableClock,
  RecordingNotifier,
} from '../../unit/auth/support/password-reset-fakes.js';
import { seedUser } from '../../helpers/test-app.js';
import { createTestDatabase, MIGRATIONS_DIR, type TestDatabase } from '../../helpers/test-database.js';

const NEW_PASSWORD = 'a brand new passphrase';
const SECOND = 1_000;
const wrongOtp = (otp: string) => (otp === '000000' ? '000001' : '000000');

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
  request_ip: string | null;
  user_agent: string | null;
  failed_attempts: number;
}

describe('password_reset_tokens: 6-digit OTP (PostgreSQL)', () => {
  let db: TestDatabase;
  let database: Database;
  let uow: PgUnitOfWork;
  let tokens: PgPasswordResetTokenRepository;
  let sessions: PgSessionRepository;
  let accounts: UserAccountsPort;
  let clock: MutableClock;
  const keyedHasher = new HmacKeyedHasher('integration-test-hmac-secret-0123456789-abcdef');
  const passwordHasher = new Argon2PasswordHasher();

  beforeAll(async () => {
    db = await createTestDatabase(); // applies every migration, 0016 and 0017 included
    database = new Database(db.pool);
    uow = new PgUnitOfWork(database);
    tokens = new PgPasswordResetTokenRepository(database);
    sessions = new PgSessionRepository(database);
    accounts = createUserAccountsApi(new PgUserRepository(database));
  });
  afterAll(() => db.drop());

  const sql = async <R extends object = TokenRow>(text: string, values: unknown[] = []) =>
    (await db.pool.query(text, values)).rows as R[];
  const rowsOf = (userId: string) =>
    sql('SELECT * FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at', [userId]);

  const build = (settings: Parameters<typeof resolvePasswordResetSettings>[0] = {}) => {
    clock = new MutableClock();
    const notifier = new RecordingNotifier();
    const resolved = resolvePasswordResetSettings({ minResponseMs: 0, ...settings });
    return {
      notifier,
      resolved,
      request: new RequestPasswordResetUseCase({
        accounts,
        tokens,
        keyedHasher,
        notifier,
        uow,
        clock: clock.now,
        settings: resolved,
      }),
      reset: new ResetPasswordUseCase({
        accounts,
        sessions,
        tokens,
        keyedHasher,
        passwordHasher,
        uow,
        clock: clock.now,
        settings: resolved,
      }),
    };
  };
  const ask = async (h: ReturnType<typeof build>, email: string) => {
    const before = h.notifier.sent.length;
    await h.request.execute({ email }, { ip: '127.0.0.1', userAgent: 'vitest' });
    await flush();
    return h.notifier.sent.length > before ? h.notifier.last.otp : null;
  };
  const insertRow = async (
    userId: string,
    options: { createdAt?: Date; expiresAt?: Date; usedAt?: Date | null; failed?: number } = {},
  ) => {
    const createdAt = options.createdAt ?? new Date();
    const id = randomUUID();
    await db.pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, used_at, failed_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        `hash-${id}-0123456789`,
        createdAt,
        options.expiresAt ?? new Date(createdAt.getTime() + 5 * MINUTE),
        options.usedAt ?? null,
        options.failed ?? 0,
      ],
    );
    return id;
  };

  describe('schema (migrations 0016 + 0017)', () => {
    it('0017 is additive and idempotent, and 0016 is untouched by it', async () => {
      const sqlText = await readFile(
        path.join(MIGRATIONS_DIR, '0017_password_reset_otp_attempts.sql'),
        'utf8',
      );
      await db.pool.query(sqlText); // second application
      await db.pool.query(sqlText); // third
      const [col] = await sql<{ data_type: string; column_default: string; is_nullable: string }>(
        `SELECT data_type, column_default, is_nullable FROM information_schema.columns
          WHERE table_name = 'password_reset_tokens' AND column_name = 'failed_attempts'`,
      );
      expect(col).toMatchObject({ data_type: 'smallint', column_default: '0', is_nullable: 'NO' });
      const names = (
        await sql<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'password_reset_tokens'`,
        )
      ).map((c) => c.column_name);
      expect(names).not.toEqual(expect.arrayContaining(['otp', 'code', 'token']));
    });

    it('rejects negative or absurd attempt counters', async () => {
      const user = await seedUser(db.pool);
      await expect(insertRow(user.id, { failed: -1 })).rejects.toThrow(/failed_attempts_range/);
      await expect(insertRow(user.id, { failed: 101 })).rejects.toThrow(/failed_attempts_range/);
    });
  });

  describe('repository', () => {
    it('findActiveByUser returns the newest live row and skips used, expired and locked-out ones', async () => {
      const user = await seedUser(db.pool);
      const now = new Date();
      const old = await insertRow(user.id, { createdAt: new Date(now.getTime() - 3 * MINUTE) });
      await insertRow(user.id, { createdAt: new Date(now.getTime() - 2 * MINUTE), usedAt: now });
      await insertRow(user.id, { createdAt: new Date(now.getTime() - 1 * MINUTE), failed: 5 });
      await insertRow(user.id, {
        createdAt: new Date(now.getTime() - 6 * MINUTE),
        expiresAt: new Date(now.getTime() - 1),
      });
      expect((await tokens.findActiveByUser(user.id, now, 5))?.id).toBe(old);
      expect((await tokens.findActiveByUser(user.id, now, 5))?.failedAttempts).toBe(0);
      expect(await tokens.findActiveByUser(randomUUID(), now, 5)).toBeNull();
    });

    it('recordFailedAttempt is an atomic counter, exact under concurrency', async () => {
      const user = await seedUser(db.pool);
      const id = await insertRow(user.id);
      await Promise.all(Array.from({ length: 12 }, () => tokens.recordFailedAttempt(id)));
      expect((await rowsOf(user.id))[0]!.failed_attempts).toBe(12);
    });

    it('consumes once even under concurrent redemption, and never past the attempt cap or expiry', async () => {
      const user = await seedUser(db.pool);
      const id = await insertRow(user.id);
      const results = await Promise.all(Array.from({ length: 10 }, () => tokens.consume(id, new Date(), 5)));
      expect(results.filter(Boolean)).toHaveLength(1);

      const locked = await insertRow(user.id, { failed: 5 });
      expect(await tokens.consume(locked, new Date(), 5)).toBeNull();
      const now = new Date();
      const expiring = await insertRow(user.id, {
        createdAt: new Date(now.getTime() - MINUTE),
        expiresAt: now,
      });
      expect(await tokens.consume(expiring, now, 5)).toBeNull(); // valid strictly before expires_at
      expect(await tokens.consume(expiring, new Date(now.getTime() - 1), 5)).toEqual({ userId: user.id });
    });

    it('invalidates only the outstanding rows of that user, and purges old rows only', async () => {
      const a = await seedUser(db.pool);
      const b = await seedUser(db.pool);
      await insertRow(a.id);
      await insertRow(b.id);
      expect(await tokens.invalidateOutstanding(a.id, new Date())).toBe(1);
      expect((await rowsOf(b.id))[0]!.used_at).toBeNull();

      const day = 86_400_000;
      const old = new Date(Date.now() - 3 * day);
      await insertRow(b.id, { createdAt: old, expiresAt: new Date(old.getTime() + 5 * MINUTE) });
      const purged = await createAuthMaintenance(database).purgePasswordResetTokens(1);
      expect(purged).toBeGreaterThanOrEqual(1);
      expect((await rowsOf(b.id)).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('forgot password against PostgreSQL', () => {
    it('stores only a row-bound keyed digest, 5-minute expiry and client metadata', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      const otp = await ask(h, user.email);
      expect(otp).toMatch(/^\d{6}$/);
      const [row] = await rowsOf(user.id);
      expect(row!.token_hash).toBe(keyedHasher.digest(otpDigestInput(row!.id, otp!)));
      expect(Object.values(row!).map(String)).not.toContain(otp);
      expect(row!.expires_at.getTime() - row!.created_at.getTime()).toBe(5 * MINUTE);
      expect(row).toMatchObject({ request_ip: '127.0.0.1', user_agent: 'vitest', failed_attempts: 0 });
    });

    it('creates nothing for unknown or disabled accounts', async () => {
      const disabled = await seedUser(db.pool, { status: 'disabled' });
      const h = build();
      expect(await ask(h, disabled.email)).toBeNull();
      expect(await ask(h, 'ghost@example.test')).toBeNull();
      expect(await rowsOf(disabled.id)).toHaveLength(0);
    });

    it('enforces the 60 second cooldown, then supersedes the older OTP', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      const first = await ask(h, user.email);
      clock.advance(59 * SECOND);
      expect(await ask(h, user.email)).toBeNull();
      expect(await rowsOf(user.id)).toHaveLength(1);

      clock.advance(1 * SECOND);
      const second = await ask(h, user.email);
      expect(second).not.toBeNull();
      const rows = await rowsOf(user.id);
      expect(rows.map((r) => r.used_at !== null)).toEqual([true, false]);
      await expect(
        h.reset.execute({ email: user.email, otp: first!, newPassword: NEW_PASSWORD }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('lets exactly one of many simultaneous requests create an OTP (cooldown + advisory lock)', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      await Promise.all(
        Array.from({ length: 8 }, () =>
          h.request.execute({ email: user.email }, { ip: null, userAgent: null }),
        ),
      );
      await flush();
      expect(await rowsOf(user.id)).toHaveLength(1);
      expect(h.notifier.sent).toHaveLength(1);
    });
  });

  describe('reset password against PostgreSQL', () => {
    it('changes the password, redeems the OTP, supersedes the rest and revokes every session', async () => {
      const user = await seedUser(db.pool);
      const other = await seedUser(db.pool);
      const mk = async (userId: string) => {
        const id = randomUUID();
        await sessions.create({
          id,
          userId,
          refreshTokenHash: `rt-${id}`,
          expiresAt: new Date(Date.now() + 86_400_000),
          userAgent: null,
          ipAddress: null,
        });
        return id;
      };
      const [s1, s2, os] = [await mk(user.id), await mk(user.id), await mk(other.id)];
      const h = build();
      const otp = (await ask(h, user.email))!;
      await h.reset.execute({ email: user.email, otp, newPassword: NEW_PASSWORD });

      const creds = await accounts.findCredentialsByEmail(user.email);
      expect(await passwordHasher.verify(creds!.passwordHash, NEW_PASSWORD)).toBe(true);
      const rows = await rowsOf(user.id);
      expect(rows.every((r) => r.used_at !== null)).toBe(true);
      const state = await sql<{ id: string; revoked_at: Date | null; revoke_reason: string | null }>(
        'SELECT id, revoked_at, revoke_reason FROM auth_sessions WHERE id = ANY($1)',
        [[s1, s2, os]],
      );
      expect(
        state.filter((s) => s.id !== os).every((s) => s.revoked_at && s.revoke_reason === 'password_change'),
      ).toBe(true);
      expect(state.find((s) => s.id === os)!.revoked_at).toBeNull();
      await expect(
        h.reset.execute({ email: user.email, otp, newPassword: NEW_PASSWORD }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' }); // single use
    });

    it('counts wrong guesses durably (not rolled back) and locks the OTP at exactly 5, even under concurrency', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      const otp = (await ask(h, user.email))!;
      const guesses = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          h.reset.execute({ email: user.email, otp: wrongOtp(otp), newPassword: NEW_PASSWORD }),
        ),
      );
      expect(guesses.every((g) => g.status === 'rejected')).toBe(true);
      expect((await rowsOf(user.id))[0]!.failed_attempts).toBe(5); // never 6+: the lock serialises them
      await expect(
        h.reset.execute({ email: user.email, otp, newPassword: NEW_PASSWORD }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      const creds = await accounts.findCredentialsByEmail(user.email);
      expect(await passwordHasher.verify(creds!.passwordHash, user.password)).toBe(true); // unchanged
    });

    it('lets exactly one of several concurrent submissions of the correct OTP win', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      const otp = (await ask(h, user.email))!;
      const results = await Promise.allSettled(
        ['first concurrent passphrase', 'second concurrent passphrase', 'third concurrent passphrase'].map(
          (p) => h.reset.execute({ email: user.email, otp, newPassword: p }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('rolls back redemption if a later step fails: OTP unused, password untouched', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      const otp = (await ask(h, user.email))!;
      const failing = new PgSessionRepository(database);
      failing.revokeAllForUser = () => Promise.reject(new Error('session store down'));
      const reset = new ResetPasswordUseCase({
        accounts,
        sessions: failing,
        tokens,
        keyedHasher,
        passwordHasher,
        uow,
        clock: clock.now,
        settings: h.resolved,
      });
      await expect(reset.execute({ email: user.email, otp, newPassword: NEW_PASSWORD })).rejects.toThrow(
        'session store down',
      );
      expect((await rowsOf(user.id))[0]!.used_at).toBeNull();
      const creds = await accounts.findCredentialsByEmail(user.email);
      expect(await passwordHasher.verify(creds!.passwordHash, user.password)).toBe(true);
      await h.reset.execute({ email: user.email, otp, newPassword: NEW_PASSWORD }); // still redeemable
    });

    it('refuses a disabled account and an expired OTP with the same generic error', async () => {
      const user = await seedUser(db.pool);
      const h = build();
      const otp = (await ask(h, user.email))!;
      await db.pool.query(`UPDATE users SET status = 'disabled', disabled_at = now() WHERE id = $1`, [
        user.id,
      ]);
      await expect(
        h.reset.execute({ email: user.email, otp, newPassword: NEW_PASSWORD }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      const late = await seedUser(db.pool);
      const g = build();
      const lateOtp = (await ask(g, late.email))!;
      clock.advance(5 * MINUTE);
      await expect(
        g.reset.execute({ email: late.email, otp: lateOtp, newPassword: NEW_PASSWORD }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });
});

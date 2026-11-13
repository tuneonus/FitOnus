import type { RequestHandler } from 'express';
import { createApp } from '../../../../src/app.js';
import { loadConfig } from '../../../../src/config/env.js';
import type { Container } from '../../../../src/container.js';
import { RequestPasswordResetUseCase } from '../../../../src/modules/auth/application/use-cases/request-password-reset.js';
import { ResetPasswordUseCase } from '../../../../src/modules/auth/application/use-cases/reset-password.js';
import type { PasswordResetFailureEvent } from '../../../../src/modules/auth/application/ports.js';
import {
  resolvePasswordResetSettings,
  type PasswordResetSettings,
} from '../../../../src/modules/auth/domain/password-reset.js';
import { createAuthModule } from '../../../../src/modules/auth/index.js';
import { createLogger } from '../../../../src/shared/logging/logger.js';
import { HmacKeyedHasher } from '../../../../src/shared/security/hmac-keyed-hasher.js';
import {
  fakeAccounts,
  FakePasswordHasher,
  FakeUnitOfWork,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../../helpers/fakes.js';
import {
  InMemoryPasswordResetTokenRepository,
  MutableClock,
  RecordingNotifier,
} from './password-reset-fakes.js';

export const HMAC_SECRET = 'unit-test-hmac-secret-unit-test-hmac-secret-0123456789';
export const OLD_PASSWORD = 'the old correct password';
export const NEW_PASSWORD = 'a brand new passphrase';

export const NO_FLOOR: Partial<PasswordResetSettings> = { minResponseMs: 0 };

/** Real HMAC hasher (not the string-concatenating fake) so hash-only storage is tested for real. */
export function buildResetHarness(settings: Partial<PasswordResetSettings> = NO_FLOOR) {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const tokens = new InMemoryPasswordResetTokenRepository();
  const notifier = new RecordingNotifier();
  const clock = new MutableClock();
  const keyedHasher = new HmacKeyedHasher(HMAC_SECRET);
  const passwordHasher = new FakePasswordHasher();
  const accounts = fakeAccounts(users);
  const uow = new FakeUnitOfWork();
  const failures: PasswordResetFailureEvent[] = [];
  const delays: number[] = [];
  const resolved = resolvePasswordResetSettings({ minResponseMs: 0, ...settings });

  const request = new RequestPasswordResetUseCase({
    accounts,
    tokens,
    keyedHasher,
    notifier,
    uow,
    clock: clock.now,
    settings: resolved,
    onFailure: (event) => failures.push(event),
    delay: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
  });
  const reset = new ResetPasswordUseCase({
    accounts,
    sessions,
    tokens,
    keyedHasher,
    passwordHasher,
    uow,
    clock: clock.now,
    settings: resolved,
  });

  const meta = { ip: '203.0.113.7', userAgent: 'vitest' };
  const alice = users.add({ email: 'alice@example.org', passwordHash: `hashed:${OLD_PASSWORD}` });

  return {
    users,
    sessions,
    tokens,
    notifier,
    clock,
    keyedHasher,
    passwordHasher,
    accounts,
    uow,
    failures,
    delays,
    settings: resolved,
    request,
    reset,
    meta,
    alice,
    /** Requests a reset for `email` and returns the OTP the notifier received. */
    async requestOtp(email = 'alice@example.org'): Promise<string> {
      const before = notifier.sent.length;
      await request.execute({ email }, meta);
      await new Promise((resolve) => setImmediate(resolve));
      if (notifier.sent.length !== before + 1) throw new Error('expected exactly one new message');
      return notifier.last.otp;
    },
  };
}

export type ResetHarness = ReturnType<typeof buildResetHarness>;

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * The real createApp() pipeline around the real auth module, backed by in-memory fakes only.
 * `db` throws on any query: with no notifier configured the auth module must not touch it for reset.
 */
export function buildAuthHttpApp(
  options: {
    passwordReset?: Parameters<typeof createAuthModule>[0]['passwordReset'];
    clock?: () => Date;
  } = {},
) {
  const users = new InMemoryUserRepository();
  const accountsPort = fakeAccounts(users);
  const dbQueries: string[] = [];
  const db = {
    query: (text: string) => {
      dbQueries.push(text);
      return Promise.reject(new Error('unexpected database access'));
    },
  };
  const accountLookups: string[] = [];
  const accounts: typeof accountsPort = {
    ...accountsPort,
    findCredentialsByEmail: (email) => {
      accountLookups.push(email);
      return accountsPort.findCredentialsByEmail(email);
    },
  };

  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db',
    JWT_ACCESS_SECRET: 'test-secret-at-least-32-chars-long-0123456789',
    HMAC_SECRET,
    JWT_ISSUER: 'fitonus-test',
    JWT_AUDIENCE: 'fitonus-test-clients',
    CORS_ORIGINS: 'http://localhost:5173',
  });
  const auth = createAuthModule({
    basePath: '/api/v1/auth',
    db,
    uow: new FakeUnitOfWork(),
    passwordHasher: new FakePasswordHasher(),
    keyedHasher: new HmacKeyedHasher(HMAC_SECRET),
    accounts,
    config: config.auth,
    limiters: { login: passThrough, register: passThrough, refresh: passThrough, sensitive: passThrough },
    clock: options.clock,
    passwordReset: options.passwordReset,
  });
  const container: Container = {
    database: {} as Container['database'],
    routeGroups: [auth.routes],
    authenticate: passThrough,
    rateLimiters: { global: passThrough } as Container['rateLimiters'],
    lifecycle: { isShuttingDown: () => false, beginShutdown: () => undefined },
  };
  const app = createApp({ config, logger: createLogger({ level: 'silent', pretty: false }), container });
  return { app, users, auth, dbQueries, accountLookups };
}

import express, { type Express, type Request, type RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { createRateLimiters } from '../../../src/middleware/rate-limit.js';
import type { AdminRepository } from '../../../src/modules/admin/application/ports.js';
import { AdminLoginUseCase } from '../../../src/modules/admin/application/use-cases/admin-login.js';
import { createAdminController } from '../../../src/modules/admin/interface/admin.controller.js';
import {
  createAdminRoutes,
  type AdminRateLimiters,
} from '../../../src/modules/admin/interface/admin.routes.js';
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import {
  FakeAccessTokenService,
  fakeAccounts,
  FakeKeyedHasher,
  FakePasswordHasher,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';

/**
 * HTTP-level checks through the REAL admin router, request validation and error handler (no database).
 * The route is mounted exactly as production does, only the stores behind it are in-memory.
 */

const LOGIN_PATH = '/api/v1/admin/auth/login';
const ADMIN_PASSWORD = 'correct-admin-password-1';
const MEMBER_PASSWORD = 'correct-member-password-1';
const DISABLED_PASSWORD = 'correct-disabled-password-1';

const passThrough: RequestHandler = (_req, _res, next) => next();

function createHarness(limiters: Partial<AdminRateLimiters> = {}) {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const auditLogs: Array<{ adminId: string; action: string }> = [];

  const admin = users.add({
    email: 'admin@fitonus.com',
    displayName: 'Stored Admin Name',
    role: 'admin',
    passwordHash: `hashed:${ADMIN_PASSWORD}`,
  });
  users.add({
    email: 'disabled-admin@fitonus.com',
    role: 'admin',
    status: 'disabled',
    passwordHash: `hashed:${DISABLED_PASSWORD}`,
  });
  users.add({ email: 'member@fitonus.com', role: 'member', passwordHash: `hashed:${MEMBER_PASSWORD}` });

  const adminRepo = {
    recordAuditLog: (entry: { adminId: string; action: string }) => {
      auditLogs.push({ adminId: entry.adminId, action: entry.action });
      return Promise.resolve({ id: 'audit-1', ...entry });
    },
    getUserDetail: (id: string) => Promise.resolve({ user: { id, displayName: 'Chief Administrator' } }),
  } as unknown as AdminRepository;

  const issuer = new SessionIssuer({
    sessions,
    tokens: new FakeAccessTokenService(),
    keyedHasher: new FakeKeyedHasher(),
    refreshTokenTtlDays: 30,
    clock: () => new Date('2026-11-13T00:00:00Z'),
  });
  const login = new AdminLoginUseCase({
    accounts: fakeAccounts(users),
    passwordHasher: new FakePasswordHasher(),
    issuer,
    adminRepo,
  });
  const controller = createAdminController({ login, sessions: { logout: async () => {} } } as never, false);
  const routes = createAdminRoutes('/api/v1/admin', controller, {
    login: passThrough,
    sensitive: passThrough,
    ...limiters,
  });

  const app: Express = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(
    routes.basePath,
    buildRouter(routes.routes, {
      authenticate: () => {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      },
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, users, sessions, auditLogs, admin };
}

/** Response parts that must be byte-identical across failures (request ids / timestamps excluded). */
function observable(res: request.Response) {
  const body = res.body as { error?: { requestId?: unknown } };
  const { requestId: _requestId, ...error } = body.error ?? {};
  return {
    status: res.status,
    body: { ...body, error },
    contentType: res.headers['content-type'],
    setCookie: res.headers['set-cookie'],
    cacheControl: res.headers['cache-control'],
  };
}

const post = (app: Express, email: string, password: string, ip?: string) => {
  const req = request(app).post(LOGIN_PATH);
  if (ip) void req.set('X-Forwarded-For', ip);
  return req.send({ email, password });
};

const FAILURES = [
  { name: 'unknown e-mail', email: 'ghost@fitonus.com', password: 'whatever-1234' },
  { name: 'wrong password', email: 'admin@fitonus.com', password: 'not-the-password' },
  {
    name: 'disabled admin, right password',
    email: 'disabled-admin@fitonus.com',
    password: DISABLED_PASSWORD,
  },
  { name: 'member, right password', email: 'member@fitonus.com', password: MEMBER_PASSWORD },
  { name: 'member, wrong password', email: 'member@fitonus.com', password: 'not-the-password' },
  { name: 'disabled admin, wrong password', email: 'disabled-admin@fitonus.com', password: 'nope' },
];

describe('POST /admin/auth/login: uniform failures over HTTP', () => {
  it('answers every failure kind with the same 401 body and headers', async () => {
    const { app } = createHarness();
    const responses = await Promise.all(FAILURES.map((f) => post(app, f.email, f.password)));
    const views = responses.map(observable);

    expect(views[0]).toMatchObject({
      status: 401,
      body: { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
      setCookie: undefined,
    });
    for (const view of views) expect(view).toEqual(views[0]);
    // And nothing in the payload hints at the real reason.
    expect(JSON.stringify(views)).not.toMatch(/disabled|forbidden|privilege|administrator|member/i);
  });

  it('treats e-mail case and whitespace like the member login (normalised, not a distinct outcome)', async () => {
    const { app } = createHarness();
    const ok = await post(app, '  ADMIN@FitOnus.com ', ADMIN_PASSWORD);
    expect(ok.status).toBe(200);

    const unknownPlain = observable(await post(app, 'ghost@fitonus.com', 'x-1234567'));
    const unknownMessy = observable(await post(app, '  GHOST@FitOnus.com  ', 'x-1234567'));
    expect(unknownMessy).toEqual(unknownPlain);
  });

  it('issues no session cookie, token or audit entry for any failure', async () => {
    const { app, sessions, auditLogs } = createHarness();
    for (const f of FAILURES) {
      const res = await post(app, f.email, f.password);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);
    }
    expect(sessions.sessions.size).toBe(0);
    expect(auditLogs).toHaveLength(0);
  });

  it('still signs a valid active admin in with the unchanged response contract', async () => {
    const { app, sessions, auditLogs, admin } = createHarness();
    const res = await post(app, 'admin@fitonus.com', ADMIN_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Signed in',
      data: {
        tokenType: 'Bearer',
        user: { id: admin.id, email: 'admin@fitonus.com', displayName: 'Chief Administrator', role: 'admin' },
      },
    });
    expect(Object.keys(res.body.data as object).sort()).toEqual([
      'accessToken',
      'accessTokenExpiresAt',
      'refreshToken',
      'refreshTokenExpiresAt',
      'tokenType',
      'user',
    ]);
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
    expect(cookie).toContain('fitonus_admin_token=');
    expect(cookie).toContain('HttpOnly');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(sessions.sessions.size).toBe(1);
    expect(auditLogs).toEqual([{ adminId: admin.id, action: 'admin.login' }]);
  });

  it('rejects malformed input with the standard validation envelope, never echoing the password', async () => {
    const { app } = createHarness();
    const res = await request(app).post(LOGIN_PATH).send({ email: 'not-an-email', password: 'secret-1234' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('secret-1234');
  });
});

describe('POST /admin/auth/login: rate limiting behaviour', () => {
  const RATE_CONFIG = { windowMs: 60_000, max: 10_000, authMax: 3 };

  it('the shared ip+e-mail limiter answers existing and unknown e-mails identically', async () => {
    const limiters = createRateLimiters(RATE_CONFIG);
    const { app } = createHarness({ login: limiters.login });

    const run = async (email: string, password: string) => {
      const statuses: number[] = [];
      let last: request.Response | undefined;
      for (let i = 0; i < RATE_CONFIG.authMax + 2; i += 1) {
        last = await post(app, email, password, '198.51.100.7');
        statuses.push(last.status);
      }
      return { statuses, last: observable(last!) };
    };

    const existing = await run('admin@fitonus.com', 'not-the-password');
    const unknown = await run('ghost@fitonus.com', 'not-the-password');

    expect(existing.statuses).toEqual([401, 401, 401, 429, 429]);
    expect(unknown.statuses).toEqual(existing.statuses);
    expect(unknown.last.body).toEqual(existing.last.body);
    expect(existing.last.body.error).toMatchObject({ code: 'RATE_LIMITED' });
  });

  /**
   * Reference implementation of the recommended `src/middleware/rate-limit.ts` additions (see the agent
   * report, DEFERRED SHARED CHANGES). Kept here so the admin route hooks are proven against them.
   */
  const recommendedGuards = (authMax: number) => {
    const base = {
      windowMs: 60_000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: ((_req, _res, next) =>
        next(
          new AppError('rate_limited', 'RATE_LIMITED', 'Too many requests. Try again later.'),
        )) as RequestHandler,
    } as const;
    const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');
    const bodyEmail = (req: Request) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
    };
    return {
      adminLoginByIp: rateLimit({
        ...base,
        limit: authMax * 3,
        skipSuccessfulRequests: true,
        keyGenerator: clientIp,
      }),
      adminLoginByAccount: rateLimit({
        ...base,
        limit: authMax * 5,
        skipSuccessfulRequests: true,
        keyGenerator: bodyEmail,
      }),
    };
  };

  it('without the extra guards one client can rotate e-mails indefinitely (documents the current gap)', async () => {
    const limiters = createRateLimiters(RATE_CONFIG);
    const { app } = createHarness({ login: limiters.login });
    const statuses: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      statuses.push((await post(app, `rotating-${i}@fitonus.com`, 'guess-1234', '198.51.100.8')).status);
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
  });

  it('a per-IP guard caps e-mail rotation from one client, identically for existing and unknown e-mails', async () => {
    const limiters = createRateLimiters(RATE_CONFIG);
    const guards = recommendedGuards(RATE_CONFIG.authMax); // 9 failures / window / IP
    const { app } = createHarness({ login: limiters.login, ...guards });

    const statuses: number[] = [];
    let last: request.Response | undefined;
    for (let i = 0; i < 12; i += 1) {
      const email = i === 3 ? 'admin@fitonus.com' : `rotating-${i}@fitonus.com`;
      last = await post(app, email, 'guess-1234', '198.51.100.9');
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 9).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(9)).toEqual([429, 429, 429]);
    expect(observable(last!).body.error).toMatchObject({ code: 'RATE_LIMITED' });

    // A different client is unaffected.
    expect((await post(app, 'admin@fitonus.com', ADMIN_PASSWORD, '198.51.100.10')).status).toBe(200);
  });

  it('a per-account guard slows guessing spread over many IPs, and successful sign-ins do not consume it', async () => {
    const limiters = createRateLimiters({ ...RATE_CONFIG, authMax: 3 });
    const guards = recommendedGuards(RATE_CONFIG.authMax); // 15 failures / window / account
    const { app } = createHarness({ login: limiters.login, ...guards });

    // Successful logins from many places never count against the account budget.
    for (let i = 0; i < 20; i += 1) {
      expect((await post(app, 'admin@fitonus.com', ADMIN_PASSWORD, `192.0.2.${i + 1}`)).status).toBe(200);
    }

    const statuses: number[] = [];
    for (let i = 0; i < 17; i += 1) {
      statuses.push((await post(app, 'admin@fitonus.com', 'guess-1234', `203.0.113.${i + 1}`)).status);
    }
    expect(statuses.slice(0, 15).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(15)).toEqual([429, 429]);

    // The unknown-account budget behaves the same way (no existence signal from the limiter).
    const unknown: number[] = [];
    for (let i = 0; i < 17; i += 1) {
      unknown.push((await post(app, 'ghost@fitonus.com', 'guess-1234', `203.0.113.${i + 1}`)).status);
    }
    expect(unknown).toEqual(statuses);
  });
});

import type { RequestHandler } from 'express';
import { describe, expect, it } from 'vitest';
import { STATUS_BY_KIND } from '../../../src/middleware/error-handler.js';
import type {
  AdminAuditLogView,
  AdminRepository,
  AdminUserActivityView,
  AdminUserDetailView,
  AdminUserListItemView,
  ListAdminUsersQuery,
  ListAuditLogsQuery,
} from '../../../src/modules/admin/application/ports.js';
import {
  AdminLoginUseCase,
  getAdminLoginRejection,
  type AdminLoginRejectionReason,
} from '../../../src/modules/admin/application/use-cases/admin-login.js';
import type { AdminAuditLog } from '../../../src/modules/admin/domain/admin-audit-log.js';
import type { DashboardStats } from '../../../src/modules/admin/domain/dashboard-stats.js';
import {
  createAdminController,
  type AdminController,
} from '../../../src/modules/admin/interface/admin.controller.js';
import { createAdminRoutes } from '../../../src/modules/admin/interface/admin.routes.js';
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import type { UserAccountsPort } from '../../../src/modules/auth/index.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import type { PaginationMeta } from '../../../src/shared/pagination/pagination.js';
import {
  FakeAccessTokenService,
  fakeAccounts,
  FakeKeyedHasher,
  FakePasswordHasher,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';

type Credentials = NonNullable<Awaited<ReturnType<UserAccountsPort['findCredentialsByEmail']>>>;

const CLIENT_META = { ip: '203.0.113.9', userAgent: 'vitest-admin-login' };
const ADMIN_PASSWORD = 'correct-admin-password-1';
const MEMBER_PASSWORD = 'correct-member-password-1';
const DISABLED_PASSWORD = 'correct-disabled-password-1';
const GENERIC_MESSAGE = 'Invalid email or password.';

/** Records every hash/verify call and, through `events`, where they sit relative to other reads. */
class SpyHasher extends FakePasswordHasher {
  readonly hashCalls: string[] = [];
  readonly verifyCalls: Array<{ hash: string; plain: string }> = [];

  constructor(protected readonly events: string[]) {
    super();
  }

  override hash(plain: string): Promise<string> {
    this.hashCalls.push(plain);
    this.events.push('hash');
    return super.hash(plain);
  }

  override verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls.push({ hash, plain });
    this.events.push('verify');
    return super.verify(hash, plain);
  }
}

class FlakyHasher extends SpyHasher {
  override hash(plain: string): Promise<string> {
    if (this.hashCalls.length === 0) {
      this.hashCalls.push(plain);
      return Promise.reject(new Error('hasher unavailable'));
    }
    return super.hash(plain);
  }
}

class RecordingAdminRepository implements AdminRepository {
  readonly auditLogs: AdminAuditLog[] = [];
  readonly detailLookups: string[] = [];

  recordAuditLog(entry: {
    adminId: string;
    action: AdminAuditLog['action'];
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AdminAuditLog> {
    const log: AdminAuditLog = {
      id: `audit-${this.auditLogs.length + 1}`,
      adminId: entry.adminId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      details: entry.details ?? {},
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: new Date('2026-11-13T00:00:00Z'),
    };
    this.auditLogs.push(log);
    return Promise.resolve(log);
  }

  getUserDetail(id: string): Promise<AdminUserDetailView | null> {
    this.detailLookups.push(id);
    return Promise.resolve({
      user: { id, displayName: 'Chief Administrator' },
    } as unknown as AdminUserDetailView);
  }

  getDashboardStats(): Promise<DashboardStats> {
    throw new Error('not used');
  }
  listUsers(_q: ListAdminUsersQuery): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }> {
    throw new Error('not used');
  }
  getUserActivity(_id: string): Promise<AdminUserActivityView> {
    throw new Error('not used');
  }
  listAuditLogs(_q: ListAuditLogsQuery): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }> {
    throw new Error('not used');
  }
}

/** Wraps credentials so reads of `status` / `role` show up in the shared event log. */
const instrument = (creds: Credentials | null, events: string[]): Credentials | null =>
  creds && {
    id: creds.id,
    email: creds.email,
    passwordHash: creds.passwordHash,
    get status() {
      events.push('read:status');
      return creds.status;
    },
    get role() {
      events.push('read:role');
      return creds.role;
    },
  };

function build(options: { hasher?: (events: string[]) => SpyHasher } = {}) {
  const events: string[] = [];
  const hasher = options.hasher ? options.hasher(events) : new SpyHasher(events);
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const adminRepo = new RecordingAdminRepository();

  const admin = users.add({
    email: 'admin@fitonus.com',
    displayName: 'Stored Admin Name',
    role: 'admin',
    passwordHash: `hashed:${ADMIN_PASSWORD}`,
  });
  const disabledAdmin = users.add({
    email: 'disabled-admin@fitonus.com',
    role: 'admin',
    status: 'disabled',
    passwordHash: `hashed:${DISABLED_PASSWORD}`,
  });
  const member = users.add({
    email: 'member@fitonus.com',
    role: 'member',
    passwordHash: `hashed:${MEMBER_PASSWORD}`,
  });

  const base = fakeAccounts(users);
  const accounts: UserAccountsPort = {
    ...base,
    findCredentialsByEmail: async (email) => {
      events.push('lookup');
      return instrument(await base.findCredentialsByEmail(email), events);
    },
  };

  const issuer = new SessionIssuer({
    sessions,
    tokens: new FakeAccessTokenService(),
    keyedHasher: new FakeKeyedHasher(),
    refreshTokenTtlDays: 30,
    clock: () => new Date('2026-11-13T00:00:00Z'),
  });

  const useCase = new AdminLoginUseCase({ accounts, passwordHasher: hasher, issuer, adminRepo });
  return { events, hasher, users, sessions, adminRepo, useCase, admin, disabledAdmin, member };
}

interface Scenario {
  name: string;
  email: string;
  password: string;
  reason: AdminLoginRejectionReason;
  account?: 'admin' | 'disabledAdmin' | 'member';
}

const FAILURE_SCENARIOS: Scenario[] = [
  {
    name: 'unknown e-mail',
    email: 'ghost@fitonus.com',
    password: 'whatever-1234',
    reason: 'unknown_account',
  },
  {
    name: 'active admin with a wrong password',
    email: 'admin@fitonus.com',
    password: 'not-the-password',
    reason: 'invalid_password',
    account: 'admin',
  },
  {
    name: 'disabled admin with the CORRECT password',
    email: 'disabled-admin@fitonus.com',
    password: DISABLED_PASSWORD,
    reason: 'account_disabled',
    account: 'disabledAdmin',
  },
  {
    name: 'disabled admin with a wrong password',
    email: 'disabled-admin@fitonus.com',
    password: 'not-the-password',
    reason: 'invalid_password',
    account: 'disabledAdmin',
  },
  {
    name: 'member (non-admin) with the CORRECT password',
    email: 'member@fitonus.com',
    password: MEMBER_PASSWORD,
    reason: 'not_admin',
    account: 'member',
  },
  {
    name: 'member (non-admin) with a wrong password',
    email: 'member@fitonus.com',
    password: 'not-the-password',
    reason: 'invalid_password',
    account: 'member',
  },
];

async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

const publicView = (error: unknown) => {
  expect(error).toBeInstanceOf(AppError);
  const appError = error as AppError;
  return {
    status: STATUS_BY_KIND[appError.kind],
    kind: appError.kind,
    code: appError.code,
    message: appError.message,
    details: appError.details,
  };
};

describe('admin login: uniform authentication failures', () => {
  it('returns the identical 401 INVALID_CREDENTIALS for every kind of failure', async () => {
    const views = new Set<string>();
    for (const scenario of FAILURE_SCENARIOS) {
      const { useCase } = build();
      const error = await capture(() =>
        useCase.execute({ email: scenario.email, password: scenario.password }, CLIENT_META),
      );
      const view = publicView(error);
      expect(view, scenario.name).toEqual({
        status: 401,
        kind: 'unauthorized',
        code: 'INVALID_CREDENTIALS',
        message: GENERIC_MESSAGE,
        details: undefined,
      });
      views.add(JSON.stringify(view));
    }
    expect(views.size).toBe(1);
  });

  it('never reveals the real reason to the client, only to server-side logging via the error cause', async () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const { useCase, admin, disabledAdmin, member } = build();
      const error = await capture(() =>
        useCase.execute({ email: scenario.email, password: scenario.password }, CLIENT_META),
      );
      const rejection = getAdminLoginRejection(error);
      expect(rejection?.reason, scenario.name).toBe(scenario.reason);
      const expectedId = scenario.account ? { admin, disabledAdmin, member }[scenario.account].id : null;
      expect(rejection?.accountId, scenario.name).toBe(expectedId);

      // Nothing client-visible (what the error handler serialises) mentions the cause.
      const appError = error as AppError;
      const serialisable = JSON.stringify({
        kind: appError.kind,
        code: appError.code,
        message: appError.message,
        details: appError.details,
      });
      expect(serialisable).not.toMatch(/unknown_account|invalid_password|account_disabled|not_admin/);
      expect(serialisable).not.toContain(scenario.email);
      expect(serialisable).not.toContain(scenario.password);
    }
    expect(getAdminLoginRejection(new Error('database down'))).toBeUndefined();
    expect(getAdminLoginRejection(new AppError('unauthorized', 'INVALID_CREDENTIALS', 'x'))).toBeUndefined();
  });

  it('treats e-mail case and surrounding whitespace the same for every failure kind', async () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const { useCase } = build();
      const plain = publicView(
        await capture(() =>
          useCase.execute({ email: scenario.email, password: scenario.password }, CLIENT_META),
        ),
      );
      const messy = publicView(
        await capture(() =>
          useCase.execute(
            { email: `   ${scenario.email.toUpperCase()}  `, password: scenario.password },
            CLIENT_META,
          ),
        ),
      );
      expect(messy, scenario.name).toEqual(plain);
    }
  });
});

describe('admin login: exactly one password verification, before status and role', () => {
  it('verifies the password exactly once on every path, success included', async () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const { useCase, hasher } = build();
      await capture(() =>
        useCase.execute({ email: scenario.email, password: scenario.password }, CLIENT_META),
      );
      expect(hasher.verifyCalls, scenario.name).toHaveLength(1);
      expect(hasher.verifyCalls[0]?.plain).toBe(scenario.password);
    }

    const { useCase, hasher } = build();
    await useCase.execute({ email: 'admin@fitonus.com', password: ADMIN_PASSWORD }, CLIENT_META);
    expect(hasher.verifyCalls).toHaveLength(1);
  });

  it('verifies against a dummy hash from the SAME hasher when the account does not exist', async () => {
    const { useCase, hasher, users } = build();
    expect(hasher.hashCalls).toHaveLength(0); // lazy: nothing hashed at construction

    await capture(() => useCase.execute({ email: 'ghost@fitonus.com', password: 'guess-1234' }, CLIENT_META));

    expect(hasher.hashCalls).toHaveLength(1);
    expect(hasher.verifyCalls).toHaveLength(1);
    const dummy = hasher.verifyCalls[0]!.hash;
    expect(dummy).toBe(`hashed:${hasher.hashCalls[0]}`); // produced by PasswordHasher.hash
    expect([...users.users.values()].map((u) => u.passwordHash)).not.toContain(dummy); // not a real hash
  });

  it('creates the dummy hash once and reuses it, and never creates it for existing accounts', async () => {
    const { useCase, hasher } = build();

    // Existing accounts of every kind: no dummy needed.
    for (const scenario of FAILURE_SCENARIOS.filter((s) => s.account)) {
      await capture(() =>
        useCase.execute({ email: scenario.email, password: scenario.password }, CLIENT_META),
      );
    }
    expect(hasher.hashCalls).toHaveLength(0);

    await capture(() =>
      useCase.execute({ email: 'ghost-1@fitonus.com', password: 'guess-1234' }, CLIENT_META),
    );
    await capture(() =>
      useCase.execute({ email: 'ghost-2@fitonus.com', password: 'guess-1234' }, CLIENT_META),
    );
    expect(hasher.hashCalls).toHaveLength(1);
    const unknownVerifies = hasher.verifyCalls.slice(-2);
    expect(unknownVerifies[0]?.hash).toBe(unknownVerifies[1]?.hash);
  });

  it('shares a single dummy hash between concurrent first requests', async () => {
    const { useCase, hasher } = build();
    const results = await Promise.allSettled([
      useCase.execute({ email: 'ghost-1@fitonus.com', password: 'guess-1234' }, CLIENT_META),
      useCase.execute({ email: 'ghost-2@fitonus.com', password: 'guess-1234' }, CLIENT_META),
      useCase.execute({ email: 'ghost-3@fitonus.com', password: 'guess-1234' }, CLIENT_META),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(hasher.hashCalls).toHaveLength(1);
    expect(hasher.verifyCalls).toHaveLength(3);
  });

  it('does not cache a failed dummy hash: the next unknown-account login recovers', async () => {
    const { useCase, hasher } = build({ hasher: (events) => new FlakyHasher(events) });

    await expect(
      useCase.execute({ email: 'ghost@fitonus.com', password: 'guess-1234' }, CLIENT_META),
    ).rejects.toThrow('hasher unavailable');

    const error = await capture(() =>
      useCase.execute({ email: 'ghost@fitonus.com', password: 'guess-1234' }, CLIENT_META),
    );
    expect(publicView(error).code).toBe('INVALID_CREDENTIALS');
    expect(hasher.hashCalls).toHaveLength(2);
  });

  it('runs the verification BEFORE status and role are inspected', async () => {
    const memberCorrect = build();
    await capture(() =>
      memberCorrect.useCase.execute({ email: 'member@fitonus.com', password: MEMBER_PASSWORD }, CLIENT_META),
    );
    // Member with the right password: lookup, verify, status, role (in that order).
    expect(memberCorrect.events).toEqual(['lookup', 'verify', 'read:status', 'read:role']);

    const disabledCorrect = build();
    await capture(() =>
      disabledCorrect.useCase.execute(
        { email: 'disabled-admin@fitonus.com', password: DISABLED_PASSWORD },
        CLIENT_META,
      ),
    );
    expect(disabledCorrect.events).toEqual(['lookup', 'verify', 'read:status']);

    const unknown = build();
    await capture(() =>
      unknown.useCase.execute({ email: 'ghost@fitonus.com', password: 'guess-1234' }, CLIENT_META),
    );
    expect(unknown.events).toEqual(['lookup', 'hash', 'verify']);
  });

  it('does not even look at status or role when the password is wrong', async () => {
    for (const email of ['admin@fitonus.com', 'disabled-admin@fitonus.com', 'member@fitonus.com']) {
      const { useCase, events } = build();
      await capture(() => useCase.execute({ email, password: 'not-the-password' }, CLIENT_META));
      expect(events, email).toEqual(['lookup', 'verify']);
    }
  });
});

describe('admin login: no session or audit side effects on failure', () => {
  it('issues no session and writes no audit entry or user lookup for any failure', async () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const { useCase, sessions, adminRepo } = build();
      await capture(() =>
        useCase.execute({ email: scenario.email, password: scenario.password }, CLIENT_META),
      );
      expect(sessions.sessions.size, scenario.name).toBe(0);
      expect(adminRepo.auditLogs, scenario.name).toHaveLength(0); // no fabricated admin id either
      expect(adminRepo.detailLookups, scenario.name).toHaveLength(0);
    }
  });

  it('never issues a session for a non-admin whose password is right', async () => {
    const { useCase, sessions, member } = build();
    await capture(() =>
      useCase.execute({ email: 'member@fitonus.com', password: MEMBER_PASSWORD }, CLIENT_META),
    );
    expect([...sessions.sessions.values()].filter((s) => s.userId === member.id)).toHaveLength(0);
  });

  it('never issues a session for a disabled admin whose password is right', async () => {
    const { useCase, sessions, disabledAdmin } = build();
    await capture(() =>
      useCase.execute({ email: 'disabled-admin@fitonus.com', password: DISABLED_PASSWORD }, CLIENT_META),
    );
    expect([...sessions.sessions.values()].filter((s) => s.userId === disabledAdmin.id)).toHaveLength(0);
  });
});

describe('admin login: valid admin sign-in is unchanged', () => {
  it('returns the same result shape, issues one session and writes the admin.login audit entry', async () => {
    const { useCase, sessions, adminRepo, admin } = build();
    const result = await useCase.execute(
      { email: 'admin@fitonus.com', password: ADMIN_PASSWORD },
      CLIENT_META,
    );

    expect(Object.keys(result).sort()).toEqual(['tokens', 'user']);
    expect(Object.keys(result.tokens).sort()).toEqual([
      'accessToken',
      'accessTokenExpiresAt',
      'refreshToken',
      'refreshTokenExpiresAt',
      'sessionId',
    ]);
    expect(result.user).toEqual({
      id: admin.id,
      email: 'admin@fitonus.com',
      displayName: 'Chief Administrator', // taken from getUserDetail, as before
      role: 'admin',
    });

    expect(sessions.sessions.size).toBe(1);
    expect([...sessions.sessions.values()][0]).toMatchObject({
      userId: admin.id,
      ipAddress: CLIENT_META.ip,
      userAgent: CLIENT_META.userAgent,
    });

    expect(adminRepo.auditLogs).toHaveLength(1);
    expect(adminRepo.auditLogs[0]).toMatchObject({
      adminId: admin.id,
      action: 'admin.login',
      targetUserId: admin.id,
      details: { role: 'admin' },
      ipAddress: CLIENT_META.ip,
      userAgent: CLIENT_META.userAgent,
    });
    expect(adminRepo.detailLookups).toEqual([admin.id]);
  });

  it('falls back to "Administrator" when no profile detail exists, and accepts a messy e-mail', async () => {
    const { useCase, adminRepo } = build();
    adminRepo.getUserDetail = () => Promise.resolve(null);
    const result = await useCase.execute(
      { email: '  Admin@FitOnus.COM ', password: ADMIN_PASSWORD },
      CLIENT_META,
    );
    expect(result.user.displayName).toBe('Administrator');
    expect(result.user.email).toBe('admin@fitonus.com');
  });

  it('does not create the dummy hash on a successful sign-in', async () => {
    const { useCase, hasher } = build();
    await useCase.execute({ email: 'admin@fitonus.com', password: ADMIN_PASSWORD }, CLIENT_META);
    expect(hasher.hashCalls).toHaveLength(0);
  });
});

describe('admin login controller: internal rejection logging', () => {
  const controllerFor = (useCase: AdminLoginUseCase) =>
    createAdminController({ login: useCase, sessions: { logout: async () => {} } } as never, false);

  const requestFor = (email: string, password: string, log?: { warn: (...args: unknown[]) => void }) =>
    ({
      validated: { body: { email, password } },
      headers: {},
      get: () => 'vitest',
      ip: CLIENT_META.ip,
      ...(log ? { log } : {}),
    }) as never;

  it('logs only the reason and account id (never e-mail, password or tokens) and rethrows the uniform error', async () => {
    for (const scenario of FAILURE_SCENARIOS) {
      const { useCase, admin, disabledAdmin, member } = build();
      const warnings: unknown[][] = [];
      const controller = controllerFor(useCase);

      const error = await capture(() =>
        controller.login(
          requestFor(scenario.email, scenario.password, { warn: (...args) => warnings.push(args) }),
        ),
      );
      expect(publicView(error).code).toBe('INVALID_CREDENTIALS');

      expect(warnings, scenario.name).toHaveLength(1);
      const [fields, message] = warnings[0]!;
      const id = scenario.account ? { admin, disabledAdmin, member }[scenario.account].id : null;
      expect(fields).toEqual({ event: 'admin_login_rejected', reason: scenario.reason, accountId: id });
      const logged = JSON.stringify(warnings[0]);
      expect(logged).not.toContain(scenario.email);
      expect(logged).not.toContain(scenario.password);
      expect(message).toBe('Admin sign-in rejected');
    }
  });

  it('works without a request logger and does not log infrastructure failures as rejections', async () => {
    const { useCase } = build();
    const controller = controllerFor(useCase);
    const error = await capture(() => controller.login(requestFor('ghost@fitonus.com', 'guess-1234')));
    expect(publicView(error).code).toBe('INVALID_CREDENTIALS');

    const warnings: unknown[][] = [];
    const broken = new AdminLoginUseCase({
      accounts: {
        ...fakeAccounts(new InMemoryUserRepository()),
        findCredentialsByEmail: () => Promise.reject(new Error('database down')),
      },
      passwordHasher: new FakePasswordHasher(),
      issuer: {} as never,
      adminRepo: new RecordingAdminRepository(),
    });
    await expect(
      controllerFor(broken).login(
        requestFor('admin@fitonus.com', 'x', { warn: (...args) => warnings.push(args) }),
      ),
    ).rejects.toThrow('database down');
    expect(warnings).toHaveLength(0);
  });
});

describe('admin login route', () => {
  const marker = (name: string): RequestHandler =>
    Object.assign((() => undefined) as never, { marker: name });
  const controller = { login: () => Promise.resolve({ data: {} }) } as unknown as AdminController;
  const loginRoute = (limiters: Parameters<typeof createAdminRoutes>[2]) =>
    createAdminRoutes('/api/v1/admin', controller, limiters).routes.find(
      (route) => route.method === 'post' && route.path === '/auth/login',
    );

  it('is unchanged (only the shared login limiter) when no extra guards are supplied', () => {
    const login = marker('login');
    expect(loginRoute({ login, sensitive: marker('sensitive') })?.middleware).toEqual([login]);
  });

  it('runs the optional per-IP and per-account guards before the shared limiter', () => {
    const login = marker('login');
    const adminLoginByIp = marker('ip');
    const adminLoginByAccount = marker('account');
    const route = loginRoute({ login, sensitive: marker('sensitive'), adminLoginByIp, adminLoginByAccount });
    expect(route?.middleware).toEqual([adminLoginByIp, adminLoginByAccount, login]);
  });

  it('documents only 401/429 as login failures: 403 is no longer a distinguishable outcome', () => {
    const route = loginRoute({ login: marker('login'), sensitive: marker('sensitive') });
    expect(route?.errorStatuses).toEqual([401, 429]);
    expect(route?.access).toEqual({ kind: 'public' });
  });
});

import { describe, expect, it } from 'vitest';
import { AdminLoginUseCase } from '../../../src/modules/admin/application/use-cases/admin-login.js';
import { createAdminController } from '../../../src/modules/admin/interface/admin.controller.js';
import { createAuthenticate } from '../../../src/middleware/authenticate.js';
import type {
  AdminAuditLogView,
  AdminRepository,
  AdminUserActivityView,
  AdminUserDetailView,
  AdminUserListItemView,
  ListAdminUsersQuery,
  ListAuditLogsQuery,
} from '../../../src/modules/admin/application/ports.js';
import type { AdminAuditLog } from '../../../src/modules/admin/domain/admin-audit-log.js';
import type { DashboardStats } from '../../../src/modules/admin/domain/dashboard-stats.js';
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { STATUS_BY_KIND } from '../../../src/middleware/error-handler.js';
import type { PaginationMeta } from '../../../src/shared/pagination/pagination.js';
import { Argon2PasswordHasher } from '../../../src/shared/security/argon2-password-hasher.js';
import {
  FakeAccessTokenService,
  fakeAccounts,
  FakeKeyedHasher,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../../helpers/fakes.js';

class MockAdminRepository implements AdminRepository {
  readonly auditLogs: AdminAuditLog[] = [];

  recordAuditLog(entry: {
    adminId: string;
    action: any;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AdminAuditLog> {
    const log: AdminAuditLog = {
      id: 'mock-audit-id',
      adminId: entry.adminId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      details: entry.details ?? {},
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: new Date(),
    };
    this.auditLogs.push(log);
    return Promise.resolve(log);
  }

  getUserDetail(id: string): Promise<AdminUserDetailView | null> {
    return Promise.resolve({
      user: {
        id,
        email: 'admin@fitonus.com',
        displayName: 'Administrator',
        role: 'admin',
        status: 'active',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        disabledAt: null,
      },
      stats: { totalWorkouts: 0, totalMealsLogged: 0, streakDays: 0 },
    } as unknown as AdminUserDetailView);
  }

  getDashboardStats(): Promise<DashboardStats> {
    throw new Error('Not implemented in mock');
  }
  listUsers(_query: ListAdminUsersQuery): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }> {
    throw new Error('Not implemented in mock');
  }
  getUserActivity(_userId: string): Promise<AdminUserActivityView> {
    throw new Error('Not implemented in mock');
  }
  listAuditLogs(_query: ListAuditLogsQuery): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }> {
    throw new Error('Not implemented in mock');
  }
}

describe('Admin Login Authentication & RBAC Isolation', () => {
  const passwordHasher = new Argon2PasswordHasher();
  const sessions = new InMemorySessionRepository();
  const tokens = new FakeAccessTokenService();
  const keyedHasher = new FakeKeyedHasher();
  const issuer = new SessionIssuer({
    sessions,
    tokens,
    keyedHasher,
    refreshTokenTtlDays: 30,
    clock: () => new Date(),
  });

  const clientMeta = { ip: '127.0.0.1', userAgent: 'FitOnus-Admin-Portal/1.0' };

  it('1. successfully authenticates valid admin with Argon2id and returns Bearer tokens', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const testAdminPassword = 'TestAdminPassword123!';
    const hash = await passwordHasher.hash(testAdminPassword);

    const adminUser = users.add({
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'Administrator',
      role: 'admin',
      status: 'active',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const useCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    const result = await useCase.execute(
      { email: 'admin@fitonus.com', password: testAdminPassword },
      clientMeta,
    );

    expect(result.user.id).toBe(adminUser.id);
    expect(result.user.email).toBe('admin@fitonus.com');
    expect(result.user.role).toBe('admin');
    expect(result.tokens.accessToken).toBeDefined();
    expect(result.tokens.refreshToken).toBeDefined();

    // Verify audit log
    expect(adminRepo.auditLogs).toHaveLength(1);
    expect(adminRepo.auditLogs[0]?.action).toBe('admin.login');
    expect(adminRepo.auditLogs[0]?.adminId).toBe(adminUser.id);
  });

  it('2. returns 401 INVALID_CREDENTIALS when password does not match', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const hash = await passwordHasher.hash('CorrectPassword123!');

    users.add({
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'Administrator',
      role: 'admin',
      status: 'active',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const useCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    let error: any;
    try {
      await useCase.execute(
        { email: 'admin@fitonus.com', password: 'WrongPasswordEnteredByClient!' },
        clientMeta,
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(STATUS_BY_KIND[error.kind as keyof typeof STATUS_BY_KIND]).toBe(401);
    expect(error.message).toBe('Invalid email or password.');
    expect(adminRepo.auditLogs).toHaveLength(0);
  });

  it('3. returns 401 INVALID_CREDENTIALS when admin email does not exist', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const accounts = fakeAccounts(users);

    const useCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    let error: any;
    try {
      await useCase.execute(
        { email: 'nonexistent-admin@fitonus.com', password: 'AnyPassword123!' },
        clientMeta,
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(STATUS_BY_KIND[error.kind as keyof typeof STATUS_BY_KIND]).toBe(401);
    expect(adminRepo.auditLogs).toHaveLength(0);
  });

  it('4. returns 403 FORBIDDEN when user exists but has member role', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const hash = await passwordHasher.hash('MemberPassword123!');

    users.add({
      id: 'user-uuid-1',
      email: 'regular-user@fitonus.com',
      displayName: 'Regular Member',
      role: 'member',
      status: 'active',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const useCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    let error: any;
    try {
      await useCase.execute(
        { email: 'regular-user@fitonus.com', password: 'MemberPassword123!' },
        clientMeta,
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('FORBIDDEN');
    expect(STATUS_BY_KIND[error.kind as keyof typeof STATUS_BY_KIND]).toBe(403);
    expect(error.message).toContain('Administrator privileges are required');
    expect(adminRepo.auditLogs).toHaveLength(0);
  });

  it('5. returns 403 ACCOUNT_DISABLED when admin account is disabled', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const hash = await passwordHasher.hash('AdminPassword123!');

    users.add({
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'Disabled Admin',
      role: 'admin',
      status: 'disabled',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const useCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    let error: any;
    try {
      await useCase.execute(
        { email: 'admin@fitonus.com', password: 'AdminPassword123!' },
        clientMeta,
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('ACCOUNT_DISABLED');
    expect(STATUS_BY_KIND[error.kind as keyof typeof STATUS_BY_KIND]).toBe(403);
    expect(adminRepo.auditLogs).toHaveLength(0);
  });

  it('6. normalizes email casing (e.g. Admin@fitonus.com) correctly during login', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const testPassword = 'CasingTestPass123!';
    const hash = await passwordHasher.hash(testPassword);

    users.add({
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'Administrator',
      role: 'admin',
      status: 'active',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const useCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    const result = await useCase.execute(
      { email: '   Admin@FitOnus.COM  ', password: testPassword },
      clientMeta,
    );

    expect(result.user.email).toBe('admin@fitonus.com');
    expect(result.user.role).toBe('admin');
  });

  it('7. controller sets SameSite=None; Secure; Partitioned cookie when isProduction is true', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const testPassword = 'ProdCookiePass123!';
    const hash = await passwordHasher.hash(testPassword);

    users.add({
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'Administrator',
      role: 'admin',
      status: 'active',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const loginUseCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    const mockUseCases = {
      login: loginUseCase,
      sessions: {
        logout: async () => {},
      },
    } as any;

    const prodController = createAdminController(mockUseCases, true);
    const req = {
      validated: {
        body: { email: 'admin@fitonus.com', password: testPassword },
      },
      headers: {},
      get: (header: string) => (header.toLowerCase() === 'user-agent' ? 'vitest' : undefined),
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    const res = await prodController.login(req);
    expect(res.headers).toBeDefined();
    const setCookie = (res.headers as Record<string, string>)['Set-Cookie'];
    expect(setCookie).toContain('SameSite=None');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Partitioned');
  });

  it('8. controller sets SameSite=Lax cookie without Secure when isProduction is false', async () => {
    const users = new InMemoryUserRepository();
    const adminRepo = new MockAdminRepository();
    const testPassword = 'DevCookiePass123!';
    const hash = await passwordHasher.hash(testPassword);

    users.add({
      id: 'ae1c758b-e47d-4053-ab70-4114c2bfab79',
      email: 'admin@fitonus.com',
      displayName: 'Administrator',
      role: 'admin',
      status: 'active',
      passwordHash: hash,
    });

    const accounts = fakeAccounts(users);
    const loginUseCase = new AdminLoginUseCase({
      accounts,
      passwordHasher,
      issuer,
      adminRepo,
    });

    const mockUseCases = {
      login: loginUseCase,
      sessions: {
        logout: async () => {},
      },
    } as any;

    const devController = createAdminController(mockUseCases, false);
    const req = {
      validated: {
        body: { email: 'admin@fitonus.com', password: testPassword },
      },
      headers: {},
      get: (header: string) => (header.toLowerCase() === 'user-agent' ? 'vitest' : undefined),
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    const res = await devController.login(req);
    expect(res.headers).toBeDefined();
    const setCookie = (res.headers as Record<string, string>)['Set-Cookie'];
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).not.toContain('Partitioned');
  });

  it('9. authenticate middleware extracts token from Authorization: Bearer header', async () => {
    const mockActor = { userId: 'admin-123', permissions: new Set(['*']) };
    const auth = createAuthenticate(async (token) => {
      if (token === 'valid_bearer_token') return mockActor as any;
      throw new Error('invalid token');
    });

    const req: any = {
      headers: {
        authorization: 'Bearer valid_bearer_token',
      },
    };
    let nextCalled = false;
    await auth(req, {} as any, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.actor).toEqual(mockActor);
  });

  it('10. authenticate middleware extracts token from fitonus_admin_token cookie fallback', async () => {
    const mockActor = { userId: 'admin-123', permissions: new Set(['*']) };
    const auth = createAuthenticate(async (token) => {
      if (token === 'valid_cookie_token') return mockActor as any;
      throw new Error('invalid token');
    });

    const req: any = {
      headers: {
        cookie: 'other=foo; fitonus_admin_token=valid_cookie_token; bar=baz',
      },
    };
    let nextCalled = false;
    await auth(req, {} as any, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.actor).toEqual(mockActor);
  });

  it('11. authenticate middleware rejects with 401 when neither bearer token nor cookie is provided', async () => {
    const auth = createAuthenticate(async () => {
      throw new Error('should not be called');
    });

    const req: any = { headers: {} };
    let capturedError: any = null;
    try {
      await auth(req, {} as any, () => {});
    } catch (err) {
      capturedError = err;
    }

    expect(capturedError).toBeInstanceOf(AppError);
    expect(capturedError.code).toBe('UNAUTHENTICATED');
    expect(STATUS_BY_KIND[capturedError.kind as keyof typeof STATUS_BY_KIND]).toBe(401);
  });

  it('12. admin controller endpoints attach strict no-cache headers to prevent stale browser/CDN caching', async () => {
    const mockUseCases = {
      listUsers: {
        execute: async () => ({
          items: [{ id: 'user-1', email: 'user@fitonus.com' }],
          meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
      },
      getAdminUser: {
        execute: async () => ({
          user: { id: 'admin-1', email: 'admin@fitonus.com', displayName: 'Admin' },
        }),
      },
      getDashboardStats: {
        execute: async () => ({
          totalUsers: 9,
          activeUsers: 9,
          disabledUsers: 0,
          recentUsers: [],
        }),
      },
    } as any;

    const controller = createAdminController(mockUseCases, true);
    const mockReq = {
      validated: { query: { page: 1, limit: 10 } },
      actor: { userId: 'admin-1', permissions: new Set(['*']) },
    } as any;

    const listRes = await controller.listUsers(mockReq);
    expect(listRes.headers?.['Cache-Control']).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(listRes.headers?.['Pragma']).toBe('no-cache');
    expect(listRes.headers?.['Expires']).toBe('0');

    const meRes = await controller.getMe(mockReq);
    expect(meRes.headers?.['Cache-Control']).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');

    const statsRes = await controller.getDashboardStats(mockReq);
    expect(statsRes.headers?.['Cache-Control']).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
  });
});

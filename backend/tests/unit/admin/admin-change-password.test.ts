import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminChangePasswordUseCase } from '../../../src/modules/admin/application/use-cases/admin-change-password.js';
import type {
  AdminAuditLogView,
  AdminRepository,
  AdminUserDetailView,
  AdminUserListItemView,
  ListAdminUsersQuery,
  ListAuditLogsQuery,
} from '../../../src/modules/admin/application/ports.js';
import type { AdminAuditLog, AuditAction } from '../../../src/modules/admin/domain/admin-audit-log.js';
import type { DashboardStats } from '../../../src/modules/admin/domain/dashboard-stats.js';
import {
  adminChangePasswordRequest,
  adminChangePasswordResponseSchema,
} from '../../../src/modules/admin/interface/admin.schemas.js';
import { createAdminRoutes, type AdminRateLimiters } from '../../../src/modules/admin/interface/admin.routes.js';
import type { AdminController } from '../../../src/modules/admin/interface/admin.controller.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import type { PaginationMeta } from '../../../src/shared/pagination/pagination.js';
import {
  FakePasswordHasher,
  InMemorySessionRepository,
  InMemoryUserRepository,
  fakeAccounts,
} from '../../helpers/fakes.js';

class InMemoryAdminRepository implements AdminRepository {
  readonly auditLogs: AdminAuditLog[] = [];

  getDashboardStats(): Promise<DashboardStats> {
    throw new Error('Not implemented');
  }

  listUsers(_query: ListAdminUsersQuery): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }> {
    throw new Error('Not implemented');
  }

  getUserDetail(_id: string): Promise<AdminUserDetailView | null> {
    throw new Error('Not implemented');
  }

  recordAuditLog(log: {
    adminId: string;
    action: AuditAction;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AdminAuditLog> {
    const record: AdminAuditLog = {
      id: randomUUID(),
      adminId: log.adminId,
      action: log.action,
      targetUserId: log.targetUserId ?? null,
      details: log.details ?? {},
      ipAddress: log.ipAddress ?? null,
      userAgent: log.userAgent ?? null,
      createdAt: new Date(),
    };
    this.auditLogs.unshift(record);
    return Promise.resolve(record);
  }

  listAuditLogs(_query: ListAuditLogsQuery): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }> {
    return Promise.resolve({
      items: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  }
}

describe('Admin Backend Security & Password Management — Phase 10.2B', () => {
  let passwordHasher: FakePasswordHasher;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let adminRepo: InMemoryAdminRepository;
  let useCase: AdminChangePasswordUseCase;

  const adminId = randomUUID();
  const currentSessionId = randomUUID();
  const otherSessionId = randomUUID();
  const initialPassword = 'InitialAdminPassword123!';

  beforeEach(async () => {
    passwordHasher = new FakePasswordHasher();
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    adminRepo = new InMemoryAdminRepository();

    // Seed admin account
    const initialHash = await passwordHasher.hash(initialPassword);
    userRepo.add({
      id: adminId,
      email: 'admin.sec@fitonus.com',
      displayName: 'SecOps Administrator',
      passwordHash: initialHash,
      role: 'admin',
    });

    // Seed active sessions
    await sessionRepo.create({
      id: currentSessionId,
      userId: adminId,
      refreshTokenHash: 'hash-current',
      expiresAt: new Date(Date.now() + 86400000),
      userAgent: 'Admin-Browser-1',
      ipAddress: '10.0.0.1',
    });

    await sessionRepo.create({
      id: otherSessionId,
      userId: adminId,
      refreshTokenHash: 'hash-other',
      expiresAt: new Date(Date.now() + 86400000),
      userAgent: 'Admin-Browser-2',
      ipAddress: '10.0.0.2',
    });

    useCase = new AdminChangePasswordUseCase({
      accounts: fakeAccounts(userRepo),
      sessions: sessionRepo,
      passwordHasher,
      adminRepo,
    });
  });

  // 1. Successful password change
  it('1. successfully changes password, updates hash, revokes other sessions, and logs audit event', async () => {
    const actor = createActor({ userId: adminId, sessionId: currentSessionId, role: 'admin' });
    const newPassword = 'NewVerySecureAdminPassword2026!';

    const result = await useCase.execute(
      actor,
      { currentPassword: initialPassword, newPassword },
      { ip: '192.168.1.100', userAgent: 'FitOnusAdmin/1.0' },
    );

    // Verify revoked sessions count
    expect(result.revokedSessions).toBe(1);

    // Verify other session was revoked
    const otherSession = await sessionRepo.findById(otherSessionId);
    expect(otherSession?.revokedAt).not.toBeNull();
    expect(otherSession?.revokeReason).toBe('password_change');

    // Verify current session remains active
    const currentSession = await sessionRepo.findById(currentSessionId);
    expect(currentSession?.revokedAt).toBeNull();

    // Verify updated password hash in accounts
    const creds = await fakeAccounts(userRepo).findCredentialsById(adminId);
    const matchesNew = await passwordHasher.verify(creds!.passwordHash, newPassword);
    expect(matchesNew).toBe(true);

    // Verify audit log
    expect(adminRepo.auditLogs).toHaveLength(1);
    const log = adminRepo.auditLogs[0]!;
    expect(log.action).toBe('admin.password_change');
    expect(log.adminId).toBe(adminId);
    expect(log.targetUserId).toBe(adminId);
    expect(log.ipAddress).toBe('192.168.1.100');
    expect(log.userAgent).toBe('FitOnusAdmin/1.0');
    expect(log.details).toEqual({ revokedOtherSessions: 1 });

    // CRITICAL: Ensure passwords are NEVER logged in audit event
    const logJson = JSON.stringify(log);
    expect(logJson.includes(initialPassword)).toBe(false);
    expect(logJson.includes(newPassword)).toBe(false);
  });

  // 2. Incorrect current password
  it('2. rejects request with 422 INVALID_CREDENTIALS when current password does not match', async () => {
    const actor = createActor({ userId: adminId, sessionId: currentSessionId, role: 'admin' });

    await expect(
      useCase.execute(actor, {
        currentPassword: 'WrongPassword999!',
        newPassword: 'BrandNewAdminPassword123!',
      }),
    ).rejects.toThrow(AppError);

    try {
      await useCase.execute(actor, {
        currentPassword: 'WrongPassword999!',
        newPassword: 'BrandNewAdminPassword123!',
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.kind).toBe('unprocessable');
      expect(appErr.code).toBe('INVALID_CREDENTIALS');
    }

    // Password must remain untouched
    const creds = await fakeAccounts(userRepo).findCredentialsById(adminId);
    const matchesOld = await passwordHasher.verify(creds!.passwordHash, initialPassword);
    expect(matchesOld).toBe(true);

    // No audit log recorded for rejected attempt
    expect(adminRepo.auditLogs).toHaveLength(0);
  });

  // 3. Unauthenticated request / missing account
  it('3. rejects request with SESSION_REVOKED if account does not exist in database', async () => {
    const nonexistentActor = createActor({
      userId: randomUUID(),
      sessionId: currentSessionId,
      role: 'admin',
    });

    await expect(
      useCase.execute(nonexistentActor, {
        currentPassword: initialPassword,
        newPassword: 'BrandNewAdminPassword123!',
      }),
    ).rejects.toThrow(AppError);

    try {
      await useCase.execute(nonexistentActor, {
        currentPassword: initialPassword,
        newPassword: 'BrandNewAdminPassword123!',
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.kind).toBe('unauthorized');
      expect(appErr.code).toBe('SESSION_REVOKED');
    }
  });

  // 4. Non-admin request
  it('4. rejects request with FORBIDDEN if actor lacks admin:access or account is not admin', async () => {
    const memberActor = createActor({ userId: adminId, sessionId: currentSessionId, role: 'member' });

    await expect(
      useCase.execute(memberActor, {
        currentPassword: initialPassword,
        newPassword: 'BrandNewAdminPassword123!',
      }),
    ).rejects.toThrow(AppError);

    try {
      await useCase.execute(memberActor, {
        currentPassword: initialPassword,
        newPassword: 'BrandNewAdminPassword123!',
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.kind).toBe('forbidden');
      expect(appErr.code).toBe('FORBIDDEN');
    }
  });

  // 5. Disabled administrator account
  it('5. rejects request with ACCOUNT_DISABLED if administrator account is disabled', async () => {
    await userRepo.changeStatus(adminId, 1, 'disabled');
    const actor = createActor({ userId: adminId, sessionId: currentSessionId, role: 'admin' });

    await expect(
      useCase.execute(actor, {
        currentPassword: initialPassword,
        newPassword: 'BrandNewAdminPassword123!',
      }),
    ).rejects.toThrow(AppError);

    try {
      await useCase.execute(actor, {
        currentPassword: initialPassword,
        newPassword: 'BrandNewAdminPassword123!',
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.kind).toBe('forbidden');
      expect(appErr.code).toBe('ACCOUNT_DISABLED');
    }
  });

  // 6. Weak password (< 12 characters)
  it('6. rejects weak password violating 12-character policy with PASSWORD_POLICY_VIOLATION', async () => {
    const actor = createActor({ userId: adminId, sessionId: currentSessionId, role: 'admin' });

    await expect(
      useCase.execute(actor, {
        currentPassword: initialPassword,
        newPassword: 'ShortPass1!', // only 11 chars
      }),
    ).rejects.toThrow(AppError);

    try {
      await useCase.execute(actor, {
        currentPassword: initialPassword,
        newPassword: 'ShortPass1!',
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.kind).toBe('validation');
      expect(appErr.code).toBe('PASSWORD_POLICY_VIOLATION');
    }
  });

  // 7. Same password rejection
  it('7. rejects new password identical to current password with PASSWORD_POLICY_VIOLATION', async () => {
    const actor = createActor({ userId: adminId, sessionId: currentSessionId, role: 'admin' });

    await expect(
      useCase.execute(actor, {
        currentPassword: initialPassword,
        newPassword: initialPassword,
      }),
    ).rejects.toThrow(AppError);

    try {
      await useCase.execute(actor, {
        currentPassword: initialPassword,
        newPassword: initialPassword,
      });
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('PASSWORD_POLICY_VIOLATION');
      expect(appErr.message).toBe('The new password must differ from the current one.');
    }
  });

  // 8. Request validation schema
  it('8. schema validates body correctly: rejects missing fields, short passwords, and extra fields', () => {
    // Valid payload
    const valid = adminChangePasswordRequest.body.safeParse({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123456!',
    });
    expect(valid.success).toBe(true);

    // Missing currentPassword
    const missingCurrent = adminChangePasswordRequest.body.safeParse({
      newPassword: 'NewPassword123456!',
    });
    expect(missingCurrent.success).toBe(false);

    // Too short newPassword (< 12 chars)
    const shortNew = adminChangePasswordRequest.body.safeParse({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'Short1!',
    });
    expect(shortNew.success).toBe(false);

    // Extra unknown field (strictObject rejection)
    const extraField = adminChangePasswordRequest.body.safeParse({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123456!',
      unauthorizedField: 'malicious',
    });
    expect(extraField.success).toBe(false);

    // Response schema validation
    const responseParsed = adminChangePasswordResponseSchema.safeParse({
      message: 'Password changed successfully',
      revokedSessions: 2,
    });
    expect(responseParsed.success).toBe(true);
  });

  // 9. Route registration & rate limiting middleware
  it('9. registers POST /auth/change-password with admin:access permission and sensitive rate limiter', () => {
    const mockController = {
      login: () => Promise.resolve({ data: {} }),
      getMe: () => Promise.resolve({ data: {} }),
      logout: () => Promise.resolve({ data: {} }),
      getDashboardStats: () => Promise.resolve({ data: {} }),
      listUsers: () => Promise.resolve({ data: {} }),
      getUser: () => Promise.resolve({ data: {} }),
      changeUserStatus: () => Promise.resolve({ data: {} }),
      listAuditLogs: () => Promise.resolve({ data: {} }),
      changePassword: () => Promise.resolve({ data: {} }),
    } as unknown as AdminController;

    const dummyHandler: RequestHandler = (_req, _res, next) => next();
    const mockLimiters: AdminRateLimiters = {
      login: dummyHandler,
      sensitive: dummyHandler,
    };

    const routeGroup = createAdminRoutes('/api/v1/admin', mockController, mockLimiters);
    const changePasswordRoute = routeGroup.routes.find(
      (r) => r.method === 'post' && r.path === '/auth/change-password',
    );

    expect(changePasswordRoute).toBeDefined();
    expect(changePasswordRoute?.access).toEqual({ kind: 'permission', permission: 'admin:access' });
    expect(changePasswordRoute?.middleware).toContain(mockLimiters.sensitive);
    expect(changePasswordRoute?.errorStatuses).toContain(422);
    expect(changePasswordRoute?.errorStatuses).toContain(429);
  });
});

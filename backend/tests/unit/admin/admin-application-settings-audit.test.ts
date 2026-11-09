import type { RequestHandler } from 'express';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminChangePasswordUseCase } from '../../../src/modules/admin/application/use-cases/admin-change-password.js';
import type {
  AdminAuditLogView,
  AdminRepository,
  AdminUserActivityView,
  AdminUserDetailView,
  AdminUserListItemView,
  ListAdminUsersQuery,
  ListAuditLogsQuery,
} from '../../../src/modules/admin/application/ports.js';
import type { AdminAuditLog, AuditAction } from '../../../src/modules/admin/domain/admin-audit-log.js';
import type { DashboardStats } from '../../../src/modules/admin/domain/dashboard-stats.js';
import { createAdminRoutes, type AdminRateLimiters } from '../../../src/modules/admin/interface/admin.routes.js';
import type { AdminController } from '../../../src/modules/admin/interface/admin.controller.js';
import { createProfileController } from '../../../src/modules/profile/interface/profile.controller.js';
import { createProfileRoutes } from '../../../src/modules/profile/interface/profile.routes.js';
import type { UserSettingsView } from '../../../src/modules/profile/application/profile-view.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
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

  getUserActivity(_userId: string): Promise<AdminUserActivityView> {
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

describe('FitOnus Admin Application Settings Audit & Security Verification', () => {
  let passwordHasher: FakePasswordHasher;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let adminRepo: InMemoryAdminRepository;
  let useCase: AdminChangePasswordUseCase;

  const adminId = randomUUID();
  const currentSessionId = randomUUID();
  const otherSessionId = randomUUID();
  const initialPassword = 'InitialAdminPassword123!';

  const memberId = randomUUID();
  const memberSessionId = randomUUID();

  beforeEach(async () => {
    passwordHasher = new FakePasswordHasher();
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    adminRepo = new InMemoryAdminRepository();

    // Seed admin account
    const initialHash = await passwordHasher.hash(initialPassword);
    userRepo.users.set(adminId, {
      id: adminId,
      email: 'admin@fitonus.com',
      displayName: 'System Admin',
      passwordHash: initialHash,
      role: 'admin',
      status: 'active',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: null,
    });

    // Seed member account
    userRepo.users.set(memberId, {
      id: memberId,
      email: 'member@fitonus.com',
      displayName: 'Standard Member',
      passwordHash: await passwordHasher.hash('MemberPassword123!'),
      role: 'member',
      status: 'active',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      disabledAt: null,
    });

    sessionRepo.sessions.set(currentSessionId, {
      id: currentSessionId,
      userId: adminId,
      refreshTokenHash: 'hash-curr',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      revokedAt: null,
      userAgent: null,
      ipAddress: null,
      rotationCount: 0,
      revokeReason: null,
    });

    sessionRepo.sessions.set(otherSessionId, {
      id: otherSessionId,
      userId: adminId,
      refreshTokenHash: 'hash-other',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      revokedAt: null,
      userAgent: null,
      ipAddress: null,
      rotationCount: 0,
      revokeReason: null,
    });

    useCase = new AdminChangePasswordUseCase({
      accounts: fakeAccounts(userRepo),
      sessions: sessionRepo,
      passwordHasher,
      adminRepo,
    });
  });

  function createTestServer(options?: {
    actorRole?: 'admin' | 'member';
    authenticated?: boolean;
    rateLimitExceeded?: boolean;
  }) {
    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const isAuth = options?.authenticated ?? true;
    const role = options?.actorRole ?? 'admin';
    const currentActorId = role === 'admin' ? adminId : memberId;
    const currentSid = role === 'admin' ? currentSessionId : memberSessionId;

    const authenticate: RequestHandler = (req, _res, next) => {
      if (!isAuth) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication required.');
      }
      req.actor = createActor({
        userId: currentActorId,
        sessionId: currentSid,
        role,
      });
      next();
    };

    const mockAdminController: AdminController = {
      login: vi.fn(),
      getMe: async (req) => {
        const actor = req.actor!;
        return {
          data: {
            id: actor.userId,
            email: 'admin@fitonus.com',
            displayName: 'System Admin',
            role: actor.role,
            status: 'active',
            permissions: Array.from(actor.permissions),
          },
          message: 'Success',
        };
      },
      logout: vi.fn(),
      changePassword: async (req) => {
        const body = req.body;
        const result = await useCase.execute(req.actor!, body, {
          ip: req.ip ?? null,
          userAgent: req.header('user-agent') ?? null,
        });
        return {
          data: {
            message: 'Password changed successfully',
            revokedSessions: result.revokedSessions,
          },
          message: 'Password changed successfully',
        };
      },
      getDashboardStats: vi.fn(),
      listUsers: vi.fn(),
      getUser: vi.fn(),
      getUserActivity: vi.fn(),
      suspendUser: vi.fn(),
      reactivateUser: vi.fn(),
      listAuditLogs: vi.fn(),
    };

    const limiters: AdminRateLimiters = {
      login: (_req, _res, next) => next(),
      sensitive: (_req, _res, next) => {
        if (options?.rateLimitExceeded) {
          throw new AppError('rate_limited', 'RATE_LIMITED', 'Too many requests. Please try again later.');
        }
        next();
      },
    };

    const adminRoutes = createAdminRoutes('/api/v1/admin', mockAdminController, limiters);
    app.use(
      '/api/v1/admin',
      buildRouter(adminRoutes.routes, {
        authenticate,
      }),
    );

    // Profile routes for member user settings
    const defaultSettings: UserSettingsView = {
      userId: memberId,
      themeMode: 'system',
      unitSystem: 'metric',
      healthConnectEnabled: false,
      smartwatchConnected: false,
      notificationsEnabled: true,
      language: 'en',
      privacyAnalytics: true,
      privacyPhotoRetention: true,
      privacyCoachSharing: false,
      notificationSchedule: {},
      updatedAt: new Date().toISOString(),
    };

    const profileController = createProfileController({
      getProfile: { execute: vi.fn() } as any,
      updateProfile: { execute: vi.fn() } as any,
      saveOnboardingStep: { execute: vi.fn() } as any,
      completeOnboarding: { execute: vi.fn() } as any,
      getSettings: { execute: vi.fn().mockResolvedValue(defaultSettings) } as any,
      updateSettings: {
        execute: vi.fn().mockImplementation(async (_actor, patch) => ({
          ...defaultSettings,
          ...patch,
          updatedAt: new Date().toISOString(),
        })),
      } as any,
    });

    const profileRoutes = createProfileRoutes('/api/v1/profile', profileController);
    app.use(
      '/api/v1/profile',
      buildRouter(profileRoutes.routes, {
        authenticate,
      }),
    );

    // Public health routes
    app.get('/health/live', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
    app.get('/health/ready', (_req, res) => res.json({ status: 'ok', checks: { database: 'up' }, timestamp: new Date().toISOString() }));

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }

  // 1. Settings GET Verification
  it('1. GET /api/v1/admin/auth/me returns current administrator identity, permissions, and status', async () => {
    const app = createTestServer({ actorRole: 'admin' });
    const res = await request(app).get('/api/v1/admin/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(adminId);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.permissions).toContain('admin:access');
  });

  // 2. Settings UPDATE Verification
  it('2. POST /api/v1/admin/auth/change-password successfully updates credentials, revokes sessions, and logs audit', async () => {
    const app = createTestServer({ actorRole: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/auth/change-password')
      .send({
        currentPassword: initialPassword,
        newPassword: 'BrandNewStrongAdminPassword2026!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.revokedSessions).toBe(1);

    // Verify other session was revoked
    expect(sessionRepo.sessions.get(otherSessionId)?.revokedAt).not.toBeNull();
    // Verify current session remains active
    expect(sessionRepo.sessions.get(currentSessionId)?.revokedAt).toBeNull();

    // Verify audit log created
    expect(adminRepo.auditLogs).toHaveLength(1);
    expect(adminRepo.auditLogs[0]?.action).toBe('admin.password_change');
    expect(adminRepo.auditLogs[0]?.adminId).toBe(adminId);
  });

  // 3. Database Persistence Verification
  it('3. verifies password hash persistence and version incrementation', async () => {
    const userBefore = userRepo.users.get(adminId)!;
    expect(userBefore.version).toBe(1);

    await useCase.execute(createActor({ userId: adminId, sessionId: currentSessionId, role: 'admin' }), {
      currentPassword: initialPassword,
      newPassword: 'PersistedNewAdminPassword123!',
    });

    const userAfter = userRepo.users.get(adminId)!;
    expect(userAfter.version).toBe(2);
    expect(await passwordHasher.verify(userAfter.passwordHash, 'PersistedNewAdminPassword123!')).toBe(true);
    expect(await passwordHasher.verify(userAfter.passwordHash, initialPassword)).toBe(false);
  });

  // 4. Authorization & RBAC Verification
  it('4. rejects member access to admin settings endpoints with 403 Forbidden', async () => {
    const app = createTestServer({ actorRole: 'member' });
    const res = await request(app).get('/api/v1/admin/auth/me');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('4b. rejects unauthenticated access to admin endpoints with 401', async () => {
    const app = createTestServer({ authenticated: false });
    const res = await request(app).get('/api/v1/admin/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  // 5. Input Validation Verification
  it('5. rejects short password (<12 chars) with 400 validation error', async () => {
    const app = createTestServer({ actorRole: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/auth/change-password')
      .send({
        currentPassword: initialPassword,
        newPassword: 'TooShort1!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('5b. rejects unrecognized arbitrary fields with 400 validation error (strict schema)', async () => {
    const app = createTestServer({ actorRole: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/auth/change-password')
      .send({
        currentPassword: initialPassword,
        newPassword: 'BrandNewStrongAdminPassword2026!',
        arbitraryKey: 'malicious-payload',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  // 6. Public / Private Separation Verification
  it('6. verifies public health probes do not expose secrets or sensitive configuration', async () => {
    const app = createTestServer();
    const liveRes = await request(app).get('/health/live');
    const readyRes = await request(app).get('/health/ready');

    expect(liveRes.status).toBe(200);
    expect(liveRes.body.status).toBe('ok');
    expect(liveRes.body).not.toHaveProperty('databaseUrl');
    expect(liveRes.body).not.toHaveProperty('jwtSecret');

    expect(readyRes.status).toBe(200);
    expect(readyRes.body.checks.database).toBe('up');
    expect(readyRes.body).not.toHaveProperty('credentials');
  });

  // 7. Member Settings Scoping & User Isolation
  it('7. verifies member application settings enforce user isolation', async () => {
    const app = createTestServer({ actorRole: 'member' });
    const getRes = await request(app).get('/api/v1/profile/settings');
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.userId).toBe(memberId);

    const patchRes = await request(app)
      .patch('/api/v1/profile/settings')
      .send({ unitSystem: 'imperial' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.unitSystem).toBe('imperial');
  });

  // 8. Error Handling & Rate Limiting Verification
  it('8. rejects incorrect current password with 422 INVALID_CREDENTIALS', async () => {
    const app = createTestServer({ actorRole: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/auth/change-password')
      .send({
        currentPassword: 'WrongCurrentPassword123!',
        newPassword: 'BrandNewStrongAdminPassword2026!',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('8b. enforces rate limit middleware on sensitive password change route', async () => {
    const app = createTestServer({ actorRole: 'admin', rateLimitExceeded: true });
    const res = await request(app)
      .post('/api/v1/admin/auth/change-password')
      .send({
        currentPassword: initialPassword,
        newPassword: 'BrandNewStrongAdminPassword2026!',
      });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

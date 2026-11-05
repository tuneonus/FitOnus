import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminLoginUseCase } from '../../../src/modules/admin/application/use-cases/admin-login.js';
import { AdminChangeUserStatusUseCase } from '../../../src/modules/admin/application/use-cases/change-user-status.js';
import { GetAdminUserUseCase } from '../../../src/modules/admin/application/use-cases/get-admin-user.js';
import { GetDashboardStatsUseCase } from '../../../src/modules/admin/application/use-cases/get-dashboard-stats.js';
import { ListAdminUsersUseCase } from '../../../src/modules/admin/application/use-cases/list-admin-users.js';
import { ListAuditLogsUseCase } from '../../../src/modules/admin/application/use-cases/list-audit-logs.js';
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
import { SessionIssuer } from '../../../src/modules/auth/application/session-issuer.js';
import { createActor } from '../../../src/shared/auth/actor.js';
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

class InMemoryAdminRepository implements AdminRepository {
  readonly auditLogs: AdminAuditLog[] = [];
  dashboardStats: DashboardStats = {
    totalUsers: 10,
    activeUsers: 9,
    disabledUsers: 1,
    activeUsers7d: 5,
    activeUsers30d: 8,
    completedOnboarding: 7,
    pendingOnboarding: 3,
    newRegistrations7d: 3,
    newRegistrations30d: 8,
    recentUsers: [],
    registrationTrend: [{ date: '2026-11-05', count: 3 }],
  };

  usersList: AdminUserListItemView[] = [];
  userDetails = new Map<string, AdminUserDetailView>();

  getDashboardStats(): Promise<DashboardStats> {
    return Promise.resolve(this.dashboardStats);
  }

  listUsers(query: ListAdminUsersQuery): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }> {
    return Promise.resolve({
      items: this.usersList,
      meta: { page: query.page, limit: query.limit, total: this.usersList.length, totalPages: 1 },
    });
  }

  getUserDetail(id: string): Promise<AdminUserDetailView | null> {
    return Promise.resolve(this.userDetails.get(id) ?? null);
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

  listAuditLogs(query: ListAuditLogsQuery): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }> {
    const views: AdminAuditLogView[] = this.auditLogs.map((l) => ({
      id: l.id,
      adminId: l.adminId,
      adminEmail: 'admin@fitonus.com',
      adminName: 'System Admin',
      action: l.action,
      targetUserId: l.targetUserId,
      targetUserEmail: null,
      details: l.details,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt.toISOString(),
    }));
    return Promise.resolve({
      items: views,
      meta: { page: query.page, limit: query.limit, total: views.length, totalPages: 1 },
    });
  }
}

describe('Admin Module Use Cases', () => {
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionRepository;
  let adminRepo: InMemoryAdminRepository;
  let passwordHasher: FakePasswordHasher;
  let issuer: SessionIssuer;

  const clock = () => new Date('2026-11-05T06:00:00Z');
  const clientMeta = { ip: '192.168.1.1', userAgent: 'Chrome/120' };

  beforeEach(() => {
    users = new InMemoryUserRepository();
    sessions = new InMemorySessionRepository();
    adminRepo = new InMemoryAdminRepository();
    passwordHasher = new FakePasswordHasher();

    const tokens = new FakeAccessTokenService();
    const keyedHasher = new FakeKeyedHasher();
    issuer = new SessionIssuer({
      sessions,
      tokens,
      keyedHasher,
      refreshTokenTtlDays: 30,
      clock,
    });
  });

  describe('AdminLoginUseCase', () => {
    it('authenticates admin user, creates session, and records audit log', async () => {
      const admin = users.add({
        email: 'admin@fitonus.com',
        displayName: 'System Admin',
        role: 'admin',
        passwordHash: 'hashed:Secret123!',
      });

      const accounts = fakeAccounts(users);
      const useCase = new AdminLoginUseCase({
        accounts,
        passwordHasher,
        issuer,
        adminRepo,
      });

      const result = await useCase.execute(
        { email: 'admin@fitonus.com', password: 'Secret123!' },
        clientMeta,
      );

      expect(result.user.email).toBe('admin@fitonus.com');
      expect(result.user.role).toBe('admin');
      expect(result.tokens.accessToken).toBeDefined();

      // Check audit log recorded
      expect(adminRepo.auditLogs).toHaveLength(1);
      expect(adminRepo.auditLogs[0]?.action).toBe('admin.login');
      expect(adminRepo.auditLogs[0]?.adminId).toBe(admin.id);
      expect(adminRepo.auditLogs[0]?.ipAddress).toBe(clientMeta.ip);
    });

    it('denies login with FORBIDDEN if user exists but has member role', async () => {
      users.add({
        email: 'member@fitonus.com',
        displayName: 'Regular Member',
        role: 'member',
        passwordHash: 'hashed:MemberPass123!',
      });

      const accounts = fakeAccounts(users);
      const useCase = new AdminLoginUseCase({
        accounts,
        passwordHasher,
        issuer,
        adminRepo,
      });

      await expect(
        useCase.execute({ email: 'member@fitonus.com', password: 'MemberPass123!' }, clientMeta),
      ).rejects.toThrowError(AppError);

      expect(adminRepo.auditLogs).toHaveLength(0);
    });

    it('rejects wrong password with UNAUTHORIZED', async () => {
      users.add({
        email: 'admin@fitonus.com',
        displayName: 'System Admin',
        role: 'admin',
        passwordHash: 'hashed:CorrectPass!',
      });

      const accounts = fakeAccounts(users);
      const useCase = new AdminLoginUseCase({
        accounts,
        passwordHasher,
        issuer,
        adminRepo,
      });

      await expect(
        useCase.execute({ email: 'admin@fitonus.com', password: 'WrongPass!' }, clientMeta),
      ).rejects.toThrowError(AppError);

      expect(adminRepo.auditLogs).toHaveLength(0);
    });
  });

  describe('AdminChangeUserStatusUseCase', () => {
    it('suspends user, revokes all sessions, and writes USER_SUSPENDED audit log', async () => {
      const targetUser = users.add({
        email: 'target@fitonus.com',
        displayName: 'Target User',
        role: 'member',
        status: 'active',
      });

      const adminActor = createActor({
        userId: randomUUID(),
        sessionId: randomUUID(),
        role: 'admin',
      });

      const useCase = new AdminChangeUserStatusUseCase({
        users,
        sessions,
        adminRepo,
      });

      const updated = await useCase.execute(
        adminActor,
        targetUser.id,
        'disabled',
        'Violation of terms',
        clientMeta,
      );

      expect(updated.status).toBe('disabled');
      expect(updated.disabledAt).toBeDefined();

      // Audit log check
      expect(adminRepo.auditLogs).toHaveLength(1);
      expect(adminRepo.auditLogs[0]?.action).toBe('user.suspend');
      expect(adminRepo.auditLogs[0]?.adminId).toBe(adminActor.userId);
      expect(adminRepo.auditLogs[0]?.targetUserId).toBe(targetUser.id);
      expect(adminRepo.auditLogs[0]?.details).toMatchObject({
        reason: 'Violation of terms',
      });
    });

    it('reactivates suspended user and writes USER_REACTIVATED audit log', async () => {
      const targetUser = users.add({
        email: 'target@fitonus.com',
        displayName: 'Target User',
        role: 'member',
        status: 'disabled',
        disabledAt: new Date('2026-11-01T00:00:00Z'),
      });

      const adminActor = createActor({
        userId: randomUUID(),
        sessionId: randomUUID(),
        role: 'admin',
      });

      const useCase = new AdminChangeUserStatusUseCase({
        users,
        sessions,
        adminRepo,
      });

      const updated = await useCase.execute(
        adminActor,
        targetUser.id,
        'active',
        'Account reviewed',
        clientMeta,
      );

      expect(updated.status).toBe('active');
      expect(updated.disabledAt).toBeNull();

      expect(adminRepo.auditLogs).toHaveLength(1);
      expect(adminRepo.auditLogs[0]?.action).toBe('user.reactivate');
    });

    it('prevents an administrator from suspending their own account', async () => {
      const adminId = randomUUID();
      const adminActor = createActor({
        userId: adminId,
        sessionId: randomUUID(),
        role: 'admin',
      });

      const useCase = new AdminChangeUserStatusUseCase({
        users,
        sessions,
        adminRepo,
      });

      await expect(
        useCase.execute(adminActor, adminId, 'disabled', 'Accidental self-suspend', clientMeta),
      ).rejects.toThrowError(AppError);
    });
  });

  describe('GetDashboardStatsUseCase', () => {
    it('returns dashboard statistics from repository', async () => {
      const useCase = new GetDashboardStatsUseCase({ adminRepo });
      const stats = await useCase.execute();

      expect(stats.totalUsers).toBe(10);
      expect(stats.activeUsers).toBe(9);
      expect(stats.disabledUsers).toBe(1);
      expect(stats.completedOnboarding).toBe(7);
      expect(stats.registrationTrend).toHaveLength(1);
    });
  });

  describe('ListAdminUsersUseCase & GetAdminUserUseCase', () => {
    it('lists users via ListAdminUsersUseCase', async () => {
      adminRepo.usersList = [
        {
          id: randomUUID(),
          email: 'user1@fitonus.com',
          displayName: 'User 1',
          role: 'member',
          status: 'active',
          version: 1,
          onboardingCompleted: true,
          currentOnboardingStep: 'completed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          disabledAt: null,
        },
      ];

      const useCase = new ListAdminUsersUseCase({ adminRepo });
      const result = await useCase.execute({
        page: 1,
        limit: 10,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('returns user details including session summary and profile metadata', async () => {
      const userId = randomUUID();
      adminRepo.userDetails.set(userId, {
        user: {
          id: userId,
          email: 'jane@fitonus.com',
          displayName: 'Jane Fit',
          role: 'member',
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          disabledAt: null,
        },
        sessionsSummary: {
          activeSessionsCount: 2,
          lastActiveAt: new Date().toISOString(),
        },
        profileMetadata: {
          hasProfile: true,
          onboardingCompleted: true,
          currentOnboardingStep: 'completed',
          primaryGoal: 'build_muscle',
          experienceLevel: 'intermediate',
          preferredWorkoutPlace: 'gym',
          workoutDaysPerWeek: 4,
          preferredWorkoutDurationMin: 60,
          dietType: 'high_protein',
          dailyCalorieTarget: 2400,
          dailyProteinGrams: 160,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const useCase = new GetAdminUserUseCase({ adminRepo });
      const detail = await useCase.execute(userId);

      expect(detail.user.email).toBe('jane@fitonus.com');
      expect(detail.sessionsSummary.activeSessionsCount).toBe(2);
      expect(detail.profileMetadata.onboardingCompleted).toBe(true);
      expect(detail.profileMetadata.primaryGoal).toBe('build_muscle');
    });

    it('throws NOT_FOUND when user does not exist in repository', async () => {
      const useCase = new GetAdminUserUseCase({ adminRepo });
      await expect(useCase.execute(randomUUID())).rejects.toThrowError(AppError);
    });
  });

  describe('ListAuditLogsUseCase', () => {
    it('returns paginated audit logs', async () => {
      await adminRepo.recordAuditLog({
        adminId: randomUUID(),
        action: 'admin.login',
        details: {},
        ipAddress: '127.0.0.1',
      });

      const useCase = new ListAuditLogsUseCase({ adminRepo });
      const result = await useCase.execute({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});

import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { SessionsUseCases } from '../../auth/index.js';
import type { AdminChangePasswordUseCase } from '../application/use-cases/admin-change-password.js';
import type { AdminLoginUseCase } from '../application/use-cases/admin-login.js';
import type { AdminChangeUserStatusUseCase } from '../application/use-cases/change-user-status.js';
import type { GetAdminUserUseCase } from '../application/use-cases/get-admin-user.js';
import type { GetDashboardStatsUseCase } from '../application/use-cases/get-dashboard-stats.js';
import type { ListAdminUsersUseCase } from '../application/use-cases/list-admin-users.js';
import type { ListAuditLogsUseCase } from '../application/use-cases/list-audit-logs.js';
import {
  adminChangePasswordRequest,
  adminLoginRequest,
  changeUserStatusRequest,
  getUserRequest,
  listAdminUsersRequest,
  listAuditLogsRequest,
} from './admin.schemas.js';

export interface AdminUseCases {
  login: AdminLoginUseCase;
  changePassword: AdminChangePasswordUseCase;
  getDashboardStats: GetDashboardStatsUseCase;
  listUsers: ListAdminUsersUseCase;
  getAdminUser: GetAdminUserUseCase;
  changeUserStatus: AdminChangeUserStatusUseCase;
  listAuditLogs: ListAuditLogsUseCase;
  sessions: SessionsUseCases;
}

const clientMeta = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export type AdminController = ReturnType<typeof createAdminController>;

export function createAdminController(useCases: AdminUseCases, isProduction: boolean) {
  const cookieSecurity = isProduction ? '; Secure' : '';

  return {
    login: async (req: Request): Promise<RouteResult<unknown>> => {
      const { body } = getValidated(req, adminLoginRequest);
      const result = await useCases.login.execute(body, clientMeta(req));

      const cookieHeader = `fitonus_admin_token=${result.tokens.accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${cookieSecurity}`;

      return {
        data: {
          tokenType: 'Bearer',
          accessToken: result.tokens.accessToken,
          accessTokenExpiresAt: result.tokens.accessTokenExpiresAt.toISOString(),
          refreshToken: result.tokens.refreshToken,
          refreshTokenExpiresAt: result.tokens.refreshTokenExpiresAt.toISOString(),
          user: result.user,
        },
        headers: {
          'Set-Cookie': cookieHeader,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      };
    },

    getMe: async (req: Request): Promise<RouteResult<unknown>> => {
      const actor = requireActor(req);
      const detail = await useCases.getAdminUser.execute(actor.userId);

      return {
        data: {
          id: detail.user.id,
          email: detail.user.email,
          displayName: detail.user.displayName,
          role: 'admin',
          permissions: Array.from(actor.permissions),
        },
      };
    },

    logout: async (req: Request): Promise<RouteResult<unknown>> => {
      const actor = requireActor(req);
      await useCases.sessions.logout(actor);

      const clearCookie = `fitonus_admin_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecurity}`;

      return {
        data: { message: 'Logged out successfully' },
        headers: {
          'Set-Cookie': clearCookie,
        },
      };
    },

    changePassword: async (req: Request): Promise<RouteResult<unknown>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, adminChangePasswordRequest);
      const result = await useCases.changePassword.execute(actor, body, clientMeta(req));

      return {
        status: 200,
        data: {
          message: 'Password changed successfully',
          revokedSessions: result.revokedSessions,
        },
      };
    },

    getDashboardStats: async (_req: Request): Promise<RouteResult<unknown>> => {
      const stats = await useCases.getDashboardStats.execute();
      return {
        data: {
          ...stats,
          recentUsers: stats.recentUsers.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
          })),
        },
      };
    },

    listUsers: async (req: Request): Promise<RouteResult<unknown>> => {
      const { query } = getValidated(req, listAdminUsersRequest);
      const { items, meta } = await useCases.listUsers.execute(query);
      return {
        data: items,
        meta,
      };
    },

    getUser: async (req: Request): Promise<RouteResult<unknown>> => {
      const { params } = getValidated(req, getUserRequest);
      const detail = await useCases.getAdminUser.execute(params.id);
      return {
        data: detail,
      };
    },

    suspendUser: async (req: Request): Promise<RouteResult<unknown>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, changeUserStatusRequest);
      const updated = await useCases.changeUserStatus.execute(
        actor,
        params.id,
        'disabled',
        body.reason,
        clientMeta(req),
      );
      return {
        data: updated,
        message: 'User account suspended.',
      };
    },

    reactivateUser: async (req: Request): Promise<RouteResult<unknown>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, changeUserStatusRequest);
      const updated = await useCases.changeUserStatus.execute(
        actor,
        params.id,
        'active',
        body.reason,
        clientMeta(req),
      );
      return {
        data: updated,
        message: 'User account reactivated.',
      };
    },

    listAuditLogs: async (req: Request): Promise<RouteResult<unknown>> => {
      const { query } = getValidated(req, listAuditLogsRequest);
      const { items, meta } = await useCases.listAuditLogs.execute(query);
      return {
        data: items,
        meta,
      };
    },
  };
}

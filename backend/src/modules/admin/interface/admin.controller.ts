import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { SessionsUseCases } from '../../auth/index.js';
import type { AdminChangePasswordUseCase } from '../application/use-cases/admin-change-password.js';
import { getAdminLoginRejection, type AdminLoginUseCase } from '../application/use-cases/admin-login.js';
import type { AdminChangeUserStatusUseCase } from '../application/use-cases/change-user-status.js';
import type { GetAdminUserUseCase } from '../application/use-cases/get-admin-user.js';
import type { GetDashboardStatsUseCase } from '../application/use-cases/get-dashboard-stats.js';
import type { GetUserActivityUseCase } from '../application/use-cases/get-user-activity.js';
import type { ListAdminUsersUseCase } from '../application/use-cases/list-admin-users.js';
import type { ListAuditLogsUseCase } from '../application/use-cases/list-audit-logs.js';
import {
  adminChangePasswordRequest,
  adminLoginRequest,
  changeUserStatusRequest,
  getUserActivityRequest,
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
  getUserActivity: GetUserActivityUseCase;
  changeUserStatus: AdminChangeUserStatusUseCase;
  listAuditLogs: ListAuditLogsUseCase;
  sessions: SessionsUseCases;
}

const clientMeta = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

/**
 * Records WHY an admin sign-in was refused in the per-request log (request-id correlated), while the
 * client only ever sees the uniform INVALID_CREDENTIALS response. Logs the reason and the matched
 * account id only: never the submitted e-mail, password or any token.
 */
function logAdminLoginRejection(req: Request, error: unknown): void {
  const rejection = getAdminLoginRejection(error);
  if (!rejection) return;
  const log = (req as { log?: { warn(fields: object, message: string): void } }).log;
  log?.warn(
    { event: 'admin_login_rejected', reason: rejection.reason, accountId: rejection.accountId },
    'Admin sign-in rejected',
  );
}

export type AdminController = ReturnType<typeof createAdminController>;

export const ADMIN_NO_CACHE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export function createAdminController(useCases: AdminUseCases, isProduction: boolean) {
  const sameSite = isProduction ? 'None' : 'Lax';
  const cookieSecurity = isProduction ? '; Secure; Partitioned' : '';

  return {
    login: async (req: Request): Promise<RouteResult<unknown>> => {
      const { body } = getValidated(req, adminLoginRequest);
      let result: Awaited<ReturnType<AdminLoginUseCase['execute']>>;
      try {
        result = await useCases.login.execute(body, clientMeta(req));
      } catch (error) {
        logAdminLoginRejection(req, error);
        throw error;
      }

      const cookieHeader = `fitonus_admin_token=${result.tokens.accessToken}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=900${cookieSecurity}`;

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
          ...ADMIN_NO_CACHE_HEADERS,
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
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },

    logout: async (req: Request): Promise<RouteResult<unknown>> => {
      const actor = requireActor(req);
      await useCases.sessions.logout(actor);

      const clearCookie = `fitonus_admin_token=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${cookieSecurity}`;

      return {
        data: { message: 'Logged out successfully' },
        headers: {
          'Set-Cookie': clearCookie,
          ...ADMIN_NO_CACHE_HEADERS,
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
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },

    getDashboardStats: async (req: Request): Promise<RouteResult<unknown>> => {
      const timeframe = typeof req.query?.timeframe === 'string' ? req.query.timeframe : undefined;
      const stats = await useCases.getDashboardStats.execute({ timeframe });
      return {
        data: {
          ...stats,
          recentUsers: stats.recentUsers.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
          })),
        },
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },

    getUserActivity: async (req: Request): Promise<RouteResult<unknown>> => {
      const { params } = getValidated(req, getUserActivityRequest);
      const activity = await useCases.getUserActivity.execute({ userId: params.id });
      return {
        data: activity,
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },

    listUsers: async (req: Request): Promise<RouteResult<unknown>> => {
      const { query } = getValidated(req, listAdminUsersRequest);
      const { items, meta } = await useCases.listUsers.execute(query);
      return {
        data: items,
        meta,
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },

    getUser: async (req: Request): Promise<RouteResult<unknown>> => {
      const { params } = getValidated(req, getUserRequest);
      const detail = await useCases.getAdminUser.execute(params.id);
      return {
        data: detail,
        headers: ADMIN_NO_CACHE_HEADERS,
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
        headers: ADMIN_NO_CACHE_HEADERS,
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
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },

    listAuditLogs: async (req: Request): Promise<RouteResult<unknown>> => {
      const { query } = getValidated(req, listAuditLogsRequest);
      const { items, meta } = await useCases.listAuditLogs.execute(query);
      return {
        data: items,
        meta,
        headers: ADMIN_NO_CACHE_HEADERS,
      };
    },
  };
}

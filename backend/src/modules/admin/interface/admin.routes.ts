import type { RequestHandler } from 'express';
import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { AdminController } from './admin.controller.js';
import {
  adminLoginRequest,
  adminLoginResponseSchema,
  adminMeResponseSchema,
  adminUserDetailSchema,
  adminUserListResponseSchema,
  auditLogListResponseSchema,
  changeUserStatusRequest,
  dashboardStatsSchema,
  getUserRequest,
  listAdminUsersRequest,
  listAuditLogsRequest,
} from './admin.schemas.js';

export interface AdminRateLimiters {
  login: RequestHandler;
}

const tags = ['Admin'];

export function createAdminRoutes(
  basePath: string,
  controller: AdminController,
  limiters: AdminRateLimiters,
): RouteGroup {
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'post',
        path: '/auth/login',
        summary: 'Admin Portal Login',
        description:
          'Authenticates administrator credentials and returns tokens plus HttpOnly session cookie.',
        tags,
        access: { kind: 'public' },
        middleware: [limiters.login],
        request: adminLoginRequest,
        response: {
          status: 200,
          description: 'Signed in as Administrator',
          message: 'Signed in',
          schema: adminLoginResponseSchema,
        },
        errorStatuses: [401, 403, 429],
        handler: controller.login,
      }),
      defineRoute({
        method: 'get',
        path: '/auth/me',
        summary: 'Get Current Admin Profile & Permissions',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        response: {
          status: 200,
          description: 'Current Administrator',
          message: 'Success',
          schema: adminMeResponseSchema,
        },
        errorStatuses: [401, 403],
        handler: controller.getMe,
      }),
      defineRoute({
        method: 'post',
        path: '/auth/logout',
        summary: 'Admin Portal Logout',
        description: 'Revokes administrator session and clears session cookie.',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Signed out',
          message: 'Signed out',
          schema: z.object({ message: z.string() }),
        },
        handler: controller.logout,
      }),
      defineRoute({
        method: 'get',
        path: '/dashboard/stats',
        summary: 'Get Dashboard Analytics and Activity Statistics',
        description:
          'Calculates live database statistics for registered, active, onboarding, and trend metrics.',
        tags,
        access: { kind: 'permission', permission: 'admin:stats' },
        response: {
          status: 200,
          description: 'Dashboard metrics',
          message: 'Success',
          schema: dashboardStatsSchema,
        },
        errorStatuses: [401, 403],
        handler: controller.getDashboardStats,
      }),
      defineRoute({
        method: 'get',
        path: '/users',
        summary: 'List Users with Onboarding Status and Filters',
        description: 'Paginated user management list with search, status, role, and onboarding filters.',
        tags,
        access: { kind: 'permission', permission: 'users:read' },
        request: listAdminUsersRequest,
        response: {
          status: 200,
          description: 'Page of users',
          message: 'Success',
          schema: adminUserListResponseSchema,
          paginated: true,
        },
        errorStatuses: [401, 403],
        handler: controller.listUsers,
      }),
      defineRoute({
        method: 'get',
        path: '/users/:id',
        summary: 'Get Detailed User Record with Support Profile Metadata',
        tags,
        access: { kind: 'permission', permission: 'users:read' },
        request: getUserRequest,
        response: {
          status: 200,
          description: 'User details with support profile',
          message: 'Success',
          schema: adminUserDetailSchema,
        },
        errorStatuses: [401, 403, 404],
        handler: controller.getUser,
      }),
      defineRoute({
        method: 'post',
        path: '/users/:id/suspend',
        summary: 'Suspend a User Account',
        description: 'Marks account disabled, terminates all live sessions, and writes an audit log.',
        tags,
        access: { kind: 'permission', permission: 'users:manage-status' },
        request: changeUserStatusRequest,
        response: {
          status: 200,
          description: 'Account suspended',
          message: 'User account suspended.',
          schema: z.object({
            id: z.uuid(),
            email: z.string(),
            displayName: z.string(),
            role: z.string(),
            status: z.literal('disabled'),
            version: z.number(),
            createdAt: z.iso.datetime(),
            updatedAt: z.iso.datetime(),
            disabledAt: z.iso.datetime().nullable(),
          }),
        },
        errorStatuses: [401, 403, 404, 409, 422],
        handler: controller.suspendUser,
      }),
      defineRoute({
        method: 'post',
        path: '/users/:id/reactivate',
        summary: 'Reactivate a Suspended User Account',
        description: 'Restores account to active status and writes an audit log.',
        tags,
        access: { kind: 'permission', permission: 'users:manage-status' },
        request: changeUserStatusRequest,
        response: {
          status: 200,
          description: 'Account reactivated',
          message: 'User account reactivated.',
          schema: z.object({
            id: z.uuid(),
            email: z.string(),
            displayName: z.string(),
            role: z.string(),
            status: z.literal('active'),
            version: z.number(),
            createdAt: z.iso.datetime(),
            updatedAt: z.iso.datetime(),
            disabledAt: z.iso.datetime().nullable(),
          }),
        },
        errorStatuses: [401, 403, 404, 409, 422],
        handler: controller.reactivateUser,
      }),
      defineRoute({
        method: 'get',
        path: '/audit-logs',
        summary: 'List Admin Audit Logs',
        description: 'Chronological record of sensitive administrative actions and security events.',
        tags,
        access: { kind: 'permission', permission: 'admin:audit' },
        request: listAuditLogsRequest,
        response: {
          status: 200,
          description: 'Page of audit log events',
          message: 'Success',
          schema: auditLogListResponseSchema,
          paginated: true,
        },
        errorStatuses: [401, 403],
        handler: controller.listAuditLogs,
      }),
    ],
  };
}

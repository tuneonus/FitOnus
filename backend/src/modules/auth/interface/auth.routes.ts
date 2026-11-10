import type { RequestHandler } from 'express';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { AuthController } from './auth.controller.js';
import {
  changePasswordRequest,
  forgotPasswordRequest,
  loginRequest,
  messageResponseSchema,
  refreshRequest,
  registerRequest,
  resetPasswordRequest,
  revocationSchema,
  sessionIdRequest,
  sessionListSchema,
  tokensSchema,
} from './auth.schemas.js';

export interface AuthRateLimiters {
  login: RequestHandler;
  register: RequestHandler;
  refresh: RequestHandler;
  sensitive: RequestHandler;
}

const tags = ['Auth'];

export function createAuthRoutes(
  basePath: string,
  controller: AuthController,
  limiters: AuthRateLimiters,
): RouteGroup {
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'post',
        path: '/register',
        summary: 'Self-service registration (only when AUTH_PUBLIC_REGISTRATION=true)',
        tags,
        access: { kind: 'public' },
        middleware: [limiters.register],
        request: registerRequest,
        response: {
          status: 201,
          description: 'Account created and signed in',
          message: 'Registered',
          schema: tokensSchema,
        },
        errorStatuses: [403, 409, 429],
        handler: controller.register,
      }),
      defineRoute({
        method: 'post',
        path: '/login',
        summary: 'Sign in with email and password',
        tags,
        access: { kind: 'public' },
        middleware: [limiters.login],
        request: loginRequest,
        response: { status: 200, description: 'Signed in', message: 'Signed in', schema: tokensSchema },
        errorStatuses: [401, 403, 429],
        handler: controller.login,
      }),
      defineRoute({
        method: 'post',
        path: '/refresh',
        summary: 'Rotate the refresh token and get a new access token',
        description: 'Each refresh token is single-use. Re-using a rotated token revokes the session.',
        tags,
        access: { kind: 'public' },
        middleware: [limiters.refresh],
        request: refreshRequest,
        response: {
          status: 200,
          description: 'New token pair',
          message: 'Token refreshed',
          schema: tokensSchema,
        },
        errorStatuses: [401, 403, 429],
        handler: controller.refresh,
      }),
      defineRoute({
        method: 'post',
        path: '/logout',
        summary: 'Revoke the current session',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Session revoked',
          message: 'Signed out',
          schema: revocationSchema,
        },
        handler: controller.logout,
      }),
      defineRoute({
        method: 'post',
        path: '/logout-all',
        summary: 'Revoke every session of the current user',
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Sessions revoked',
          message: 'Signed out everywhere',
          schema: revocationSchema,
        },
        handler: controller.logoutAll,
      }),
      defineRoute({
        method: 'get',
        path: '/sessions',
        summary: "List the current user's active sessions",
        tags,
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Active sessions',
          message: 'Success',
          schema: sessionListSchema,
        },
        handler: controller.listSessions,
      }),
      defineRoute({
        method: 'delete',
        path: '/sessions/:id',
        summary: 'Revoke one of the current user’s sessions',
        tags,
        access: { kind: 'authenticated' },
        request: sessionIdRequest,
        response: {
          status: 200,
          description: 'Session revoked',
          message: 'Session revoked',
          schema: revocationSchema,
        },
        errorStatuses: [404],
        handler: controller.revokeSession,
      }),
      defineRoute({
        method: 'post',
        path: '/change-password',
        summary: 'Change password and revoke all other sessions',
        tags,
        access: { kind: 'authenticated' },
        middleware: [limiters.sensitive],
        request: changePasswordRequest,
        response: {
          status: 200,
          description: 'Password changed',
          message: 'Password changed',
          schema: revocationSchema,
        },
        errorStatuses: [422, 429],
        handler: controller.changePassword,
      }),
      defineRoute({
        method: 'post',
        path: '/forgot-password',
        summary: 'Request password reset email',
        tags,
        access: { kind: 'public' },
        middleware: [limiters.sensitive],
        request: forgotPasswordRequest,
        response: {
          status: 200,
          description: 'Password reset request accepted',
          message: 'Password reset instructions sent if account exists',
          schema: messageResponseSchema,
        },
        errorStatuses: [400, 429, 503],
        handler: controller.forgotPassword,
      }),
      defineRoute({
        method: 'post',
        path: '/reset-password',
        summary: 'Reset password using token',
        tags,
        access: { kind: 'public' },
        middleware: [limiters.sensitive],
        request: resetPasswordRequest,
        response: {
          status: 200,
          description: 'Password reset successful',
          message: 'Password reset successful',
          schema: messageResponseSchema,
        },
        errorStatuses: [400, 401, 422, 429, 503],
        handler: controller.resetPassword,
      }),
    ],
  };
}

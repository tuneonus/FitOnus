import type { Request } from 'express';
import type { z } from 'zod';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { AuthTokens, ClientMeta } from '../application/ports.js';
import type { ChangePasswordUseCase } from '../application/use-cases/change-password.js';
import type { LoginUseCase } from '../application/use-cases/login.js';
import type { RefreshSessionUseCase } from '../application/use-cases/refresh-session.js';
import type { RegisterUseCase } from '../application/use-cases/register.js';
import type { RequestPasswordResetUseCase } from '../application/use-cases/request-password-reset.js';
import type { ResetPasswordUseCase } from '../application/use-cases/reset-password.js';
import type { SessionsUseCases, SessionView } from '../application/use-cases/sessions.js';
import {
  changePasswordRequest,
  forgotPasswordRequest,
  loginRequest,
  refreshRequest,
  registerRequest,
  resetPasswordRequest,
  sessionIdRequest,
  type tokensSchema,
} from './auth.schemas.js';

export interface AuthUseCases {
  register: RegisterUseCase;
  login: LoginUseCase;
  refresh: RefreshSessionUseCase;
  sessions: SessionsUseCases;
  changePassword: ChangePasswordUseCase;
  /** Absent until a PasswordResetNotifier is configured; the two endpoints then answer 503 for everyone. */
  passwordReset?: { request: RequestPasswordResetUseCase; reset: ResetPasswordUseCase };
}

type TokensView = z.output<typeof tokensSchema>;

// Token responses must never be cached by browsers or proxies.
const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

// The same body for every e-mail address, whatever happened behind the scenes.
const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email address, a 6-digit verification code has been sent.';
const RESET_PASSWORD_MESSAGE = 'Your password has been reset. Please sign in with your new password.';

const clientMeta = (req: Request): ClientMeta => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

const toTokensView = (tokens: AuthTokens): TokensView => ({
  tokenType: 'Bearer',
  accessToken: tokens.accessToken,
  accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
  refreshToken: tokens.refreshToken,
  refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
});

export function createAuthController(useCases: AuthUseCases) {
  return {
    register: async (req: Request): Promise<RouteResult<TokensView>> => {
      const { body } = getValidated(req, registerRequest);
      const tokens = await useCases.register.execute(body, clientMeta(req));
      return { data: toTokensView(tokens), headers: NO_STORE };
    },

    login: async (req: Request): Promise<RouteResult<TokensView>> => {
      const { body } = getValidated(req, loginRequest);
      const tokens = await useCases.login.execute(body, clientMeta(req));
      return { data: toTokensView(tokens), headers: NO_STORE };
    },

    refresh: async (req: Request): Promise<RouteResult<TokensView>> => {
      const { body } = getValidated(req, refreshRequest);
      const tokens = await useCases.refresh.execute(body.refreshToken);
      return { data: toTokensView(tokens), headers: NO_STORE };
    },

    logout: async (req: Request): Promise<RouteResult<{ revokedSessions: number }>> => ({
      data: await useCases.sessions.logout(requireActor(req)),
    }),

    logoutAll: async (req: Request): Promise<RouteResult<{ revokedSessions: number }>> => ({
      data: await useCases.sessions.logoutAll(requireActor(req)),
    }),

    listSessions: async (req: Request): Promise<RouteResult<SessionView[]>> => ({
      data: await useCases.sessions.list(requireActor(req)),
    }),

    revokeSession: async (req: Request): Promise<RouteResult<{ revokedSessions: number }>> => {
      const { params } = getValidated(req, sessionIdRequest);
      return { data: await useCases.sessions.revoke(requireActor(req), params.id) };
    },

    changePassword: async (req: Request): Promise<RouteResult<{ revokedSessions: number }>> => {
      const { body } = getValidated(req, changePasswordRequest);
      return { data: await useCases.changePassword.execute(requireActor(req), body) };
    },

    forgotPassword: async (req: Request): Promise<RouteResult<{ message: string }>> => {
      const { body } = getValidated(req, forgotPasswordRequest);
      const { passwordReset } = useCases;
      // Uniform 503 for every e-mail: nothing is looked up or stored without a delivery channel.
      if (!passwordReset) {
        throw new AppError(
          'unavailable',
          'SERVICE_UNAVAILABLE',
          'Password reset email delivery service is currently not configured. Please contact support.',
        );
      }
      await passwordReset.request.execute(body, clientMeta(req));
      return { data: { message: FORGOT_PASSWORD_MESSAGE }, headers: NO_STORE };
    },

    resetPassword: async (req: Request): Promise<RouteResult<{ message: string }>> => {
      const { body } = getValidated(req, resetPasswordRequest);
      const { passwordReset } = useCases;
      if (!passwordReset) {
        throw new AppError(
          'unavailable',
          'SERVICE_UNAVAILABLE',
          'Password reset service is currently unavailable. Please contact support.',
        );
      }
      await passwordReset.reset.execute(body);
      return { data: { message: RESET_PASSWORD_MESSAGE }, headers: NO_STORE };
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;

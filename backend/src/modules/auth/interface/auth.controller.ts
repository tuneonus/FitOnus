import type { Request } from 'express';
import type { z } from 'zod';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { AuthTokens, ClientMeta } from '../application/ports.js';
import type { ChangePasswordUseCase } from '../application/use-cases/change-password.js';
import type { LoginUseCase } from '../application/use-cases/login.js';
import type { RefreshSessionUseCase } from '../application/use-cases/refresh-session.js';
import type { RegisterUseCase } from '../application/use-cases/register.js';
import type { SessionsUseCases, SessionView } from '../application/use-cases/sessions.js';
import {
  changePasswordRequest,
  loginRequest,
  refreshRequest,
  registerRequest,
  sessionIdRequest,
  type tokensSchema,
} from './auth.schemas.js';

export interface AuthUseCases {
  register: RegisterUseCase;
  login: LoginUseCase;
  refresh: RefreshSessionUseCase;
  sessions: SessionsUseCases;
  changePassword: ChangePasswordUseCase;
}

type TokensView = z.output<typeof tokensSchema>;

// Token responses must never be cached by browsers or proxies.
const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

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
  };
}

export type AuthController = ReturnType<typeof createAuthController>;

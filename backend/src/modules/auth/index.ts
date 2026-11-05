import type { AppConfig } from '../../config/env.js';
import type { SqlExecutor } from '../../database/transaction.js';
import type { Actor } from '../../shared/auth/actor.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { KeyedHasher } from '../../shared/security/keyed-hasher.js';
import type { PasswordHasher } from '../../shared/security/password-hasher.js';
import { randomToken } from '../../shared/security/random.js';
import type { Clock, SessionRepository, UserAccountsPort } from './application/ports.js';
import { SessionIssuer } from './application/session-issuer.js';
import { AuthenticateAccessTokenUseCase } from './application/use-cases/authenticate-access-token.js';
import { ChangePasswordUseCase } from './application/use-cases/change-password.js';
import { LoginUseCase } from './application/use-cases/login.js';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.js';
import { RegisterUseCase } from './application/use-cases/register.js';
import { SessionsUseCases } from './application/use-cases/sessions.js';
import { JoseAccessTokenService } from './infrastructure/jose-access-token-service.js';
import { PgSessionRepository } from './infrastructure/pg-session-repository.js';
import { createAuthController } from './interface/auth.controller.js';
import { createAuthRoutes, type AuthRateLimiters } from './interface/auth.routes.js';

export type { AuthRateLimiters } from './interface/auth.routes.js';
export type {
  AuthTokens,
  ClientMeta,
  Clock,
  SessionRepository,
  UserAccountsPort,
} from './application/ports.js';
export { SessionIssuer } from './application/session-issuer.js';
export { SessionsUseCases } from './application/use-cases/sessions.js';

export interface AuthModule {
  routes: RouteGroup;
  /** Used by the authenticate middleware for every protected route. */
  authenticateAccessToken: (token: string) => Promise<Actor>;
  sessions: SessionRepository;
  issuer: SessionIssuer;
  sessionsUseCases: SessionsUseCases;
}

export function createAuthModule(deps: {
  basePath: string;
  db: SqlExecutor;
  uow: UnitOfWork;
  passwordHasher: PasswordHasher;
  keyedHasher: KeyedHasher;
  accounts: UserAccountsPort;
  config: AppConfig['auth'];
  limiters: AuthRateLimiters;
  clock?: Clock;
}): AuthModule {
  const clock = deps.clock ?? (() => new Date());
  const sessions = new PgSessionRepository(deps.db);
  const tokens = new JoseAccessTokenService({
    secret: deps.config.accessTokenSecret,
    issuer: deps.config.issuer,
    audience: deps.config.audience,
    ttlSeconds: deps.config.accessTokenTtlSeconds,
    clock,
  });
  const issuer = new SessionIssuer({
    sessions,
    tokens,
    keyedHasher: deps.keyedHasher,
    refreshTokenTtlDays: deps.config.refreshTokenTtlDays,
    clock,
  });

  let dummyHash: Promise<string> | undefined;
  const dummyPasswordHash = () => (dummyHash ??= deps.passwordHasher.hash(randomToken()));

  const authenticate = new AuthenticateAccessTokenUseCase({
    tokens,
    sessions,
    accounts: deps.accounts,
    clock,
  });
  const controller = createAuthController({
    register: new RegisterUseCase({
      accounts: deps.accounts,
      passwordHasher: deps.passwordHasher,
      issuer,
      uow: deps.uow,
      publicRegistrationEnabled: deps.config.publicRegistration,
    }),
    login: new LoginUseCase({
      accounts: deps.accounts,
      passwordHasher: deps.passwordHasher,
      issuer,
      dummyPasswordHash,
    }),
    refresh: new RefreshSessionUseCase({
      sessions,
      tokens,
      accounts: deps.accounts,
      keyedHasher: deps.keyedHasher,
      refreshTokenTtlDays: deps.config.refreshTokenTtlDays,
      clock,
    }),
    sessions: new SessionsUseCases({ sessions }),
    changePassword: new ChangePasswordUseCase({
      accounts: deps.accounts,
      sessions,
      passwordHasher: deps.passwordHasher,
      uow: deps.uow,
    }),
  });

  const sessionsUseCases = new SessionsUseCases({ sessions });

  return {
    routes: createAuthRoutes(deps.basePath, controller, deps.limiters),
    authenticateAccessToken: (token) => authenticate.execute(token),
    sessions,
    issuer,
    sessionsUseCases,
  };
}

/** Housekeeping entry point for scripts: removes long-dead sessions. */
export function createAuthMaintenance(db: SqlExecutor) {
  const sessions = new PgSessionRepository(db);
  return { purgeInactiveSessions: (retentionDays: number) => sessions.purgeInactive(retentionDays) };
}

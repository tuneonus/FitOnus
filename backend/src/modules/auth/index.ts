import type { AppConfig } from '../../config/env.js';
import type { SqlExecutor } from '../../database/transaction.js';
import type { Actor } from '../../shared/auth/actor.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { KeyedHasher } from '../../shared/security/keyed-hasher.js';
import type { PasswordHasher } from '../../shared/security/password-hasher.js';
import { randomToken } from '../../shared/security/random.js';
import type {
  Clock,
  PasswordResetFailureEvent,
  PasswordResetNotifier,
  PasswordResetTokenRepository,
  SessionRepository,
  UserAccountsPort,
} from './application/ports.js';
import { SessionIssuer } from './application/session-issuer.js';
import { AuthenticateAccessTokenUseCase } from './application/use-cases/authenticate-access-token.js';
import { ChangePasswordUseCase } from './application/use-cases/change-password.js';
import { LoginUseCase } from './application/use-cases/login.js';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.js';
import { RegisterUseCase } from './application/use-cases/register.js';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.js';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.js';
import { SessionsUseCases } from './application/use-cases/sessions.js';
import { resolvePasswordResetSettings, type PasswordResetSettings } from './domain/password-reset.js';
import { JoseAccessTokenService } from './infrastructure/jose-access-token-service.js';
import { PgPasswordResetTokenRepository } from './infrastructure/pg-password-reset-token-repository.js';
import { PgSessionRepository } from './infrastructure/pg-session-repository.js';
import { createAuthController } from './interface/auth.controller.js';
import { createAuthRoutes, type AuthRateLimiters } from './interface/auth.routes.js';

export type { AuthRateLimiters } from './interface/auth.routes.js';
export type {
  AuthTokens,
  ClientMeta,
  Clock,
  PasswordResetFailureEvent,
  PasswordResetMessage,
  PasswordResetNotifier,
  PasswordResetTokenRepository,
  SessionRepository,
  UserAccountsPort,
} from './application/ports.js';
export type { PasswordResetSettings } from './domain/password-reset.js';
export {
  ResendDeliveryError,
  ResendPasswordResetNotifier,
  type ResendPasswordResetNotifierOptions,
} from './infrastructure/resend-password-reset-notifier.js';
export { SessionIssuer } from './application/session-issuer.js';
export { SessionsUseCases } from './application/use-cases/sessions.js';

/**
 * Enables POST /auth/forgot-password and /auth/reset-password. Without it both answer 503 for every
 * caller and nothing is stored. Requires the `password_reset_tokens` table
 * (migrations/0016_create_password_reset_tokens.sql) unless `repository` replaces the PostgreSQL store.
 */
export interface PasswordResetOptions extends Partial<PasswordResetSettings> {
  /** The delivery channel. There is intentionally no default implementation; composition supplies one. */
  notifier: PasswordResetNotifier;
  /** Secret-free failure signals (token issue / delivery). Wire this to the application logger. */
  onFailure?: (event: PasswordResetFailureEvent) => void;
  /** Alternative token store; defaults to PostgreSQL via `db`. */
  repository?: PasswordResetTokenRepository;
}

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
  passwordReset?: PasswordResetOptions;
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
  const passwordReset = deps.passwordReset && {
    settings: resolvePasswordResetSettings(deps.passwordReset),
    options: deps.passwordReset,
  };
  const resetTokens =
    passwordReset && (passwordReset.options.repository ?? new PgPasswordResetTokenRepository(deps.db));

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
    passwordReset:
      passwordReset && resetTokens
        ? {
            request: new RequestPasswordResetUseCase({
              accounts: deps.accounts,
              tokens: resetTokens,
              keyedHasher: deps.keyedHasher,
              notifier: passwordReset.options.notifier,
              uow: deps.uow,
              clock,
              settings: passwordReset.settings,
              onFailure: passwordReset.options.onFailure,
            }),
            reset: new ResetPasswordUseCase({
              accounts: deps.accounts,
              sessions,
              tokens: resetTokens,
              keyedHasher: deps.keyedHasher,
              passwordHasher: deps.passwordHasher,
              uow: deps.uow,
              clock,
              settings: passwordReset.settings,
            }),
          }
        : undefined,
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

/**
 * Housekeeping entry point for scripts: removes long-dead sessions and, once the
 * `password_reset_tokens` migration is applied, expired or redeemed reset tokens
 * (call `purgePasswordResetTokens` only after that migration, and keep retention >= 1 day).
 */
export function createAuthMaintenance(db: SqlExecutor) {
  const sessions = new PgSessionRepository(db);
  const resetTokens = new PgPasswordResetTokenRepository(db);
  return {
    purgeInactiveSessions: (retentionDays: number) => sessions.purgeInactive(retentionDays),
    purgePasswordResetTokens: (retentionDays: number) => resetTokens.purge(retentionDays),
  };
}

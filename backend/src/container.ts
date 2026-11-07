import type { RequestHandler } from 'express';
import type { AppConfig } from './config/env.js';
import type { Pool } from './database/pool.js';
import { Database, PgUnitOfWork } from './database/transaction.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { createRateLimiters, type RateLimiters } from './middleware/rate-limit.js';
import { createAdminModule } from './modules/admin/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { createHealthRoutes } from './modules/health/health.routes.js';
import { createProfileModule } from './modules/profile/index.js';
import { createNutritionModule } from './modules/nutrition/index.js';
import { createProgressModule } from './modules/progress/index.js';
import { createGoalsModule } from './modules/goals/index.js';
import { createChallengesModule } from './modules/challenges/index.js';
import { createAnalyticsModule } from './modules/analytics/index.js';
import { createUsersModule } from './modules/users/index.js';
import { createWorkoutsModule } from './modules/workouts/index.js';
import type { RouteGroup } from './shared/http/route.js';
import { IdempotencyService } from './shared/idempotency/idempotency.js';
import { PgIdempotencyStore } from './shared/idempotency/pg-idempotency-store.js';
import { Argon2PasswordHasher } from './shared/security/argon2-password-hasher.js';
import { HmacKeyedHasher } from './shared/security/hmac-keyed-hasher.js';

export const API_PREFIX = '/api/v1';
const READINESS_TIMEOUT_MS = 15_000;

export interface Container {
  database: Database;
  routeGroups: RouteGroup[];
  authenticate: RequestHandler;
  rateLimiters: RateLimiters;
  lifecycle: { isShuttingDown: () => boolean; beginShutdown: () => void };
}

/**
 * Composition root: the only place that knows every concrete class. Modules receive
 * their dependencies as plain arguments; there is no DI container or global state.
 */
export function createContainer(config: AppConfig, pool: Pool): Container {
  const database = new Database(pool);
  const uow = new PgUnitOfWork(database);
  const passwordHasher = new Argon2PasswordHasher();
  const keyedHasher = new HmacKeyedHasher(config.security.hmacSecret);
  const idempotency = new IdempotencyService(
    new PgIdempotencyStore(database),
    keyedHasher,
    config.idempotency,
  );
  const rateLimiters = createRateLimiters(config.rateLimit);

  let shuttingDown = false;
  const lifecycle = {
    isShuttingDown: () => shuttingDown,
    beginShutdown: () => {
      shuttingDown = true;
    },
  };

  const users = createUsersModule({
    basePath: `${API_PREFIX}/users`,
    db: database,
    uow,
    passwordHasher,
    idempotency,
  });
  const auth = createAuthModule({
    basePath: `${API_PREFIX}/auth`,
    db: database,
    uow,
    passwordHasher,
    keyedHasher,
    accounts: users.accounts,
    config: config.auth,
    limiters: rateLimiters,
  });
  const health = createHealthRoutes({
    checkReady: () => database.ping(READINESS_TIMEOUT_MS),
    isShuttingDown: lifecycle.isShuttingDown,
  });
  const profile = createProfileModule({
    basePath: `${API_PREFIX}/profile`,
    db: database,
    uow,
  });
  const admin = createAdminModule({
    basePath: `${API_PREFIX}/admin`,
    db: database,
    accounts: users.accounts,
    users: users.repository,
    sessions: auth.sessions,
    sessionsUseCases: auth.sessionsUseCases,
    sessionIssuer: auth.issuer,
    passwordHasher,
    limiters: rateLimiters,
    isProduction: config.isProduction,
  });
  const workouts = createWorkoutsModule({
    memberBasePath: `${API_PREFIX}/workouts`,
    adminBasePath: `${API_PREFIX}/admin/workouts`,
    db: database,
    uow,
    idempotency,
  });
  const nutrition = createNutritionModule({
    memberBasePath: `${API_PREFIX}/nutrition`,
    adminBasePath: `${API_PREFIX}/admin/nutrition`,
    db: database,
    uow,
  });
  const progress = createProgressModule({
    basePath: `${API_PREFIX}/progress`,
    db: database,
  });
  const goals = createGoalsModule({
    goalsBasePath: `${API_PREFIX}/goals`,
    habitsBasePath: `${API_PREFIX}/habits`,
    db: database,
  });
  const challenges = createChallengesModule({
    memberBasePath: `${API_PREFIX}/challenges`,
    gamificationBasePath: `${API_PREFIX}/gamification`,
    adminBasePath: `${API_PREFIX}/admin/challenges`,
    db: database,
    uow,
  });
  const analytics = createAnalyticsModule({
    basePath: `${API_PREFIX}/analytics`,
    db: database,
  });

  return {
    database,
    routeGroups: [
      health,
      auth.routes,
      users.routes,
      profile.routes,
      admin.routes,
      workouts.memberRoutes,
      workouts.adminRoutes,
      nutrition.memberRoutes,
      ...(nutrition.adminRoutes ? [nutrition.adminRoutes] : []),
      progress.routes,
      goals.goalsRoutes,
      goals.habitsRoutes,
      challenges.memberChallengesRoutes,
      challenges.memberGamificationRoutes,
      challenges.adminChallengesRoutes,
      analytics.routes,
    ],
    authenticate: createAuthenticate(auth.authenticateAccessToken),
    rateLimiters,
    lifecycle,
  };
}

import type { RequestHandler } from 'express';
import { assertAiBackendConfigured, type AppConfig } from './config/env.js';
import type { Pool } from './database/pool.js';
import { Database, PgUnitOfWork } from './database/transaction.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { createRateLimiters, type RateLimiters } from './middleware/rate-limit.js';
import { createAdminModule } from './modules/admin/index.js';
import {
  createAuthModule,
  ResendPasswordResetNotifier,
  type PasswordResetFailureEvent,
} from './modules/auth/index.js';
import { createHealthRoutes } from './modules/health/health.routes.js';
import { createProfileModule } from './modules/profile/index.js';
import { createNutritionModule, PythonMealPhotoService, PythonVoiceMealService } from './modules/nutrition/index.js';
import { createProgressModule } from './modules/progress/index.js';
import { createGoalsModule } from './modules/goals/index.js';
import { createChallengesModule } from './modules/challenges/index.js';
import { createAnalyticsModule } from './modules/analytics/index.js';
import { createUsersModule } from './modules/users/index.js';
import { createWorkoutsModule } from './modules/workouts/index.js';
import { createDashboardModule } from './modules/dashboard/index.js';
import { PythonAiClient } from './shared/ai/python-ai-client.js';
import {
  createCoachModule,
  PythonCoachChatService,
  PythonCoachInsightsService,
  PythonSpeechTranscriber,
  PythonMemoryExtractor,
  type CoachModule,
} from './modules/coach/index.js';
import {
  createNotificationsModule,
  FcmHttpV1Sender,
  type NotificationsModule,
  type PushSender,
} from './modules/notifications/index.js';
import { createAppSettingsModule, type AppSettingsModule } from './modules/app-settings/index.js';
import { createKnowledgeModule, type KnowledgeModule } from './modules/knowledge/index.js';
import type { RouteGroup } from './shared/http/route.js';
import { IdempotencyService } from './shared/idempotency/idempotency.js';
import { PgIdempotencyStore } from './shared/idempotency/pg-idempotency-store.js';
import { ImageProcessor } from './shared/images/image-processor.js';
import { LibheifDecoder } from './shared/images/libheif-decoder.js';
import { createPrivateMedia, type PrivateMedia } from './shared/private-media/index.js';
import type { PublicObjectStore } from './shared/storage/object-store.js';
import type { PrivateObjectStore } from './shared/storage/private-object-store.js';
import { R2ObjectStore } from './shared/storage/r2-object-store.js';
import type { Logger } from './shared/logging/logger.js';
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
  appSettings?: AppSettingsModule;
  notifications?: NotificationsModule;
  /** The private member-photo storage and its deletion worker; null when R2_PRIVATE_* is not configured. */
  privateMedia?: PrivateMedia | null;
  knowledge?: KnowledgeModule;
  coach?: CoachModule;
}

export interface ContainerOverrides {
  /** Replaces the push provider (tests inject a fake; production builds it from FCM_* configuration). */
  pushSender?: PushSender | null;
  /** Replaces the R2 image store (tests inject a fake so no test ever reaches real storage). */
  imageStore?: PublicObjectStore | null;
  /** Replaces the private member-photo store (tests inject an in-memory one so no test ever reaches real storage). */
  privateStore?: PrivateObjectStore | null;
}

/**
 * Composition root: the only place that knows every concrete class. Modules receive
 * their dependencies as plain arguments; there is no DI container or global state.
 */
export function createContainer(
  config: AppConfig,
  pool: Pool,
  logger?: Logger,
  overrides: ContainerOverrides = {},
): Container {
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
  // Password reset is enabled only when a delivery channel is configured (EMAIL_PROVIDER=resend);
  // otherwise POST /auth/forgot-password and /auth/reset-password answer 503 and store nothing.
  const passwordReset =
    config.email.provider === 'resend'
      ? {
          notifier: new ResendPasswordResetNotifier({
            apiKey: config.email.apiKey,
            from: config.email.from,
            timeoutMs: config.email.timeoutMs,
          }),
          // Only these three secret-free fields are logged: never the e-mail address, token or provider text.
          onFailure: ({ stage, userId, errorName }: PasswordResetFailureEvent): void => {
            logger?.error({ stage, userId, errorName }, 'Password reset email flow failed');
          },
        }
      : undefined;
  const auth = createAuthModule({
    basePath: `${API_PREFIX}/auth`,
    db: database,
    uow,
    passwordHasher,
    keyedHasher,
    accounts: users.accounts,
    config: config.auth,
    limiters: rateLimiters,
    passwordReset,
  });
  const health = createHealthRoutes({
    checkReady: () => database.ping(READINESS_TIMEOUT_MS),
    isShuttingDown: lifecycle.isShuttingDown,
  });
  // One decode/validate pipeline for every image the backend accepts, public or private. HEIC is decoded only when
  // enabled. The private member-photo storage (avatars, progress photos) is separate from the public media bucket:
  // its own bucket and token, no public address, and a deletion queue worked by the purger. Null when not configured.
  const imageProcessor = new ImageProcessor({ heic: config.media.heicEnabled ? new LibheifDecoder() : null });
  const privateMedia = createPrivateMedia({
    config: config.media.privateMedia,
    db: database,
    intake: imageProcessor,
    ...(overrides.privateStore !== undefined ? { store: overrides.privateStore } : {}),
    ...(logger ? { logger } : {}),
  });
  const memberImageLimiters = { memberImageUploads: rateLimiters.memberImageUploads };
  const profile = createProfileModule({
    basePath: `${API_PREFIX}/profile`,
    db: database,
    uow,
    privateMedia,
    limiters: memberImageLimiters,
    ...(logger ? { logger } : {}),
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
  const r2 = config.media.r2;
  const imageStore: PublicObjectStore | null =
    overrides.imageStore !== undefined
      ? overrides.imageStore
      : r2
        ? new R2ObjectStore({
            accountId: r2.accountId,
            accessKeyId: r2.accessKeyId,
            secretAccessKey: r2.secretAccessKey,
            bucket: r2.bucket,
            timeoutMs: r2.timeoutMs,
          })
        : null;
  // One image processor and one store for every image the backend puts in the public media bucket (notifications,
  // exercises, workout template covers). HEIC is decoded only when enabled. Tests inject a fake store, so no test
  // can reach real storage.
  const publicImages = {
    store: imageStore,
    publicBaseUrl: r2?.publicBaseUrl ?? null,
    processor: imageProcessor,
  };
  // AI Coach chat and insights, voice meal, meal photo, speech transcription and workout planner are served by the Python AI backend (ai-backend/). Its URL
  // and secret are required: `assertAiBackendConfigured` stops startup with a clear message if missing.
  const { aiBackend } = assertAiBackendConfigured(config);
  const pythonAi = new PythonAiClient({ baseUrl: aiBackend.url, serviceSecret: aiBackend.serviceSecret });

  const workouts = createWorkoutsModule({
    memberBasePath: `${API_PREFIX}/workouts`,
    adminBasePath: `${API_PREFIX}/admin/workouts`,
    db: database,
    uow,
    idempotency,
    images: publicImages,
    limiters: { adminImageUploads: rateLimiters.adminImageUploads },
    logger,
    pythonAi,
  });
  const appSettings = createAppSettingsModule({
    adminBasePath: `${API_PREFIX}/admin/application-settings`,
    adminAiBasePath: `${API_PREFIX}/admin/ai`,
    publicBasePath: `${API_PREFIX}/app`,
    db: database,
    uow,
    auditLogger: admin.repository,
    encryptionKey: process.env.AI_ENCRYPTION_KEY || config.security.hmacSecret,
    fallbackApiKey: config.gemini.apiKey,
    fallbackModel: config.gemini.fallbackModel,
  });

  /** Admin-configured primary/fallback model names for a feature; Python applies the fallback itself. */
  const resolveModelsFor =
    (feature: 'coach_chat' | 'voice_meal' | 'meal_photo' | 'coach_insights') => async (): Promise<{ primary: string; fallback: string | null }> => {
      try {
        const names = await appSettings.runtimeService.resolveModelNames(feature);
        return { primary: names.primaryModel, fallback: names.fallbackModel || null };
      } catch {
        // Admin config unreadable: use the environment's model names.
        return { primary: config.gemini.model, fallback: config.gemini.fallbackModel || null };
      }
    };

  const nutrition = createNutritionModule({
    memberBasePath: `${API_PREFIX}/nutrition`,
    adminBasePath: `${API_PREFIX}/admin/nutrition`,
    db: database,
    uow,
    mealPhotoAnalyzer: new PythonMealPhotoService({
      client: pythonAi,
      resolveModels: resolveModelsFor('meal_photo'),
      usageRecorder: appSettings.runtimeService,
      pythonTimeoutMs: aiBackend.timeoutMs,
      ...(logger ? { logger } : {}),
    }),
    voiceMealParser: new PythonVoiceMealService({
      client: pythonAi,
      resolveModels: resolveModelsFor('voice_meal'),
      usageRecorder: appSettings.runtimeService,
      pythonTimeoutMs: aiBackend.timeoutMs,
      ...(logger ? { logger } : {}),
    }),
    aiUsageGate: appSettings.aiUsageGate,
  });
  const progress = createProgressModule({
    basePath: `${API_PREFIX}/progress`,
    db: database,
    privateMedia,
    limiters: memberImageLimiters,
    ...(logger ? { logger } : {}),
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
  const dashboard = createDashboardModule({
    basePath: `${API_PREFIX}/dashboard`,
    db: database,
  });

  const knowledge = createKnowledgeModule(database, pythonAi, {
    adminBasePath: `${API_PREFIX}/admin/knowledge`,
    uploadLimiter: rateLimiters.adminImageUploads,
    ...(logger ? { logger } : {}),
  });

  const coach = createCoachModule({
    basePath: `${API_PREFIX}/coach`,
    internalToolsBasePath: `${API_PREFIX}/internal/tools`,
    serviceSecret: aiBackend.serviceSecret,
    db: database,
    chatService: new PythonCoachChatService({
      client: pythonAi,
      resolveModels: resolveModelsFor('coach_chat'),
      usageRecorder: appSettings.runtimeService,
      pythonTimeoutMs: aiBackend.timeoutMs,
      ...(logger ? { logger } : {}),
    }),
    insightsService: new PythonCoachInsightsService({
      client: pythonAi,
      resolveModels: resolveModelsFor('coach_insights'),
      usageRecorder: appSettings.runtimeService,
      pythonTimeoutMs: aiBackend.timeoutMs,
      ...(logger ? { logger } : {}),
    }),
    // Transcription has no AI quota gate (unchanged): only the aiCoach rate limiter and authentication.
    speechTranscriber: new PythonSpeechTranscriber({
      client: pythonAi,
      resolveModels: resolveModelsFor('coach_chat'),
      usageRecorder: appSettings.runtimeService,
      pythonTimeoutMs: aiBackend.timeoutMs,
      ...(logger ? { logger } : {}),
    }),
    extractor: new PythonMemoryExtractor({
      client: pythonAi,
      resolveModels: resolveModelsFor('coach_chat'),
      usageRecorder: appSettings.runtimeService,
      pythonTimeoutMs: aiBackend.timeoutMs,
      ...(logger ? { logger } : {}),
    }),
    aiUsageGate: appSettings.aiUsageGate,
    rateLimiter: rateLimiters.aiCoach,
    ...(logger ? { logger } : {}),
    sessionRepo: workouts.sessionRepo,
    personalRecordRepo: workouts.prRepo,
    exerciseRepo: workouts.exerciseRepo,
    mealRepo: nutrition.mealRepo,
    waterRepo: nutrition.waterRepo,
    targetAdapter: nutrition.targetAdapter,
    weightRepo: progress.weightRepo,
    knowledgeService: knowledge.service,
    profileRepo: profile.profileRepo,
  });

  const fcm = config.notifications.fcm;
  const pushSender: PushSender | null =
    overrides.pushSender !== undefined
      ? overrides.pushSender
      : fcm
        ? new FcmHttpV1Sender({
            credentials: {
              projectId: fcm.projectId,
              clientEmail: fcm.clientEmail,
              privateKey: fcm.privateKey,
              tokenUri: fcm.tokenUri,
            },
            dryRun: fcm.dryRun,
            timeoutMs: fcm.timeoutMs,
          })
        : null;
  const notifications = createNotificationsModule({
    memberBasePath: `${API_PREFIX}/notifications`,
    adminBasePath: `${API_PREFIX}/admin/notifications`,
    internalBasePath: `${API_PREFIX}/internal/notifications`,
    db: database,
    uow,
    idempotency,
    auditLogger: admin.repository,
    limiters: rateLimiters,
    sender: pushSender,
    dispatchSecret: config.notifications.dispatchSecret,
    dispatcher: {
      maxAttempts: config.notifications.dispatcher.maxAttempts,
      pollIntervalMs: config.notifications.dispatcher.pollIntervalMs,
    },
    images: publicImages,
    logger,
  });

  return {
    database,
    routeGroups: [
      health,
      auth.routes,
      users.routes,
      profile.routes,
      admin.routes,
      appSettings.adminRoutes,
      appSettings.adminAiRoutes,
      appSettings.publicRoutes,
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
      dashboard.routes,
      coach.routes,
      ...(coach.internalToolsRoutes ? [coach.internalToolsRoutes] : []),
      notifications.memberRoutes,
      notifications.adminRoutes,
      notifications.internalRoutes,
      ...(knowledge.adminRoutes ? [knowledge.adminRoutes] : []),
    ],
    authenticate: createAuthenticate(auth.authenticateAccessToken),
    rateLimiters,
    lifecycle,
    appSettings,
    notifications,
    privateMedia,
    knowledge,
    coach,
  };
}

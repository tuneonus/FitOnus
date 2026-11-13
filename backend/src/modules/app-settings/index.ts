import type { SqlExecutor } from '../../database/transaction.js';
import type { AiUsageGate } from '../../shared/ai/ai-usage.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { AdminAuditLoggerPort } from './application/ports.js';
import { GetAppSettingsUseCase } from './application/use-cases/get-app-settings.js';
import { UpdateAppSettingsUseCase } from './application/use-cases/update-app-settings.js';
import { GetPublicAppConfigUseCase } from './application/use-cases/get-public-app-config.js';
import { CheckAndRecordAiQuotaUseCase } from './application/use-cases/check-and-record-ai-quota.js';
import { GetGeminiConfigUseCase } from './application/use-cases/get-gemini-config.js';
import { UpdateGeminiConfigUseCase } from './application/use-cases/update-gemini-config.js';
import { TestGeminiConnectionUseCase } from './application/use-cases/test-gemini-connection.js';
import { RollbackGeminiKeyUseCase } from './application/use-cases/rollback-gemini-key.js';
import { GetGeminiUsageAnalyticsUseCases } from './application/use-cases/get-gemini-usage.js';
import { GeminiRuntimeService } from './application/services/gemini-runtime-service.js';
import { createAiRateLimiter } from '../../shared/ai/ai-rate-limit.js';
import { AiUsageGateService } from './application/services/ai-usage-gate.js';
import { PgAppSettingsRepository } from './infrastructure/pg-app-settings-repository.js';
import {
  createAppSettingsController,
  type AppSettingsController,
  type AppSettingsUseCases,
} from './interface/app-settings.controller.js';
import {
  createAdminAiRoutes,
  createAdminAppSettingsRoutes,
  createPublicAppConfigRoutes,
} from './interface/app-settings.routes.js';

export * from './domain/app-setting.js';
export * from './domain/gemini-config.js';
export * from './application/ports.js';
export * from './application/use-cases/get-app-settings.js';
export * from './application/use-cases/update-app-settings.js';
export * from './application/use-cases/get-public-app-config.js';
export * from './application/use-cases/check-and-record-ai-quota.js';
export * from './application/use-cases/get-gemini-config.js';
export * from './application/use-cases/update-gemini-config.js';
export * from './application/use-cases/test-gemini-connection.js';
export * from './application/use-cases/rollback-gemini-key.js';
export * from './application/use-cases/get-gemini-usage.js';
export * from './application/services/gemini-runtime-service.js';
export * from './application/services/ai-usage-gate.js';
export * from './infrastructure/pg-app-settings-repository.js';
export * from './interface/app-settings.schemas.js';
export * from './interface/app-settings.controller.js';
export * from './interface/app-settings.routes.js';

export interface AppSettingsModule {
  adminRoutes: RouteGroup;
  adminAiRoutes: RouteGroup;
  publicRoutes: RouteGroup;
  repository: PgAppSettingsRepository;
  runtimeService: GeminiRuntimeService;
  /** The only sanctioned way to reach Gemini: feature flags, atomic daily quotas, user attribution. */
  aiUsageGate: AiUsageGate;
  useCases: AppSettingsUseCases & { checkAndRecordAiQuota: CheckAndRecordAiQuotaUseCase };
  controller: AppSettingsController;
}

export interface CreateAppSettingsModuleOptions {
  adminBasePath: string;
  adminAiBasePath: string;
  publicBasePath: string;
  db: SqlExecutor;
  /** Must wrap the same `Database` as `db` (the AI quota reservation is transactional). */
  uow: UnitOfWork;
  auditLogger?: AdminAuditLoggerPort;
  encryptionKey: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
}

export function createAppSettingsModule(options: CreateAppSettingsModuleOptions): AppSettingsModule {
  const repository = new PgAppSettingsRepository(options.db, options.uow);

  const getAppSettings = new GetAppSettingsUseCase(repository);
  const updateAppSettings = new UpdateAppSettingsUseCase({
    repo: repository,
    auditLogger: options.auditLogger,
  });
  const getPublicAppConfig = new GetPublicAppConfigUseCase(repository);
  const checkAndRecordAiQuota = new CheckAndRecordAiQuotaUseCase(repository);
  // Per-user burst limiter (in-memory; see shared/ai/ai-rate-limit.ts for the multi-instance limitation).
  const aiUsageGate = new AiUsageGateService(checkAndRecordAiQuota, createAiRateLimiter());

  const getGeminiConfig = new GetGeminiConfigUseCase({
    repo: repository,
    fallbackApiKey: options.fallbackApiKey,
    fallbackModel: options.fallbackModel,
  });

  const updateGeminiConfig = new UpdateGeminiConfigUseCase({
    repo: repository,
    encryptionKey: options.encryptionKey,
    auditLogger: options.auditLogger,
  });

  const testGeminiConnection = new TestGeminiConnectionUseCase({
    repo: repository,
    encryptionKey: options.encryptionKey,
    fallbackApiKey: options.fallbackApiKey,
    fallbackModel: options.fallbackModel,
  });

  const rollbackGeminiKey = new RollbackGeminiKeyUseCase({
    repo: repository,
    auditLogger: options.auditLogger,
  });

  const geminiUsageAnalytics = new GetGeminiUsageAnalyticsUseCases(repository);

  const runtimeService = new GeminiRuntimeService({
    repo: repository,
    encryptionKey: options.encryptionKey,
    fallbackApiKey: options.fallbackApiKey,
    fallbackModel: options.fallbackModel,
  });

  const useCases = {
    getAppSettings,
    updateAppSettings,
    getPublicAppConfig,
    checkAndRecordAiQuota,
    getGeminiConfig,
    updateGeminiConfig,
    testGeminiConnection,
    rollbackGeminiKey,
    geminiUsageAnalytics,
  };

  const controller = createAppSettingsController(useCases);
  const adminRoutes = createAdminAppSettingsRoutes(options.adminBasePath, controller);
  const adminAiRoutes = createAdminAiRoutes(options.adminAiBasePath, controller);
  const publicRoutes = createPublicAppConfigRoutes(options.publicBasePath, controller);

  return {
    adminRoutes,
    adminAiRoutes,
    publicRoutes,
    repository,
    runtimeService,
    aiUsageGate,
    useCases,
    controller,
  };
}

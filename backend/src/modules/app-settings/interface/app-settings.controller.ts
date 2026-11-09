import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import { getValidated } from '../../../middleware/validate.js';
import type { AppSettingRecord, PublicAppConfig } from '../domain/app-setting.js';
import type {
  GeminiAdminConfigView,
  GeminiDailyTrendItem,
  GeminiFeatureUsage,
  GeminiModelInfo,
  GeminiModelUsage,
  GeminiUsageEvent,
  GeminiUsageSummary,
} from '../domain/gemini-config.js';
import type { GetAppSettingsResult, GetAppSettingsUseCase } from '../application/use-cases/get-app-settings.js';
import type { UpdateAppSettingsUseCase } from '../application/use-cases/update-app-settings.js';
import type { GetPublicAppConfigUseCase } from '../application/use-cases/get-public-app-config.js';
import type { GetGeminiConfigUseCase } from '../application/use-cases/get-gemini-config.js';
import type { UpdateGeminiConfigUseCase } from '../application/use-cases/update-gemini-config.js';
import type {
  TestGeminiConnectionResult,
  TestGeminiConnectionUseCase,
} from '../application/use-cases/test-gemini-connection.js';
import type { RollbackGeminiKeyUseCase } from '../application/use-cases/rollback-gemini-key.js';
import type { GetGeminiUsageAnalyticsUseCases } from '../application/use-cases/get-gemini-usage.js';
import {
  getGeminiUsageEventsRequest,
  rollbackGeminiKeyRequest,
  testGeminiConnectionRequest,
  updateAppSettingsRequest,
  updateGeminiConfigRequest,
} from './app-settings.schemas.js';

export interface AppSettingsUseCases {
  getAppSettings: GetAppSettingsUseCase;
  updateAppSettings: UpdateAppSettingsUseCase;
  getPublicAppConfig: GetPublicAppConfigUseCase;
  getGeminiConfig: GetGeminiConfigUseCase;
  updateGeminiConfig: UpdateGeminiConfigUseCase;
  testGeminiConnection: TestGeminiConnectionUseCase;
  rollbackGeminiKey: RollbackGeminiKeyUseCase;
  geminiUsageAnalytics: GetGeminiUsageAnalyticsUseCases;
}

export interface AppSettingsController {
  getAdminSettings: (req: Request) => Promise<RouteResult<GetAppSettingsResult>>;
  updateAdminSettings: (req: Request) => Promise<RouteResult<AppSettingRecord[]>>;
  getPublicConfig: (req: Request) => Promise<RouteResult<PublicAppConfig>>;

  // Gemini AI Endpoints
  getGeminiConfig: (req: Request) => Promise<RouteResult<GeminiAdminConfigView>>;
  updateGeminiConfig: (req: Request) => Promise<RouteResult<GeminiAdminConfigView>>;
  testGeminiConnection: (req: Request) => Promise<RouteResult<TestGeminiConnectionResult>>;
  rollbackGeminiKey: (req: Request) => Promise<RouteResult<GeminiAdminConfigView>>;
  getGeminiModels: (req: Request) => Promise<RouteResult<GeminiModelInfo[]>>;
  getGeminiUsageSummary: (req: Request) => Promise<RouteResult<GeminiUsageSummary>>;
  getGeminiUsageByFeature: (req: Request) => Promise<RouteResult<GeminiFeatureUsage[]>>;
  getGeminiUsageByModel: (req: Request) => Promise<RouteResult<GeminiModelUsage[]>>;
  getGeminiDailyTrends: (req: Request) => Promise<RouteResult<GeminiDailyTrendItem[]>>;
  getGeminiUsageEvents: (
    req: Request,
  ) => Promise<
    RouteResult<{
      items: GeminiUsageEvent[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>
  >;
}

export function createAppSettingsController(useCases: AppSettingsUseCases): AppSettingsController {
  return {
    getAdminSettings: async (req: Request): Promise<RouteResult<GetAppSettingsResult>> => {
      const actor = requireActor(req);
      const data = await useCases.getAppSettings.execute(actor);
      return {
        data,
        message: 'Application settings retrieved successfully',
      };
    },

    updateAdminSettings: async (req: Request): Promise<RouteResult<AppSettingRecord[]>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, updateAppSettingsRequest);
      const data = await useCases.updateAppSettings.execute(actor, body, {
        ip: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      });
      return {
        data,
        message: 'Application settings updated successfully',
      };
    },

    getPublicConfig: async (_req: Request): Promise<RouteResult<PublicAppConfig>> => {
      const data = await useCases.getPublicAppConfig.execute();
      return {
        data,
        message: 'Application configuration retrieved',
      };
    },

    getGeminiConfig: async (req: Request): Promise<RouteResult<GeminiAdminConfigView>> => {
      const actor = requireActor(req);
      const data = await useCases.getGeminiConfig.execute(actor);
      return {
        data,
        message: 'Gemini configuration retrieved',
      };
    },

    updateGeminiConfig: async (req: Request): Promise<RouteResult<GeminiAdminConfigView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, updateGeminiConfigRequest);
      const data = await useCases.updateGeminiConfig.execute(actor, body, {
        ip: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      });
      return {
        data,
        message: 'Gemini configuration updated successfully',
      };
    },

    testGeminiConnection: async (req: Request): Promise<RouteResult<TestGeminiConnectionResult>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, testGeminiConnectionRequest);
      const data = await useCases.testGeminiConnection.execute(actor, body);
      return {
        data,
        message: data.success ? 'Gemini connection verified' : 'Gemini connection failed',
      };
    },

    rollbackGeminiKey: async (req: Request): Promise<RouteResult<GeminiAdminConfigView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, rollbackGeminiKeyRequest);
      const data = await useCases.rollbackGeminiKey.execute(actor, body?.expectedVersion, {
        ip: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      });
      return {
        data,
        message: 'Gemini API key rolled back to previous version',
      };
    },

    getGeminiModels: async (req: Request): Promise<RouteResult<GeminiModelInfo[]>> => {
      const actor = requireActor(req);
      const data = await useCases.geminiUsageAnalytics.getModels(actor);
      return {
        data,
        message: 'Gemini models and pricing retrieved',
      };
    },

    getGeminiUsageSummary: async (req: Request): Promise<RouteResult<GeminiUsageSummary>> => {
      const actor = requireActor(req);
      const data = await useCases.geminiUsageAnalytics.getSummary(actor);
      return {
        data,
        message: 'Gemini usage summary retrieved',
      };
    },

    getGeminiUsageByFeature: async (req: Request): Promise<RouteResult<GeminiFeatureUsage[]>> => {
      const actor = requireActor(req);
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const data = await useCases.geminiUsageAnalytics.getByFeature(actor, from, to);
      return {
        data,
        message: 'Gemini usage by feature retrieved',
      };
    },

    getGeminiUsageByModel: async (req: Request): Promise<RouteResult<GeminiModelUsage[]>> => {
      const actor = requireActor(req);
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const data = await useCases.geminiUsageAnalytics.getByModel(actor, from, to);
      return {
        data,
        message: 'Gemini usage by model retrieved',
      };
    },

    getGeminiDailyTrends: async (req: Request): Promise<RouteResult<GeminiDailyTrendItem[]>> => {
      const actor = requireActor(req);
      const days = req.query.days ? parseInt(String(req.query.days), 10) : 14;
      const data = await useCases.geminiUsageAnalytics.getDailyTrends(actor, days);
      return {
        data,
        message: 'Gemini daily trends retrieved',
      };
    },

    getGeminiUsageEvents: async (
      req: Request,
    ): Promise<
      RouteResult<{
        items: GeminiUsageEvent[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>
    > => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getGeminiUsageEventsRequest);
      const data = await useCases.geminiUsageAnalytics.getEvents(actor, query);
      return {
        data,
        message: 'Gemini usage events retrieved',
      };
    },
  };
}

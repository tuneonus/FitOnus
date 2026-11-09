import type {
  AiUsageActionType,
  AiUsageStats,
  AppSettingKey,
  AppSettingRecord,
  AppSettingValueMap,
  PublicAppConfig,
} from '../domain/app-setting.js';
import type {
  GeminiConfigRecord,
  GeminiDailyTrendItem,
  GeminiFeatureUsage,
  GeminiModelInfo,
  GeminiModelUsage,
  GeminiUsageEvent,
  GeminiUsageSummary,
} from '../domain/gemini-config.js';

export interface AppSettingsRepository {
  getAllSettings(): Promise<AppSettingRecord[]>;
  getSettingByKey<K extends AppSettingKey>(key: K): Promise<AppSettingRecord<K> | null>;
  updateSetting<K extends AppSettingKey>(
    key: K,
    value: AppSettingValueMap[K],
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<AppSettingRecord<K>>;
  getPublicConfig(): Promise<PublicAppConfig>;
  getTodayAiUsageStats(): Promise<AiUsageStats>;
  getUserTodayAiUsage(userId: string, actionType: AiUsageActionType): Promise<number>;
  incrementUserAiUsage(userId: string, actionType: AiUsageActionType): Promise<number>;

  // Gemini Configuration & Model Management
  getGeminiConfig(): Promise<GeminiConfigRecord>;
  updateGeminiConfig(
    updates: Partial<GeminiConfigRecord>,
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<GeminiConfigRecord>;
  rollbackGeminiApiKey(
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<GeminiConfigRecord>;
  getGeminiModelsWithPricing(): Promise<GeminiModelInfo[]>;

  // Gemini Usage Telemetry & Analytics
  recordGeminiUsage(event: Omit<GeminiUsageEvent, 'id' | 'createdAt'>): Promise<void>;
  getGeminiUsageEvents(filters: {
    feature?: string;
    model?: string;
    status?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: GeminiUsageEvent[]; total: number }>;
  getGeminiUsageSummary(): Promise<GeminiUsageSummary>;
  getGeminiUsageByFeature(from?: string, to?: string): Promise<GeminiFeatureUsage[]>;
  getGeminiUsageByModel(from?: string, to?: string): Promise<GeminiModelUsage[]>;
  getGeminiDailyTrends(days?: number): Promise<GeminiDailyTrendItem[]>;
}

export interface AdminAuditLoggerPort {
  recordAuditLog(entry: {
    adminId: string;
    action: any;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<unknown>;
}

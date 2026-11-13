import type {
  AiUsageActionType,
  AiUsageReserveInput,
  AiUsageReserveResult,
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
  /**
   * Atomically checks both daily limits and, only when neither is reached, adds one unit.
   * Concurrent calls for the same user are serialised, so the limits cannot be exceeded by
   * parallel requests. Never implement this as a separate read followed by a write.
   */
  reserveAiUsage(input: AiUsageReserveInput): Promise<AiUsageReserveResult>;
  /** Returns one previously reserved unit (never below zero) for the day it was reserved on. */
  releaseAiUsage(input: { userId: string; actionType: AiUsageActionType; usageDate: string }): Promise<void>;

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

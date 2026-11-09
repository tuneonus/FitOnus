export type GeminiFeature =
  | 'coach_chat'
  | 'coach_insights'
  | 'meal_photo'
  | 'voice_meal'
  | 'workout_generator';

export interface GeminiConfigRecord {
  provider: string;
  encryptedApiKey: string | null;
  keyMask: string | null;
  previousEncryptedApiKey: string | null;
  previousKeyMask: string | null;
  defaultModel: string;
  coachModel: string;
  mealPhotoModel: string;
  voiceMealModel: string;
  workoutGeneratorModel: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface GeminiAdminConfigView {
  provider: string;
  keyMask: string;
  isConfigured: boolean;
  canRollbackKey: boolean;
  defaultModel: string;
  featureModels: {
    aiCoach: string;
    mealPhotoScanner: string;
    voiceMealEntry: string;
    workoutGenerator: string;
  };
  version: number;
  updatedBy: string | null;
  updatedAt: string;
  connectionStatus: 'connected' | 'not_configured' | 'error';
}

export interface GeminiModelInfo {
  model: string;
  displayName: string;
  capabilities: {
    text: boolean;
    vision: boolean;
    audio: boolean;
  };
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  isDefault: boolean;
}

export interface GeminiUsageEvent {
  id: string;
  requestId: string;
  userId: string | null;
  feature: GeminiFeature | string;
  model: string;
  status: 'success' | 'failed' | 'rate_limited' | 'timeout';
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  errorCategory?: string | null;
  providerRequestId?: string | null;
  createdAt: string;
}

export interface GeminiUsageSummary {
  todayRequests: number;
  monthlyRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedMonthlyCostUsd: number;
  failedRequests: number;
  avgDurationMs: number;
}

export interface GeminiFeatureUsage {
  feature: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface GeminiModelUsage {
  model: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface GeminiDailyTrendItem {
  date: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

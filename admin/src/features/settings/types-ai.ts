export interface GeminiConfigResponse {
  provider: string;
  keyMask: string | null;
  isConfigured: boolean;
  canRollbackKey: boolean;
  hasActiveKey?: boolean;
  hasPreviousKey?: boolean;
  previousKeyMask?: string | null;
  source?: 'database' | 'environment' | 'unconfigured';
  defaultModel: string;
  featureModels?: {
    aiCoach: string;
    mealPhotoScanner: string;
    voiceMealEntry: string;
    workoutGenerator: string;
  };
  coachModel?: string;
  mealPhotoModel?: string;
  voiceMealModel?: string;
  workoutGeneratorModel?: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
  connectionStatus?: 'connected' | 'not_configured';
}

export interface UpdateGeminiConfigPayload {
  apiKey?: string;
  defaultModel?: string;
  featureModels?: {
    aiCoach?: string;
    mealPhotoScanner?: string;
    voiceMealEntry?: string;
    workoutGenerator?: string;
  };
  coachModel?: string;
  mealPhotoModel?: string;
  voiceMealModel?: string;
  workoutGeneratorModel?: string;
  expectedVersion?: number;
}

export interface TestGeminiConnectionPayload {
  apiKey?: string;
  model?: string;
}

export interface TestGeminiConnectionResponse {
  success: boolean;
  latencyMs: number;
  model: string;
  message: string;
  testedAt: string;
}

export interface RollbackGeminiKeyPayload {
  expectedVersion?: number;
}

export interface GeminiModelInfo {
  model: string;
  id?: string;
  displayName: string;
  description?: string;
  capabilities?: {
    text: boolean;
    vision: boolean;
    audio: boolean;
  };
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPricePerMillion?: number;
  supportsVision?: boolean;
  supportsAudio?: boolean;
  isRecommendedDefault?: boolean;
  isDefault?: boolean;
}

export interface GeminiUsageSummaryResponse {
  todayRequests: number;
  monthlyRequests?: number;
  monthRequests?: number;
  totalTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  estimatedMonthlyCostUsd?: number;
  estimatedCostUsd?: number;
  estimatedCostInr?: number;
  failedRequests: number;
  avgDurationMs: number;
}

export interface FeatureUsageBreakdown {
  feature: string;
  requestCount: number;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd: number;
}

export interface ModelUsageBreakdown {
  model: string;
  requestCount: number;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd: number;
}

export interface DailyUsageTrend {
  date: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
}

export interface GeminiUsageEventItem {
  id: string;
  requestId?: string;
  userId?: string | null;
  feature: string;
  model: string;
  status: string;
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  durationMs: number;
  estimatedCostUsd: number;
  errorCategory?: string | null;
  createdAt: string;
}

export interface GeminiUsageEventsResponse {
  events?: GeminiUsageEventItem[];
  items?: GeminiUsageEventItem[];
  total: number;
  limit: number;
  offset?: number;
  page?: number;
  totalPages?: number;
}

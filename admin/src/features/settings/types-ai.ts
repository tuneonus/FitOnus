export interface GeminiConfigResponse {
  provider: string;
  hasActiveKey: boolean;
  keyMask: string | null;
  hasPreviousKey: boolean;
  previousKeyMask: string | null;
  source: 'database' | 'environment' | 'unconfigured';
  defaultModel: string;
  coachModel: string;
  mealPhotoModel: string;
  voiceMealModel: string;
  workoutGeneratorModel: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface UpdateGeminiConfigPayload {
  apiKey?: string;
  defaultModel?: string;
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
  id: string;
  displayName: string;
  description: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  supportsVision: boolean;
  supportsAudio: boolean;
  isRecommendedDefault: boolean;
}

export interface GeminiUsageSummaryResponse {
  todayRequests: number;
  monthRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  estimatedCostInr: number;
  failedRequests: number;
  avgDurationMs: number;
}

export interface FeatureUsageBreakdown {
  feature: string;
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}

export interface ModelUsageBreakdown {
  model: string;
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
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
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  estimatedCostUsd: number;
  status: 'success' | 'error';
  errorCategory: string | null;
  createdAt: string;
}

export interface GeminiUsageEventsResponse {
  events: GeminiUsageEventItem[];
  total: number;
  limit: number;
  offset: number;
}

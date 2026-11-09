import { z } from 'zod';

export const maintenanceSettingSchema = z.strictObject({
  enabled: z.boolean(),
  message: z.string().min(1, 'Maintenance message is required').max(500),
  expectedEndTime: z.string().nullable(),
});

export const minVersionSettingSchema = z.strictObject({
  androidMinVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver formatted (e.g. 1.0.0)'),
});

export const forceUpdateSettingSchema = z.strictObject({
  enabled: z.boolean(),
  updateMessage: z.string().min(1, 'Update message is required').max(500),
  storeUrl: z.string().max(500),
});

export const supportSettingSchema = z.strictObject({
  email: z.string().max(255),
  website: z.string().max(500),
  contactInfo: z.string().max(500),
});

export const legalSettingSchema = z.strictObject({
  privacyPolicyUrl: z.string().max(500),
  termsOfServiceUrl: z.string().max(500),
});

export const featureFlagsSettingSchema = z.strictObject({
  aiCoach: z.boolean(),
  mealPhotoScanner: z.boolean(),
  voiceMealEntry: z.boolean(),
  workoutGenerator: z.boolean(),
});

export const aiLimitsSettingSchema = z.strictObject({
  dailyGlobalLimit: z.number().int().min(1).max(1000),
  coachChatDailyLimit: z.number().int().min(1).max(500),
  mealPhotoDailyLimit: z.number().int().min(1).max(200),
  voiceMealDailyLimit: z.number().int().min(1).max(200),
  workoutGeneratorDailyLimit: z.number().int().min(1).max(200),
});

export const settingUpdateItemSchema = z.discriminatedUnion('key', [
  z.strictObject({
    key: z.literal('app.maintenance'),
    value: maintenanceSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({
    key: z.literal('app.min_version'),
    value: minVersionSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({
    key: z.literal('app.force_update'),
    value: forceUpdateSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({
    key: z.literal('app.support'),
    value: supportSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({
    key: z.literal('app.legal'),
    value: legalSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({
    key: z.literal('features.flags'),
    value: featureFlagsSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.strictObject({
    key: z.literal('ai.limits'),
    value: aiLimitsSettingSchema,
    expectedVersion: z.number().int().positive().optional(),
  }),
]);

export const updateAppSettingsRequest = {
  body: z.strictObject({
    settings: z.array(settingUpdateItemSchema).min(1, 'At least one setting must be provided').max(10),
  }),
};

export const appSettingRecordSchema = z.object({
  key: z.string(),
  category: z.string(),
  value: z.unknown(),
  description: z.string().nullable(),
  updatedBy: z.string().nullable(),
  updatedAt: z.union([z.string(), z.date().transform((d) => d.toISOString())]),
  version: z.number().int(),
});

export const getAppSettingsResponseSchema = z.object({
  settings: z.array(appSettingRecordSchema),
  aiUsageStats: z.object({
    todayTotalRequests: z.number().int(),
    todayActiveAiUsers: z.number().int(),
    breakdownByAction: z.record(z.string(), z.number().int()),
  }),
});

export const publicAppConfigSchema = z.object({
  maintenance: maintenanceSettingSchema,
  minVersion: minVersionSettingSchema,
  forceUpdate: forceUpdateSettingSchema,
  support: supportSettingSchema,
  legal: legalSettingSchema,
  features: featureFlagsSettingSchema,
  aiLimits: aiLimitsSettingSchema,
});

// =========================================================================
// GEMINI CONFIGURATION & TELEMETRY SCHEMAS
// =========================================================================

export const geminiAdminConfigResponseSchema = z.object({
  provider: z.string(),
  keyMask: z.string(),
  isConfigured: z.boolean(),
  canRollbackKey: z.boolean(),
  defaultModel: z.string(),
  featureModels: z.object({
    aiCoach: z.string(),
    mealPhotoScanner: z.string(),
    voiceMealEntry: z.string(),
    workoutGenerator: z.string(),
  }),
  version: z.number().int(),
  updatedBy: z.string().nullable(),
  updatedAt: z.union([z.string(), z.date().transform((d) => d.toISOString())]),
  connectionStatus: z.enum(['connected', 'not_configured', 'error']),
});

export const updateGeminiConfigRequest = {
  body: z.strictObject({
    apiKey: z.string().min(15, 'API key must be at least 15 characters').optional(),
    defaultModel: z.string().min(1).max(64).optional(),
    featureModels: z
      .strictObject({
        aiCoach: z.string().min(1).max(64).optional(),
        mealPhotoScanner: z.string().min(1).max(64).optional(),
        voiceMealEntry: z.string().min(1).max(64).optional(),
        workoutGenerator: z.string().min(1).max(64).optional(),
      })
      .optional(),
    expectedVersion: z.number().int().positive().optional(),
  }),
};

export const testGeminiConnectionRequest = {
  body: z.strictObject({
    apiKey: z.string().optional(),
    model: z.string().optional(),
  }),
};

export const testGeminiConnectionResponseSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number().optional(),
  modelUsed: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export const rollbackGeminiKeyRequest = {
  body: z.strictObject({
    expectedVersion: z.number().int().positive().optional(),
  }),
};

export const geminiModelInfoSchema = z.object({
  model: z.string(),
  displayName: z.string(),
  capabilities: z.object({
    text: z.boolean(),
    vision: z.boolean(),
    audio: z.boolean(),
  }),
  inputPricePerMillion: z.number(),
  outputPricePerMillion: z.number(),
  cachedInputPricePerMillion: z.number(),
  isDefault: z.boolean(),
});

export const geminiUsageSummaryResponseSchema = z.object({
  todayRequests: z.number().int(),
  monthlyRequests: z.number().int(),
  totalTokens: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedTokens: z.number().int(),
  estimatedMonthlyCostUsd: z.number(),
  failedRequests: z.number().int(),
  avgDurationMs: z.number().int(),
});

export const geminiFeatureUsageSchema = z.object({
  feature: z.string(),
  requestCount: z.number().int(),
  totalTokens: z.number().int(),
  estimatedCostUsd: z.number(),
});

export const geminiModelUsageSchema = z.object({
  model: z.string(),
  requestCount: z.number().int(),
  totalTokens: z.number().int(),
  estimatedCostUsd: z.number(),
});

export const geminiDailyTrendItemSchema = z.object({
  date: z.string(),
  requestCount: z.number().int(),
  totalTokens: z.number().int(),
  estimatedCostUsd: z.number(),
});

export const geminiUsageEventSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  userId: z.string().nullable(),
  feature: z.string(),
  model: z.string(),
  status: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedTokens: z.number().int(),
  totalTokens: z.number().int(),
  estimatedCostUsd: z.number(),
  durationMs: z.number().int(),
  errorCategory: z.string().nullable().optional(),
  providerRequestId: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date().transform((d) => d.toISOString())]),
});

export const getGeminiUsageEventsRequest = {
  query: z.object({
    feature: z.string().optional(),
    model: z.string().optional(),
    status: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const getGeminiUsageEventsResponseSchema = z.object({
  items: z.array(geminiUsageEventSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});


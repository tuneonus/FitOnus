import type { SqlExecutor } from '../../../database/transaction.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type {
  AiLimitsSettingValue,
  AiUsageActionType,
  AiUsageStats,
  AppSettingKey,
  AppSettingRecord,
  AppSettingValueMap,
  FeatureFlagsSettingValue,
  ForceUpdateSettingValue,
  LegalSettingValue,
  MaintenanceSettingValue,
  MinVersionSettingValue,
  PublicAppConfig,
  SupportSettingValue,
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
import type { AppSettingsRepository } from '../application/ports.js';

interface AppSettingRow {
  key: string;
  category: string;
  value: any;
  description: string | null;
  updated_by: string | null;
  updated_at: Date;
  version: number;
}

export class PgAppSettingsRepository implements AppSettingsRepository {
  constructor(private readonly db: SqlExecutor) {}

  private mapRow(row: AppSettingRow): AppSettingRecord {
    return {
      key: row.key as AppSettingKey,
      category: row.category,
      value: row.value,
      description: row.description,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      version: row.version,
    };
  }

  async getAllSettings(): Promise<AppSettingRecord[]> {
    const res = await this.db.query<AppSettingRow>(
      `SELECT key, category, value, description, updated_by, updated_at, version
       FROM app_settings
       ORDER BY category, key`,
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async getSettingByKey<K extends AppSettingKey>(key: K): Promise<AppSettingRecord<K> | null> {
    const res = await this.db.query<AppSettingRow>(
      `SELECT key, category, value, description, updated_by, updated_at, version
       FROM app_settings
       WHERE key = $1`,
      [key],
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]!) as AppSettingRecord<K>;
  }

  async updateSetting<K extends AppSettingKey>(
    key: K,
    value: AppSettingValueMap[K],
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<AppSettingRecord<K>> {
    if (expectedVersion !== undefined) {
      const res = await this.db.query<AppSettingRow>(
        `UPDATE app_settings
         SET value = $1, version = version + 1, updated_by = $2, updated_at = NOW()
         WHERE key = $3 AND version = $4
         RETURNING key, category, value, description, updated_by, updated_at, version`,
        [JSON.stringify(value), updatedBy ?? null, key, expectedVersion],
      );

      if (res.rows.length === 0) {
        // Check if key exists to distinguish 404 from 409
        const existsRes = await this.db.query<{ version: number }>(
          `SELECT version FROM app_settings WHERE key = $1`,
          [key],
        );
        if (existsRes.rows.length === 0) {
          throw new AppError('not_found', 'NOT_FOUND', `Setting '${key}' was not found.`);
        }
        throw new AppError(
          'conflict',
          'VERSION_CONFLICT',
          `Setting '${key}' has been modified by another administrator (current version ${existsRes.rows[0]!.version}, expected ${expectedVersion}). Please refresh and try again.`,
        );
      }
      return this.mapRow(res.rows[0]!) as AppSettingRecord<K>;
    }

    const res = await this.db.query<AppSettingRow>(
      `UPDATE app_settings
       SET value = $1, version = version + 1, updated_by = $2, updated_at = NOW()
       WHERE key = $3
       RETURNING key, category, value, description, updated_by, updated_at, version`,
      [JSON.stringify(value), updatedBy ?? null, key],
    );

    if (res.rows.length === 0) {
      throw new AppError('not_found', 'NOT_FOUND', `Setting '${key}' was not found.`);
    }

    return this.mapRow(res.rows[0]!) as AppSettingRecord<K>;
  }

  async getPublicConfig(): Promise<PublicAppConfig> {
    const all = await this.getAllSettings();
    const map = new Map<string, any>(all.map((s) => [s.key, s.value]));

    const maintenance: MaintenanceSettingValue = map.get('app.maintenance') ?? {
      enabled: false,
      message: 'FitOnus is currently undergoing scheduled maintenance. Please check back shortly.',
      expectedEndTime: null,
    };

    const minVersion: MinVersionSettingValue = map.get('app.min_version') ?? {
      androidMinVersion: '1.0.0',
    };

    const forceUpdate: ForceUpdateSettingValue = map.get('app.force_update') ?? {
      enabled: false,
      updateMessage: 'A new version of FitOnus is required to continue.',
      storeUrl: '',
    };

    const support: SupportSettingValue = map.get('app.support') ?? {
      email: '',
      website: '',
      contactInfo: '',
    };

    const legal: LegalSettingValue = map.get('app.legal') ?? {
      privacyPolicyUrl: '',
      termsOfServiceUrl: '',
    };

    const features: FeatureFlagsSettingValue = map.get('features.flags') ?? {
      aiCoach: true,
      mealPhotoScanner: true,
      voiceMealEntry: true,
      workoutGenerator: true,
    };

    const aiLimits: AiLimitsSettingValue = map.get('ai.limits') ?? {
      dailyGlobalLimit: 50,
      coachChatDailyLimit: 20,
      mealPhotoDailyLimit: 10,
      voiceMealDailyLimit: 10,
      workoutGeneratorDailyLimit: 10,
    };

    return {
      maintenance,
      minVersion,
      forceUpdate,
      support,
      legal,
      features,
      aiLimits,
    };
  }

  async getTodayAiUsageStats(): Promise<AiUsageStats> {
    const res = await this.db.query<{
      today_total_requests: number;
      today_active_ai_users: number;
    }>(
      `SELECT
         COALESCE(SUM(request_count), 0)::int AS today_total_requests,
         COUNT(DISTINCT user_id)::int AS today_active_ai_users
       FROM user_ai_usage
       WHERE usage_date = CURRENT_DATE`,
    );

    const breakdownRes = await this.db.query<{
      action_type: AiUsageActionType;
      total: number;
    }>(
      `SELECT
         action_type,
         COALESCE(SUM(request_count), 0)::int AS total
       FROM user_ai_usage
       WHERE usage_date = CURRENT_DATE
       GROUP BY action_type`,
    );

    const breakdown: Record<AiUsageActionType, number> = {
      coach_chat: 0,
      meal_photo: 0,
      voice_meal: 0,
      workout_generator: 0,
    };

    for (const r of breakdownRes.rows) {
      if (r.action_type in breakdown) {
        breakdown[r.action_type] = r.total;
      }
    }

    const row = res.rows[0];
    return {
      todayTotalRequests: row?.today_total_requests ?? 0,
      todayActiveAiUsers: row?.today_active_ai_users ?? 0,
      breakdownByAction: breakdown,
    };
  }

  async getUserTodayAiUsage(userId: string, actionType: AiUsageActionType): Promise<number> {
    const res = await this.db.query<{ request_count: number }>(
      `SELECT request_count
       FROM user_ai_usage
       WHERE user_id = $1 AND usage_date = CURRENT_DATE AND action_type = $2`,
      [userId, actionType],
    );
    return res.rows[0]?.request_count ?? 0;
  }

  async incrementUserAiUsage(userId: string, actionType: AiUsageActionType): Promise<number> {
    const res = await this.db.query<{ request_count: number }>(
      `INSERT INTO user_ai_usage (user_id, usage_date, action_type, count, updated_at)
       VALUES ($1, CURRENT_DATE, $2, 1, NOW())
       ON CONFLICT (user_id, usage_date, action_type)
       DO UPDATE SET count = user_ai_usage.count + 1, updated_at = NOW()
       RETURNING count as request_count`,
      [userId, actionType],
    );
    return res.rows[0]!.request_count;
  }

  // =========================================================================
  // GEMINI CONFIGURATION & MODEL MANAGEMENT
  // =========================================================================

  private mapGeminiConfigRow(row: any): GeminiConfigRecord {
    return {
      provider: row.provider,
      encryptedApiKey: row.encrypted_api_key ?? null,
      keyMask: row.key_mask ?? null,
      previousEncryptedApiKey: row.previous_encrypted_api_key ?? null,
      previousKeyMask: row.previous_key_mask ?? null,
      defaultModel: row.default_model || 'gemini-2.5-flash',
      coachModel: row.coach_model || row.default_model || 'gemini-2.5-flash',
      mealPhotoModel: row.meal_photo_model || row.default_model || 'gemini-2.5-flash',
      voiceMealModel: row.voice_meal_model || row.default_model || 'gemini-2.5-flash',
      workoutGeneratorModel: row.workout_generator_model || row.default_model || 'gemini-2.5-flash',
      version: row.version,
      updatedBy: row.updated_by ?? null,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  async getGeminiConfig(): Promise<GeminiConfigRecord> {
    const res = await this.db.query(
      `SELECT provider, encrypted_api_key, key_mask, previous_encrypted_api_key, previous_key_mask,
              default_model, coach_model, meal_photo_model, voice_meal_model, workout_generator_model,
              version, updated_by, updated_at
       FROM gemini_config
       WHERE provider = 'google_gemini'`,
    );

    if (res.rows.length === 0) {
      const inserted = await this.db.query(
        `INSERT INTO gemini_config (provider, default_model, coach_model, meal_photo_model, voice_meal_model, workout_generator_model, version)
         VALUES ('google_gemini', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 1)
         ON CONFLICT (provider) DO UPDATE SET updated_at = NOW()
         RETURNING provider, encrypted_api_key, key_mask, previous_encrypted_api_key, previous_key_mask,
                   default_model, coach_model, meal_photo_model, voice_meal_model, workout_generator_model,
                   version, updated_by, updated_at`,
      );
      return this.mapGeminiConfigRow(inserted.rows[0]);
    }

    return this.mapGeminiConfigRow(res.rows[0]);
  }

  async updateGeminiConfig(
    updates: Partial<GeminiConfigRecord>,
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<GeminiConfigRecord> {
    const setClauses: string[] = ['updated_at = NOW()', 'version = version + 1'];
    const values: any[] = [];
    let idx = 1;

    if (updates.encryptedApiKey !== undefined) {
      setClauses.push(`encrypted_api_key = $${idx++}`);
      values.push(updates.encryptedApiKey);
    }
    if (updates.keyMask !== undefined) {
      setClauses.push(`key_mask = $${idx++}`);
      values.push(updates.keyMask);
    }
    if (updates.previousEncryptedApiKey !== undefined) {
      setClauses.push(`previous_encrypted_api_key = $${idx++}`);
      values.push(updates.previousEncryptedApiKey);
    }
    if (updates.previousKeyMask !== undefined) {
      setClauses.push(`previous_key_mask = $${idx++}`);
      values.push(updates.previousKeyMask);
    }
    if (updates.defaultModel !== undefined) {
      setClauses.push(`default_model = $${idx++}`);
      values.push(updates.defaultModel);
    }
    if (updates.coachModel !== undefined) {
      setClauses.push(`coach_model = $${idx++}`);
      values.push(updates.coachModel);
    }
    if (updates.mealPhotoModel !== undefined) {
      setClauses.push(`meal_photo_model = $${idx++}`);
      values.push(updates.mealPhotoModel);
    }
    if (updates.voiceMealModel !== undefined) {
      setClauses.push(`voice_meal_model = $${idx++}`);
      values.push(updates.voiceMealModel);
    }
    if (updates.workoutGeneratorModel !== undefined) {
      setClauses.push(`workout_generator_model = $${idx++}`);
      values.push(updates.workoutGeneratorModel);
    }
    if (updatedBy !== undefined) {
      setClauses.push(`updated_by = $${idx++}`);
      values.push(updatedBy);
    }

    let whereClause = `WHERE provider = 'google_gemini'`;
    if (expectedVersion !== undefined) {
      whereClause += ` AND version = $${idx++}`;
      values.push(expectedVersion);
    }

    const query = `
      UPDATE gemini_config
      SET ${setClauses.join(', ')}
      ${whereClause}
      RETURNING provider, encrypted_api_key, key_mask, previous_encrypted_api_key, previous_key_mask,
                default_model, coach_model, meal_photo_model, voice_meal_model, workout_generator_model,
                version, updated_by, updated_at
    `;

    const res = await this.db.query(query, values);
    if (res.rows.length === 0) {
      throw new AppError(
        'conflict',
        'VERSION_CONFLICT',
        'Gemini configuration was modified by another administrator. Please refresh and try again.',
      );
    }

    return this.mapGeminiConfigRow(res.rows[0]);
  }

  async rollbackGeminiApiKey(
    expectedVersion?: number,
    updatedBy?: string,
  ): Promise<GeminiConfigRecord> {
    const current = await this.getGeminiConfig();
    if (!current.previousEncryptedApiKey) {
      throw new AppError(
        'bad_request',
        'BAD_REQUEST',
        'No previous Gemini API key is available for rollback.',
      );
    }

    return this.updateGeminiConfig(
      {
        encryptedApiKey: current.previousEncryptedApiKey,
        keyMask: current.previousKeyMask,
        previousEncryptedApiKey: current.encryptedApiKey,
        previousKeyMask: current.keyMask,
      },
      expectedVersion,
      updatedBy,
    );
  }

  async getGeminiModelsWithPricing(): Promise<GeminiModelInfo[]> {
    const res = await this.db.query<{
      model: string;
      input_price_per_million: string | number;
      output_price_per_million: string | number;
      cached_input_price_per_million: string | number;
    }>(
      `SELECT model, input_price_per_million, output_price_per_million, cached_input_price_per_million
       FROM gemini_pricing
       ORDER BY model ASC`,
    );

    const modelDisplayNames: Record<string, string> = {
      'gemini-3.5-flash': 'Gemini 3.5 Flash (Fast, Multimodal, Recommended)',
      'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite (Lightweight, High-Volume)',
      'gemini-2.5-flash': 'Gemini 2.5 Flash (Fast, Multimodal)',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite (Lightweight, High-Volume)',
      'gemini-2.5-pro': 'Gemini 2.5 Pro (Deep Reasoning & Analysis)',
      'gemini-2.0-flash': 'Gemini 2.0 Flash (Stable Multimodal)',
      'gemini-1.5-flash': 'Gemini 1.5 Flash (Legacy Fast)',
      'gemini-1.5-pro': 'Gemini 1.5 Pro (Legacy High-Capacity)',
    };

    return res.rows.map((r) => {
      const isLite = r.model.includes('lite');
      return {
        model: r.model,
        displayName: modelDisplayNames[r.model] || r.model,
        capabilities: {
          text: true,
          vision: !isLite || r.model.includes('flash'),
          audio: r.model.includes('flash'),
        },
        inputPricePerMillion: Number(r.input_price_per_million),
        outputPricePerMillion: Number(r.output_price_per_million),
        cachedInputPricePerMillion: Number(r.cached_input_price_per_million),
        isDefault: r.model === 'gemini-3.5-flash' || r.model === 'gemini-2.5-flash',
      };
    });
  }

  // =========================================================================
  // GEMINI USAGE TELEMETRY & ANALYTICS
  // =========================================================================

  async recordGeminiUsage(event: Omit<GeminiUsageEvent, 'id' | 'createdAt'>): Promise<void> {
    await this.db.query(
      `INSERT INTO gemini_usage_events (
        request_id, user_id, feature, model, status,
        input_tokens, output_tokens, cached_tokens, total_tokens,
        estimated_cost_usd, duration_ms, error_category, provider_request_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        event.requestId,
        event.userId ?? null,
        event.feature,
        event.model,
        event.status,
        event.inputTokens,
        event.outputTokens,
        event.cachedTokens,
        event.totalTokens,
        event.estimatedCostUsd,
        event.durationMs,
        event.errorCategory ?? null,
        event.providerRequestId ?? null,
      ],
    );
  }

  async getGeminiUsageEvents(filters: {
    feature?: string;
    model?: string;
    status?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: GeminiUsageEvent[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (filters.feature) {
      conditions.push(`feature = $${idx++}`);
      values.push(filters.feature);
    }
    if (filters.model) {
      conditions.push(`model = $${idx++}`);
      values.push(filters.model);
    }
    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.from) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(new Date(filters.from));
    }
    if (filters.to) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(new Date(filters.to));
    }

    const where = conditions.join(' AND ');

    const countRes = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text as total FROM gemini_usage_events WHERE ${where}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const itemsQuery = `
      SELECT id, request_id, user_id, feature, model, status,
             input_tokens, output_tokens, cached_tokens, total_tokens,
             estimated_cost_usd, duration_ms, error_category, provider_request_id, created_at
      FROM gemini_usage_events
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const itemsRes = await this.db.query(itemsQuery, [...values, filters.limit, filters.offset]);

    const items: GeminiUsageEvent[] = itemsRes.rows.map((r: any) => ({
      id: r.id,
      requestId: r.request_id,
      userId: r.user_id,
      feature: r.feature,
      model: r.model,
      status: r.status,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cachedTokens: r.cached_tokens,
      totalTokens: r.total_tokens,
      estimatedCostUsd: Number(r.estimated_cost_usd),
      durationMs: r.duration_ms,
      errorCategory: r.error_category,
      providerRequestId: r.provider_request_id,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));

    return { items, total };
  }

  async getGeminiUsageSummary(): Promise<GeminiUsageSummary> {
    const res = await this.db.query<{
      today_requests: string;
      monthly_requests: string;
      total_tokens: string;
      input_tokens: string;
      output_tokens: string;
      cached_tokens: string;
      estimated_monthly_cost_usd: string;
      failed_requests: string;
      avg_duration_ms: string;
    }>(
      `SELECT
         COUNT(CASE WHEN created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE THEN 1 END)::text AS today_requests,
         COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 END)::text AS monthly_requests,
         COALESCE(SUM(total_tokens), 0)::text AS total_tokens,
         COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
         COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
         COALESCE(SUM(cached_tokens), 0)::text AS cached_tokens,
         COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN estimated_cost_usd ELSE 0 END), 0)::text AS estimated_monthly_cost_usd,
         COUNT(CASE WHEN status != 'success' THEN 1 END)::text AS failed_requests,
         COALESCE(ROUND(AVG(duration_ms)), 0)::text AS avg_duration_ms
       FROM gemini_usage_events`,
    );

    const row = res.rows[0];
    return {
      todayRequests: parseInt(row?.today_requests ?? '0', 10),
      monthlyRequests: parseInt(row?.monthly_requests ?? '0', 10),
      totalTokens: parseInt(row?.total_tokens ?? '0', 10),
      inputTokens: parseInt(row?.input_tokens ?? '0', 10),
      outputTokens: parseInt(row?.output_tokens ?? '0', 10),
      cachedTokens: parseInt(row?.cached_tokens ?? '0', 10),
      estimatedMonthlyCostUsd: Number(row?.estimated_monthly_cost_usd ?? 0),
      failedRequests: parseInt(row?.failed_requests ?? '0', 10),
      avgDurationMs: parseInt(row?.avg_duration_ms ?? '0', 10),
    };
  }

  async getGeminiUsageByFeature(from?: string, to?: string): Promise<GeminiFeatureUsage[]> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(new Date(from));
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(new Date(to));
    }

    const res = await this.db.query<{
      feature: string;
      request_count: string;
      total_tokens: string;
      estimated_cost_usd: string;
    }>(
      `SELECT
         feature,
         COUNT(*)::text AS request_count,
         COALESCE(SUM(total_tokens), 0)::text AS total_tokens,
         COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
       FROM gemini_usage_events
       WHERE ${conditions.join(' AND ')}
       GROUP BY feature
       ORDER BY COUNT(*) DESC`,
      values,
    );

    return res.rows.map((r) => ({
      feature: r.feature,
      requestCount: parseInt(r.request_count, 10),
      totalTokens: parseInt(r.total_tokens, 10),
      estimatedCostUsd: Number(r.estimated_cost_usd),
    }));
  }

  async getGeminiUsageByModel(from?: string, to?: string): Promise<GeminiModelUsage[]> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(new Date(from));
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(new Date(to));
    }

    const res = await this.db.query<{
      model: string;
      request_count: string;
      total_tokens: string;
      estimated_cost_usd: string;
    }>(
      `SELECT
         model,
         COUNT(*)::text AS request_count,
         COALESCE(SUM(total_tokens), 0)::text AS total_tokens,
         COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
       FROM gemini_usage_events
       WHERE ${conditions.join(' AND ')}
       GROUP BY model
       ORDER BY COUNT(*) DESC`,
      values,
    );

    return res.rows.map((r) => ({
      model: r.model,
      requestCount: parseInt(r.request_count, 10),
      totalTokens: parseInt(r.total_tokens, 10),
      estimatedCostUsd: Number(r.estimated_cost_usd),
    }));
  }

  async getGeminiDailyTrends(days = 14): Promise<GeminiDailyTrendItem[]> {
    const res = await this.db.query<{
      day: Date;
      request_count: string;
      total_tokens: string;
      estimated_cost_usd: string;
    }>(
      `SELECT
         date_trunc('day', created_at) AS day,
         COUNT(*)::text AS request_count,
         COALESCE(SUM(total_tokens), 0)::text AS total_tokens,
         COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
       FROM gemini_usage_events
       WHERE created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY date_trunc('day', created_at)
       ORDER BY day ASC`,
      [days],
    );

    return res.rows.map((r) => ({
      date: (r.day instanceof Date ? r.day : new Date(r.day)).toISOString().split('T')[0]!,
      requestCount: parseInt(r.request_count, 10),
      totalTokens: parseInt(r.total_tokens, 10),
      estimatedCostUsd: Number(r.estimated_cost_usd),
    }));
  }
}

import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import type {
  GeminiDailyTrendItem,
  GeminiFeatureUsage,
  GeminiModelInfo,
  GeminiModelUsage,
  GeminiUsageEvent,
  GeminiUsageSummary,
} from '../../domain/gemini-config.js';
import type { AppSettingsRepository } from '../ports.js';

export interface GetGeminiUsageEventsFilters {
  feature?: string;
  model?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export class GetGeminiUsageAnalyticsUseCases {
  constructor(private readonly repo: AppSettingsRepository) {}

  async getSummary(actor: Actor): Promise<GeminiUsageSummary> {
    assertPermission(actor, 'admin:access');
    return this.repo.getGeminiUsageSummary();
  }

  async getByFeature(actor: Actor, from?: string, to?: string): Promise<GeminiFeatureUsage[]> {
    assertPermission(actor, 'admin:access');
    return this.repo.getGeminiUsageByFeature(from, to);
  }

  async getByModel(actor: Actor, from?: string, to?: string): Promise<GeminiModelUsage[]> {
    assertPermission(actor, 'admin:access');
    return this.repo.getGeminiUsageByModel(from, to);
  }

  async getDailyTrends(actor: Actor, days = 14): Promise<GeminiDailyTrendItem[]> {
    assertPermission(actor, 'admin:access');
    return this.repo.getGeminiDailyTrends(days);
  }

  async getEvents(
    actor: Actor,
    filters: GetGeminiUsageEventsFilters,
  ): Promise<{ items: GeminiUsageEvent[]; total: number; page: number; limit: number; totalPages: number }> {
    assertPermission(actor, 'admin:access');

    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * limit;

    const { items, total } = await this.repo.getGeminiUsageEvents({
      feature: filters.feature,
      model: filters.model,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return { items, total, page, limit, totalPages };
  }

  async getModels(actor: Actor): Promise<GeminiModelInfo[]> {
    assertPermission(actor, 'admin:access');
    return this.repo.getGeminiModelsWithPricing();
  }
}

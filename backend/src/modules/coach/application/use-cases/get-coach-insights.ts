import { insightsCacheFields, responseSourceOf } from '../../../../shared/ai/ai-observability.js';
import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { Logger } from '../../../../shared/logging/logger.js';
import { currentCorrelationId } from '../../../../shared/logging/request-correlation.js';
import type { GeminiService, UserContextRepository } from '../ports.js';
import type { CoachInsightsResponse } from '../../domain/coach.types.js';

export interface GetCoachInsightsInput {
  userId: string;
  timezone?: string | null;
  lang?: string | null;
  forceRefresh?: boolean;
}

interface CacheEntry {
  data: CoachInsightsResponse;
  expiresAt: number;
}

// In-memory cache isolated per user and language
const insightsCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<CoachInsightsResponse>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class GetCoachInsightsUseCase {
  constructor(
    private readonly userContextRepo: UserContextRepository,
    private readonly geminiService: GeminiService,
    private readonly aiUsageGate: AiUsageGate,
    /** Observability only: one `ai.cache` event per cache decision. Never changes what is cached or served. */
    private readonly logger?: Pick<Logger, 'info'>,
  ) {}

  private logCache(fields: Omit<Parameters<typeof insightsCacheFields>[0], 'correlationId'>, message: string): void {
    this.logger?.info(insightsCacheFields({ ...fields, correlationId: currentCorrelationId() }), message);
  }

  /** Clear cached insights for testing or cache eviction */
  static clearCache(): void {
    insightsCache.clear();
    inFlightRequests.clear();
  }

  async execute(input: GetCoachInsightsInput): Promise<CoachInsightsResponse> {
    if (!input.userId || !input.userId.trim()) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
    }

    const userId = input.userId.trim();
    const lang = (input.lang?.trim().toLowerCase() || 'en');
    const timezone = input.timezone || 'UTC';
    const cacheKey = `${userId}:${lang}`;

    // Kill switch applies to every request, including ones the cache could serve.
    await this.aiUsageGate.assertEnabled('coach_chat');

    // 1. Check valid cache if not forcing refresh
    const cachedEntry = insightsCache.get(cacheKey);
    if (!input.forceRefresh) {
      if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
        // `servedFrom` tells an AI answer from a cached deterministic fallback (which is cached too).
        this.logCache(
          {
            cache: 'hit',
            servedFrom: responseSourceOf(cachedEntry.data),
            cacheAgeMs: Math.max(0, Date.now() - (cachedEntry.expiresAt - CACHE_TTL_MS)),
          },
          'Coach insights served from cache',
        );
        return cachedEntry.data;
      }
    }

    // 2. Request deduplication: if request is already in-flight for this user/lang, return existing promise
    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
      this.logCache({ cache: 'joined_inflight' }, 'Coach insights joined an in-flight generation');
      return await inFlight;
    }

    this.logCache(
      { cache: 'miss', reason: input.forceRefresh ? 'force_refresh' : cachedEntry ? 'expired' : 'absent' },
      'Coach insights cache miss: generating',
    );

    const generatePromise = (async () => {
      try {
        // Only a cache miss that actually generates insights is metered. Insights share the
        // `coach_chat` quota and `aiCoach` flag (the quota table has no separate action type).
        const insights = await this.aiUsageGate.run({ userId, action: 'coach_chat' }, async () => {
          const context = await this.userContextRepo.getUserFitnessContext(userId, timezone);
          return this.geminiService.generateInsights(context, lang);
        });

        // Store in cache
        insightsCache.set(cacheKey, {
          data: insights,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        this.logCache({ cache: 'stored', servedFrom: responseSourceOf(insights) }, 'Coach insights cached');

        return insights;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, generatePromise);
    return await generatePromise;
  }
}


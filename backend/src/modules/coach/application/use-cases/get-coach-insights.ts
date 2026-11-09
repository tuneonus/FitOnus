import { AppError } from '../../../../shared/errors/app-error.js';
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
  ) {}

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

    // 1. Check valid cache if not forcing refresh
    if (!input.forceRefresh) {
      const cached = insightsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    // 2. Request deduplication: if request is already in-flight for this user/lang, return existing promise
    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
      return await inFlight;
    }

    const generatePromise = (async () => {
      try {
        const context = await this.userContextRepo.getUserFitnessContext(userId, timezone);
        const insights = await this.geminiService.generateInsights(context, lang);

        // Store in cache
        insightsCache.set(cacheKey, {
          data: insights,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return insights;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, generatePromise);
    return await generatePromise;
  }
}


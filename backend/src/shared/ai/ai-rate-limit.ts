import { AppError } from '../errors/app-error.js';
import type { AiUsageAction } from './ai-usage.js';

/** Same code and text as the HTTP limiters in middleware/rate-limit.ts, so clients see one 429 shape. */
export const AI_RATE_LIMIT_MESSAGE = 'Too many requests. Try again later.';

export const DEFAULT_AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Requests per user, per action, per window. Coach chat keeps the previous 30 / 15 min budget. */
export const DEFAULT_AI_RATE_LIMITS: Readonly<Record<AiUsageAction, number>> = {
  coach_chat: 30,
  meal_photo: 10,
  voice_meal: 10,
  workout_generator: 10,
};

/** The count after one more hit in the current window, and when that window ends (epoch ms). */
export interface RateLimitHit {
  count: number;
  resetAt: number;
}

/**
 * Where hit counters live. `hit` must atomically count one hit for `key` and return a SNAPSHOT of the
 * resulting count (never a live, shared object). A Redis implementation is `INCR key` + `PEXPIRE key
 * windowMs` on the first hit, returning the count and `now + PTTL`.
 */
export interface AiRateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit> | RateLimitHit;
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Fixed-window counters in this process's memory. Synchronous, so concurrent requests in the same tick
 * each get their own exact count; no timers (expired windows are swept lazily), so nothing keeps the
 * process alive and tests can drive it with fake timers.
 */
export class InMemoryAiRateLimitStore implements AiRateLimitStore {
  private readonly windows = new Map<string, RateLimitHit>();
  private lastSweepAt = 0;

  hit(key: string, windowMs: number): RateLimitHit {
    const now = Date.now();
    this.sweep(now);

    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return { count: window.count, resetAt: window.resetAt };
  }

  private sweep(now: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

export interface AiRateLimitOptions {
  windowMs?: number;
  limits?: Partial<Record<AiUsageAction, number>>;
  /** Defaults to an in-process store. Inject a shared one (e.g. Redis) to be exact across instances. */
  store?: AiRateLimitStore;
}

export interface AiRateLimiter {
  /** Counts one request for `userId`; throws `RATE_LIMITED` (HTTP 429) once the budget is spent. */
  consume(userId: string, action: AiUsageAction): Promise<void>;
}

/**
 * Per-user burst limiter for every metered AI action, enforced by the AI usage gate.
 *
 * Why it lives in the gate and not in route middleware:
 * - The key is the authenticated user id the gate already holds. It never uses an IP address (so users
 *   behind one carrier NAT do not share a budget) and never uses any part of the access token (so
 *   refreshing or re-issuing tokens does not create a new budget).
 * - Coach chat, coach insights, meal photo and voice meal all reach Gemini only through the gate, so no
 *   endpoint can be added without it.
 * - It runs before the quota reservation: a limited request costs one in-memory counter, no database
 *   round trip, no quota unit and no provider call.
 *
 * What it does not do: requests that fail validation never reach the gate, and cached coach insights
 * (which call no provider) are not counted. Those stay covered by the global per-IP limiter.
 *
 * LIMITATION (multiple instances): the default store lives in one process's memory. With N API
 * instances (for example Render scaled out) every instance keeps its own counters, so a user's real
 * burst budget is up to N x the configured limit, and counters reset when an instance restarts or
 * redeploys. The daily AI quota is NOT affected: it is an atomic PostgreSQL counter and stays exact
 * across instances, so it remains the hard cap on spend. To make the burst limit exact across
 * instances, pass a shared `store` (see `AiRateLimitStore`).
 */
export function createAiRateLimiter(options: AiRateLimitOptions = {}): AiRateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_AI_RATE_LIMIT_WINDOW_MS;
  const limits = { ...DEFAULT_AI_RATE_LIMITS, ...options.limits };
  const store = options.store ?? new InMemoryAiRateLimitStore();

  return {
    async consume(userId, action) {
      const { count, resetAt } = await store.hit(`ai:${action}:${userId}`, windowMs);
      if (count <= limits[action]) return;

      throw new AppError('rate_limited', 'RATE_LIMITED', AI_RATE_LIMIT_MESSAGE, {
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      });
    },
  };
}

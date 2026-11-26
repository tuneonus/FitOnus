/**
 * In-memory Circuit Breaker and Cooldown Tracker for Gemini Models.
 *
 * Keeps track of model-specific rate limits, daily caps, and temporary 503 overloads.
 * Rejects calls to cooled-down models instantly in 0ms without hitting Google API.
 *
 * NOTE (Multiple Instances):
 * State lives in this process's memory. In a multi-instance production environment
 * (e.g. horizontally scaled instances), each instance tracks its own cooldown observations.
 * For development and single-instance deployments, this provides complete protection with
 * zero Redis or third-party infrastructure requirements.
 */

export interface ModelCooldownEntry {
  model: string;
  cooledDownUntil: number; // epoch ms
  reason: string;
  failureCount: number;
  lastFailureAt: number;
  lastError?: string;
}

export class ModelCooldownTracker {
  private readonly cooldowns = new Map<string, ModelCooldownEntry>();

  /**
   * Checks whether a model is currently eligible to receive requests.
   * If its cooldown period has expired, it is automatically marked available.
   */
  isAvailable(model: string): boolean {
    const entry = this.cooldowns.get(model);
    if (!entry) return true;
    if (Date.now() >= entry.cooledDownUntil) {
      // Cooldown expired: allow request (half-open test)
      this.cooldowns.delete(model);
      return true;
    }
    return false;
  }

  /**
   * Returns remaining cooldown in seconds (or 0 if available).
   */
  getRemainingCooldownSeconds(model: string): number {
    const entry = this.cooldowns.get(model);
    if (!entry) return 0;
    const remainingMs = entry.cooledDownUntil - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  /**
   * Records a model failure and sets its cooldown expiration.
   */
  recordFailure(model: string, reason: string, cooldownSeconds: number, lastError?: string): void {
    const existing = this.cooldowns.get(model);
    const failureCount = (existing?.failureCount ?? 0) + 1;
    // Safe bounds: minimum 5s, maximum 86400s (24h)
    const effectiveCooldown = Math.max(5, Math.min(86400, cooldownSeconds));
    const cooledDownUntil = Date.now() + effectiveCooldown * 1000;

    this.cooldowns.set(model, {
      model,
      cooledDownUntil,
      reason,
      failureCount,
      lastFailureAt: Date.now(),
      lastError,
    });
  }

  /**
   * Records a successful execution on a model, resetting its failure record.
   */
  recordSuccess(model: string): void {
    this.cooldowns.delete(model);
  }

  /**
   * Returns a snapshot of all models currently tracked and their status.
   */
  getStatus(): Array<{
    model: string;
    isCoolingDown: boolean;
    remainingSeconds: number;
    reason: string;
    failureCount: number;
  }> {
    const now = Date.now();
    const result: Array<{
      model: string;
      isCoolingDown: boolean;
      remainingSeconds: number;
      reason: string;
      failureCount: number;
    }> = [];

    for (const [model, entry] of this.cooldowns) {
      const remainingMs = entry.cooledDownUntil - now;
      if (remainingMs > 0) {
        result.push({
          model,
          isCoolingDown: true,
          remainingSeconds: Math.ceil(remainingMs / 1000),
          reason: entry.reason,
          failureCount: entry.failureCount,
        });
      } else {
        this.cooldowns.delete(model);
      }
    }

    return result;
  }

  /**
   * Resets all or specific model cooldowns (useful for tests or admin override).
   */
  reset(model?: string): void {
    if (model) {
      this.cooldowns.delete(model);
    } else {
      this.cooldowns.clear();
    }
  }
}

/** Global singleton cooldown tracker for runtime AI service. */
export const defaultModelCooldownTracker = new ModelCooldownTracker();

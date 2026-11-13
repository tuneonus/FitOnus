import type { AiRateLimiter } from '../../../../shared/ai/ai-rate-limit.js';
import {
  runWithAiRequestContext,
  type AiRequestContext,
  type AiUsageAction,
  type AiUsageGate,
  type AiUsageRequest,
} from '../../../../shared/ai/ai-usage.js';
import type { CheckAndRecordAiQuotaUseCase } from '../use-cases/check-and-record-ai-quota.js';

/**
 * Implements the shared `AiUsageGate` on top of the quota use case. See `AiUsageGate` for the
 * billing policy this class enforces.
 */
export class AiUsageGateService implements AiUsageGate {
  constructor(
    private readonly quota: CheckAndRecordAiQuotaUseCase,
    /** Optional per-user burst limiter. Checked first: a limited request costs no quota and no provider call. */
    private readonly rateLimiter?: AiRateLimiter,
  ) {}

  assertEnabled(action: AiUsageAction): Promise<void> {
    return this.quota.assertEnabled(action);
  }

  async run<T>(request: AiUsageRequest, work: () => Promise<T>): Promise<T> {
    // Throws RATE_LIMITED (burst, in-memory) before any quota or database work happens.
    await this.rateLimiter?.consume(request.userId, request.action);

    // Throws FEATURE_DISABLED / AI_QUOTA_EXCEEDED before `work` (and therefore the provider) runs.
    const reservation = await this.quota.execute({ userId: request.userId, actionType: request.action });

    const context: AiRequestContext = { userId: request.userId, action: request.action, dispatched: false };
    try {
      return await runWithAiRequestContext(context, work);
    } catch (error) {
      if (!context.dispatched) {
        // Failed before the provider was called: nothing was spent, so give the unit back. A failed
        // refund only errs on the side of keeping the charge, so it must not mask the real error.
        await this.quota.release(reservation).catch(() => undefined);
      }
      throw error;
    }
  }
}

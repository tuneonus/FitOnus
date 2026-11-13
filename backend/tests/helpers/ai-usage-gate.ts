import type { AiUsageGate } from '../../src/shared/ai/ai-usage.js';
import type {
  AiUsageActionType,
  AiUsageReserveInput,
  AiUsageReserveResult,
} from '../../src/modules/app-settings/index.js';

/** A gate that admits everything: for tests of AI workflows that are not about quotas. */
export const allowAllAiUsageGate = (): AiUsageGate => ({
  assertEnabled: () => Promise.resolve(),
  run: (_request, work) => work(),
});

/**
 * In-memory stand-in for `reserveAiUsage` / `releaseAiUsage`.
 *
 * Reservations of the same user are serialised through a promise chain with an artificial
 * scheduling gap between the read and the write, exactly the window a read-then-increment
 * implementation would lose races in. It only models the repository contract; the SQL itself is
 * proven against real PostgreSQL in tests/integration/repositories/ai-usage.test.ts.
 */
export class InMemoryAiUsageStore {
  readonly usageDate = '2026-11-12';
  private readonly counts = new Map<string, number>();
  private tails = new Map<string, Promise<unknown>>();
  reserveCalls = 0;

  actionCount(userId: string, actionType: AiUsageActionType): number {
    return this.counts.get(`${userId}:${actionType}`) ?? 0;
  }

  totalCount(userId: string): number {
    let total = 0;
    for (const [key, value] of this.counts) if (key.startsWith(`${userId}:`)) total += value;
    return total;
  }

  setCount(userId: string, actionType: AiUsageActionType, value: number): void {
    this.counts.set(`${userId}:${actionType}`, value);
  }

  reserveAiUsage(input: AiUsageReserveInput): Promise<AiUsageReserveResult> {
    this.reserveCalls += 1;
    const previous = this.tails.get(input.userId) ?? Promise.resolve();
    const result = previous.then(async () => {
      const actionCount = this.actionCount(input.userId, input.actionType);
      const totalCount = this.totalCount(input.userId);
      await new Promise((resolve) => setImmediate(resolve)); // widen the read→write window
      const snapshot = { usageDate: this.usageDate, actionCount, totalCount };
      if (actionCount >= input.actionLimit)
        return { allowed: false, reason: 'action_limit', ...snapshot } as const;
      if (totalCount >= input.totalLimit)
        return { allowed: false, reason: 'total_limit', ...snapshot } as const;
      this.setCount(input.userId, input.actionType, actionCount + 1);
      return {
        allowed: true,
        usageDate: this.usageDate,
        actionCount: actionCount + 1,
        totalCount: totalCount + 1,
      } as const;
    });
    this.tails.set(
      input.userId,
      result.catch(() => undefined),
    );
    return result;
  }

  releaseAiUsage(input: { userId: string; actionType: AiUsageActionType; usageDate: string }): Promise<void> {
    const current = this.actionCount(input.userId, input.actionType);
    this.setCount(input.userId, input.actionType, Math.max(0, current - 1));
    return Promise.resolve();
  }
}

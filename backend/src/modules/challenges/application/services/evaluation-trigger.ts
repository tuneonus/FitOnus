import type { EvaluateChallengeProgressUseCase } from '../use-cases/evaluate-challenge-progress.js';
import type { EvaluateMilestonesAndBadgesUseCase } from '../use-cases/evaluate-milestones-and-badges.js';

export interface EvaluationTriggerContext {
  userId: string;
  source: 'workout' | 'habit' | 'nutrition' | 'progress' | 'manual';
}

export class GamificationEvaluationTrigger {
  private inFlightUsers = new Set<string>();

  constructor(
    private readonly evaluateProgressUseCase: EvaluateChallengeProgressUseCase,
    private readonly evaluateMilestonesUseCase: EvaluateMilestonesAndBadgesUseCase,
  ) {}

  /**
   * Safely triggers evaluation for a user.
   * Prevents concurrent redundant evaluations for the same user.
   */
  async evaluateUser(input: EvaluationTriggerContext): Promise<void> {
    const { userId } = input;
    if (!userId) return;

    if (this.inFlightUsers.has(userId)) {
      // Deduplicate concurrent evaluation requests for the same user
      return;
    }

    this.inFlightUsers.add(userId);
    try {
      await Promise.all([
        this.evaluateProgressUseCase.execute({ userId }),
        this.evaluateMilestonesUseCase.execute({ userId }),
      ]);
    } catch {
      // Evaluation failures never block callers
    } finally {
      this.inFlightUsers.delete(userId);
    }
  }

  /**
   * Non-blocking fire-and-forget trigger for activity logging routes.
   * Leverages read-through evaluation as fallback to guarantee eventual consistency.
   */
  triggerAsync(input: EvaluationTriggerContext): void {
    setImmediate(() => {
      this.evaluateUser(input).catch(() => {});
    });
  }
}

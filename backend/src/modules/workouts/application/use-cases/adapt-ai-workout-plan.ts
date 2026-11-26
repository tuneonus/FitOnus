import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import type { AdaptAiWorkoutPlanInput, AiWorkoutPlanResult, IAiWorkoutPlanner } from '../ports.js';

export class AdaptAiWorkoutPlanUseCase {
  constructor(
    private readonly planner: IAiWorkoutPlanner,
    private readonly aiUsageGate?: AiUsageGate,
  ) {}

  async execute(input: AdaptAiWorkoutPlanInput): Promise<AiWorkoutPlanResult> {
    if (this.aiUsageGate) {
      return this.aiUsageGate.run({ userId: input.userId, action: 'workout_generator' }, () =>
        this.planner.adaptPlan(input),
      );
    }
    return this.planner.adaptPlan(input);
  }
}

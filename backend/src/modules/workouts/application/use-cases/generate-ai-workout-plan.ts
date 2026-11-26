import type { AiUsageGate } from '../../../../shared/ai/ai-usage.js';
import type { AiWorkoutPlanResult, GenerateAiWorkoutPlanInput, IAiWorkoutPlanner } from '../ports.js';

export class GenerateAiWorkoutPlanUseCase {
  constructor(
    private readonly planner: IAiWorkoutPlanner,
    private readonly aiUsageGate?: AiUsageGate,
  ) {}

  async execute(input: GenerateAiWorkoutPlanInput): Promise<AiWorkoutPlanResult> {
    if (this.aiUsageGate) {
      return this.aiUsageGate.run({ userId: input.userId, action: 'workout_generator' }, () =>
        this.planner.generatePlan(input),
      );
    }
    return this.planner.generatePlan(input);
  }
}

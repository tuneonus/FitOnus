import type { AdaptAiWorkoutPlanInput, AiWorkoutPlanResult, IAiWorkoutPlanner } from '../ports.js';

export class AdaptAiWorkoutPlanUseCase {
  constructor(private readonly planner: IAiWorkoutPlanner) {}

  async execute(input: AdaptAiWorkoutPlanInput): Promise<AiWorkoutPlanResult> {
    return this.planner.adaptPlan(input);
  }
}

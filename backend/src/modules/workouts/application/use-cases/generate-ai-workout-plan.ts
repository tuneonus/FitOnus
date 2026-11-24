import type { AiWorkoutPlanResult, GenerateAiWorkoutPlanInput, IAiWorkoutPlanner } from '../ports.js';

export class GenerateAiWorkoutPlanUseCase {
  constructor(private readonly planner: IAiWorkoutPlanner) {}

  async execute(input: GenerateAiWorkoutPlanInput): Promise<AiWorkoutPlanResult> {
    return this.planner.generatePlan(input);
  }
}

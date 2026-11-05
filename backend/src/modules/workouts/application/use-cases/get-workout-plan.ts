import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWorkoutPlanRepository } from '../ports.js';
import { toWorkoutPlanView, type WorkoutPlanView } from '../workout-view.js';

export class GetWorkoutPlanUseCase {
  constructor(private readonly workoutRepo: IWorkoutPlanRepository) {}

  async execute(userId: string, planId: string): Promise<WorkoutPlanView> {
    const plan = await this.workoutRepo.findById(planId);
    if (!plan || plan.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Workout plan not found.');
    }

    // Accessible if user owns it or if it is a system template
    if (plan.userId !== null && plan.userId !== userId) {
      throw new AppError('forbidden', 'FORBIDDEN', 'You do not have access to this workout plan.');
    }

    return toWorkoutPlanView(plan, true);
  }
}

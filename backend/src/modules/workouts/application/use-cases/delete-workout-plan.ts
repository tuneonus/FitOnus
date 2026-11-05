import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWorkoutPlanRepository } from '../ports.js';

export class DeleteWorkoutPlanUseCase {
  constructor(private readonly workoutRepo: IWorkoutPlanRepository) {}

  async execute(userId: string, planId: string): Promise<void> {
    const existing = await this.workoutRepo.findById(planId);
    if (!existing || existing.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Workout plan not found.');
    }

    if (existing.userId !== userId) {
      throw new AppError('forbidden', 'FORBIDDEN', 'You do not have permission to delete this workout plan.');
    }

    await this.workoutRepo.softDelete(planId);
  }
}

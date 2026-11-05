import type { IWorkoutPlanRepository } from '../ports.js';
import { toWorkoutPlanView, type WorkoutPlanView } from '../workout-view.js';

export interface ListWorkoutPlansInput {
  userId: string;
  type?: 'all' | 'mine' | 'templates';
  page?: number;
  limit?: number;
}

export class ListWorkoutPlansUseCase {
  constructor(private readonly workoutRepo: IWorkoutPlanRepository) {}

  async execute(
    input: ListWorkoutPlansInput,
  ): Promise<{ plans: WorkoutPlanView[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const { plans, total } = await this.workoutRepo.listForUser(input.userId, {
      type: input.type,
      offset,
      limit,
    });

    return {
      plans: plans.map((p) => toWorkoutPlanView(p, false)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

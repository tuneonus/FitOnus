import type { IWorkoutSessionRepository } from '../ports.js';
import { toWorkoutSessionView, type WorkoutSessionView } from '../workout-view.js';

export interface ListWorkoutSessionsInput {
  userId: string;
  workoutId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class ListWorkoutSessionsUseCase {
  constructor(private readonly sessionRepo: IWorkoutSessionRepository) {}

  async execute(input: ListWorkoutSessionsInput): Promise<{
    sessions: WorkoutSessionView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const { sessions, total } = await this.sessionRepo.listForUser(input.userId, {
      workoutId: input.workoutId,
      startDate: input.startDate,
      endDate: input.endDate,
      offset,
      limit,
    });

    return {
      sessions: sessions.map((s) => toWorkoutSessionView(s)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWorkoutSessionRepository } from '../ports.js';
import { toWorkoutSessionView, type WorkoutSessionView } from '../workout-view.js';

export class GetWorkoutSessionUseCase {
  constructor(private readonly sessionRepo: IWorkoutSessionRepository) {}

  async execute(userId: string, sessionId: string): Promise<WorkoutSessionView> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new AppError('not_found', 'SESSION_NOT_FOUND', 'Workout session not found.');
    }

    if (session.userId !== userId) {
      throw new AppError('forbidden', 'FORBIDDEN', 'You do not have access to this workout session.');
    }

    return toWorkoutSessionView(session);
  }
}

import { AppError } from '../../../../shared/errors/app-error.js';
import type { IExerciseRepository } from '../ports.js';
import { toExerciseView, type ExerciseView } from '../workout-view.js';

export class GetExerciseUseCase {
  constructor(private readonly exerciseRepo: IExerciseRepository) {}

  async execute(id: string): Promise<ExerciseView> {
    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise || exercise.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Exercise not found.');
    }
    return toExerciseView(exercise);
  }
}

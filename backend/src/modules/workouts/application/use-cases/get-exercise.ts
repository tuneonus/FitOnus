import { AppError } from '../../../../shared/errors/app-error.js';
import type { PublicImageUrlResolver } from '../../../../shared/images/public-image-url.js';
import { NO_EXERCISE_IMAGE_URLS } from '../../domain/exercise-image.js';
import type { IExerciseRepository } from '../ports.js';
import { toExerciseView, type ExerciseView } from '../workout-view.js';

export class GetExerciseUseCase {
  constructor(
    private readonly exerciseRepo: IExerciseRepository,
    /** Builds the public URL of an uploaded exercise image. Omitted = uploaded images have no URL. */
    private readonly resolveImageUrl: PublicImageUrlResolver = NO_EXERCISE_IMAGE_URLS,
  ) {}

  async execute(id: string): Promise<ExerciseView> {
    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise || exercise.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Exercise not found.');
    }
    return toExerciseView(exercise, this.resolveImageUrl);
  }
}

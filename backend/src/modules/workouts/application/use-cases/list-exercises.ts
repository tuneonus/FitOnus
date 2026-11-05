import type { IExerciseRepository } from '../ports.js';
import { toExerciseView, type ExerciseView } from '../workout-view.js';

export interface ListExercisesInput {
  search?: string;
  muscle?: string;
  category?: string;
  equipment?: string;
  difficulty?: string;
  page?: number;
  limit?: number;
}

export class ListExercisesUseCase {
  constructor(private readonly exerciseRepo: IExerciseRepository) {}

  async execute(
    input: ListExercisesInput,
  ): Promise<{ exercises: ExerciseView[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const offset = (page - 1) * limit;

    const { exercises, total } = await this.exerciseRepo.list({
      search: input.search,
      muscle: input.muscle,
      category: input.category,
      equipment: input.equipment,
      difficulty: input.difficulty,
      offset,
      limit,
    });

    return {
      exercises: exercises.map(toExerciseView),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

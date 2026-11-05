import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { ExerciseDifficulty } from '../../domain/exercise.js';
import { WorkoutPlan, WorkoutPlanExercise } from '../../domain/workout-plan.js';
import type { IExerciseRepository, IWorkoutPlanRepository } from '../ports.js';
import { toWorkoutPlanView, type WorkoutPlanView } from '../workout-view.js';
import type { CreateWorkoutPlanExerciseInput } from './create-workout-plan.js';

export interface UpdateWorkoutPlanInput {
  userId: string;
  planId: string;
  name?: string;
  description?: string;
  workoutType?: string;
  estimatedDurationMinutes?: number;
  difficulty?: ExerciseDifficulty;
  tags?: string[];
  exercises?: CreateWorkoutPlanExerciseInput[];
}

export class UpdateWorkoutPlanUseCase {
  constructor(
    private readonly workoutRepo: IWorkoutPlanRepository,
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(input: UpdateWorkoutPlanInput): Promise<WorkoutPlanView> {
    const existing = await this.workoutRepo.findById(input.planId);
    if (!existing || existing.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Workout plan not found.');
    }

    if (existing.userId !== input.userId) {
      throw new AppError('forbidden', 'FORBIDDEN', 'You do not have permission to modify this workout plan.');
    }

    let updatedExercises = existing.exercises;
    if (input.exercises) {
      for (const exInput of input.exercises) {
        const exercise = await this.exerciseRepo.findById(exInput.exerciseId);
        if (!exercise || exercise.deletedAt !== null) {
          throw new AppError(
            'bad_request',
            'BAD_REQUEST',
            `Exercise with id ${exInput.exerciseId} does not exist.`,
          );
        }
      }

      const now = new Date();
      updatedExercises = input.exercises.map(
        (e) =>
          new WorkoutPlanExercise({
            id: crypto.randomUUID(),
            workoutId: input.planId,
            exerciseId: e.exerciseId,
            orderIndex: e.orderIndex,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetDurationSeconds: e.targetDurationSeconds ?? null,
            targetWeightKg: e.targetWeightKg ?? 0,
            restSeconds: e.restSeconds,
            notes: e.notes ?? null,
            supersetGroup: e.supersetGroup ?? null,
            createdAt: now,
          }),
      );
    }

    const updated = new WorkoutPlan({
      id: existing.id,
      userId: existing.userId,
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      workoutType: input.workoutType ?? existing.workoutType,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? existing.estimatedDurationMinutes,
      difficulty: input.difficulty ?? existing.difficulty,
      isTemplate: existing.isTemplate,
      isAiGenerated: existing.isAiGenerated,
      tags: input.tags ?? [...existing.tags],
      exercises: [...updatedExercises],
      createdAt: existing.createdAt,
      updatedAt: new Date(),
      deletedAt: null,
    });

    const saved = await this.workoutRepo.update(input.planId, updated);
    if (!saved) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to update workout plan.');
    }

    return toWorkoutPlanView(saved, true);
  }
}

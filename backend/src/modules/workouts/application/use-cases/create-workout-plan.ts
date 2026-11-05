import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { ExerciseDifficulty } from '../../domain/exercise.js';
import { WorkoutPlan, WorkoutPlanExercise } from '../../domain/workout-plan.js';
import type { IExerciseRepository, IWorkoutPlanRepository } from '../ports.js';
import { toWorkoutPlanView, type WorkoutPlanView } from '../workout-view.js';

export interface CreateWorkoutPlanExerciseInput {
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetReps: string;
  targetDurationSeconds?: number;
  targetWeightKg?: number;
  restSeconds: number;
  notes?: string;
  supersetGroup?: number;
}

export interface CreateWorkoutPlanInput {
  userId: string;
  name: string;
  description?: string;
  workoutType?: string;
  estimatedDurationMinutes?: number;
  difficulty?: ExerciseDifficulty;
  tags?: string[];
  exercises: CreateWorkoutPlanExerciseInput[];
}

export class CreateWorkoutPlanUseCase {
  constructor(
    private readonly workoutRepo: IWorkoutPlanRepository,
    private readonly exerciseRepo: IExerciseRepository,
  ) {}

  async execute(input: CreateWorkoutPlanInput): Promise<WorkoutPlanView> {
    // Validate that all referenced exercises exist
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

    const workoutId = crypto.randomUUID();
    const now = new Date();

    const planExercises = input.exercises.map(
      (e) =>
        new WorkoutPlanExercise({
          id: crypto.randomUUID(),
          workoutId,
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

    const plan = new WorkoutPlan({
      id: workoutId,
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      workoutType: input.workoutType ?? 'strength',
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? 45,
      difficulty: input.difficulty ?? 'intermediate',
      isTemplate: false,
      isAiGenerated: false,
      tags: input.tags ?? [],
      exercises: planExercises,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const created = await this.workoutRepo.create(plan);
    return toWorkoutPlanView(created, true);
  }
}

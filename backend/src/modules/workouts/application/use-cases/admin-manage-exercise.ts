import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { ExerciseDifficulty } from '../../domain/exercise.js';
import { Exercise } from '../../domain/exercise.js';
import type { IExerciseRepository, IWorkoutAuditLogger } from '../ports.js';
import { toExerciseView, type ExerciseView } from '../workout-view.js';

export interface CreateExerciseAdminInput {
  adminId: string;
  name: string;
  description?: string;
  instructions: string[];
  tips?: string[];
  commonMistakes?: string[];
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  equipment: string;
  category: string;
  difficulty: ExerciseDifficulty;
  isCompound?: boolean;
  imageUrl?: string;
  videoUrl?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateExerciseAdminInput {
  adminId: string;
  exerciseId: string;
  name?: string;
  description?: string;
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string;
  category?: string;
  difficulty?: ExerciseDifficulty;
  isCompound?: boolean;
  imageUrl?: string | null;
  videoUrl?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export class AdminManageExerciseUseCase {
  constructor(
    private readonly exerciseRepo: IExerciseRepository,
    private readonly auditLogger: IWorkoutAuditLogger,
  ) {}

  async create(input: CreateExerciseAdminInput): Promise<ExerciseView> {
    const now = new Date();
    const exercise = new Exercise({
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions,
      tips: input.tips ?? [],
      commonMistakes: input.commonMistakes ?? [],
      primaryMuscles: input.primaryMuscles,
      secondaryMuscles: input.secondaryMuscles ?? [],
      equipment: input.equipment,
      category: input.category,
      difficulty: input.difficulty,
      isCompound: input.isCompound ?? false,
      imageUrl: input.imageUrl ?? null,
      videoUrl: input.videoUrl ?? null,
      createdBy: input.adminId,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const created = await this.exerciseRepo.create(exercise);

    await this.auditLogger.logAction(
      input.adminId,
      'workout.exercise.create',
      { exerciseId: created.id, name: created.name },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toExerciseView(created);
  }

  async update(input: UpdateExerciseAdminInput): Promise<ExerciseView> {
    const existing = await this.exerciseRepo.findById(input.exerciseId);
    if (!existing || existing.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Exercise not found.');
    }

    const updated = await this.exerciseRepo.update(input.exerciseId, {
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      tips: input.tips,
      commonMistakes: input.commonMistakes,
      primaryMuscles: input.primaryMuscles,
      secondaryMuscles: input.secondaryMuscles,
      equipment: input.equipment,
      category: input.category,
      difficulty: input.difficulty,
      isCompound: input.isCompound,
      imageUrl: input.imageUrl,
      videoUrl: input.videoUrl,
      updatedAt: new Date(),
    });

    if (!updated) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to update exercise.');
    }

    await this.auditLogger.logAction(
      input.adminId,
      'workout.exercise.update',
      { exerciseId: updated.id, name: updated.name },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toExerciseView(updated);
  }

  async delete(adminId: string, exerciseId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const existing = await this.exerciseRepo.findById(exerciseId);
    if (!existing || existing.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Exercise not found.');
    }

    await this.exerciseRepo.softDelete(exerciseId);

    await this.auditLogger.logAction(
      adminId,
      'workout.exercise.delete',
      { exerciseId, name: existing.name },
      null,
      ipAddress,
      userAgent,
    );
  }
}

import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import {
  assertImageObjectsExist,
  assertImageStorageConfigured,
  type ImageStorageDeps,
} from '../../../../shared/images/public-image-check.js';
import type { PublicImageUrlResolver } from '../../../../shared/images/public-image-url.js';
import type { ExerciseDifficulty } from '../../domain/exercise.js';
import { Exercise } from '../../domain/exercise.js';
import type { IExerciseRepository, IWorkoutAuditLogger } from '../ports.js';
import { toExerciseView, type ExerciseView } from '../workout-view.js';

export interface CreateExerciseAdminInput {
  adminId: string;
  name: string;
  description?: string | null;
  instructions: string[];
  tips?: string[];
  commonMistakes?: string[];
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  equipment: string;
  category: string;
  difficulty: ExerciseDifficulty;
  isCompound?: boolean;
  /** External address (http or https). */
  imageUrl?: string | null;
  /** Key returned by the exercise image upload endpoint. */
  imageKey?: string | null;
  videoUrl?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateExerciseAdminInput {
  adminId: string;
  exerciseId: string;
  name?: string;
  description?: string | null;
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string;
  category?: string;
  difficulty?: ExerciseDifficulty;
  isCompound?: boolean;
  /** External address (http or https). Omitted = unchanged; null = clear it. */
  imageUrl?: string | null;
  /** Uploaded image. Omitted = unchanged; null = remove the upload (the external address, if any, shows again). */
  imageKey?: string | null;
  videoUrl?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export const PROTECTED_SYSTEM_EXERCISE_IDS: ReadonlySet<string> = new Set(
  Array.from({ length: 14 }, (_, i) => `e0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`),
);

/** Image support for saving an exercise. Omitted = uploads are off: any request carrying an image key is refused. */
export type ExerciseImageDeps = ImageStorageDeps;

export class AdminManageExerciseUseCase {
  constructor(
    private readonly exerciseRepo: IExerciseRepository,
    private readonly auditLogger: IWorkoutAuditLogger,
    private readonly images?: ExerciseImageDeps,
  ) {}

  private get resolveImageUrl(): PublicImageUrlResolver {
    return this.images?.resolveUrl ?? (() => null);
  }

  /**
   * An uploaded image is only worth saving when storage is configured and the object is really there. Saving an
   * exercise is the final step (there are no drafts), so the existence check runs here, before anything is written.
   * The key's shape is already pinned by the request schema (`onusfit/exercises/<hex>.webp`).
   */
  private async assertImageSaveable(key: string): Promise<void> {
    const storage: ImageStorageDeps = {
      store: this.images?.store ?? null,
      resolveUrl: this.resolveImageUrl,
      logger: this.images?.logger,
    };
    assertImageStorageConfigured(storage, key, 'an exercise');
    await assertImageObjectsExist(storage, [key], 'exercise');
  }

  async create(input: CreateExerciseAdminInput): Promise<ExerciseView> {
    const imageKey = input.imageKey ?? null;
    if (imageKey !== null) await this.assertImageSaveable(imageKey);

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
      imageKey,
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
      { exerciseId: created.id, name: created.name, hasUploadedImage: created.imageKey !== null },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toExerciseView(created, this.resolveImageUrl);
  }

  async update(input: UpdateExerciseAdminInput): Promise<ExerciseView> {
    const existing = await this.exerciseRepo.findById(input.exerciseId);
    if (!existing || existing.deletedAt !== null) {
      throw new AppError('not_found', 'NOT_FOUND', 'Exercise not found.');
    }

    // Only a key that is new to this exercise is checked against storage: editing the text of an exercise that
    // already has an image never depends on R2 being reachable.
    const keyChanged = typeof input.imageKey === 'string' && input.imageKey !== existing.imageKey;
    if (keyChanged) await this.assertImageSaveable(input.imageKey as string);

    // An older admin client shows the effective image in its "image URL" field and sends it back on save. That value
    // is the address built from an uploaded key, not an external address, so it must never be written into
    // image_url: a URL equal to what an uploaded key resolves to is treated as "unchanged".
    const echoed = new Set(
      [existing.imageKey, input.imageKey ?? null]
        .map((key) => this.resolveImageUrl(key))
        .filter((url): url is string => url !== null),
    );
    const imageUrl =
      typeof input.imageUrl === 'string' && echoed.has(input.imageUrl) ? undefined : input.imageUrl;

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
      imageUrl,
      imageKey: input.imageKey,
      videoUrl: input.videoUrl,
      updatedAt: new Date(),
    });

    if (!updated) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to update exercise.');
    }

    await this.auditLogger.logAction(
      input.adminId,
      'workout.exercise.update',
      {
        exerciseId: updated.id,
        name: updated.name,
        hasUploadedImage: updated.imageKey !== null,
        imageChanged: updated.imageKey !== existing.imageKey,
      },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toExerciseView(updated, this.resolveImageUrl);
  }

  async delete(adminId: string, exerciseId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    if (PROTECTED_SYSTEM_EXERCISE_IDS.has(exerciseId)) {
      throw new AppError(
        'conflict',
        'CONFLICT',
        'The 14 foundational system exercises are protected and cannot be deleted.',
      );
    }

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

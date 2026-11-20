import crypto from 'node:crypto';
import { AppError } from '../../../../shared/errors/app-error.js';
import {
  assertImageObjectsExist,
  assertImageStorageConfigured,
  type ImageStorageDeps,
} from '../../../../shared/images/public-image-check.js';
import type { PublicImageUrlResolver } from '../../../../shared/images/public-image-url.js';
import type { ExerciseDifficulty } from '../../domain/exercise.js';
import { NO_WORKOUT_COVER_URLS } from '../../domain/workout-cover.js';
import { WorkoutPlan, WorkoutPlanExercise } from '../../domain/workout-plan.js';
import type { IExerciseRepository, IWorkoutAuditLogger, IWorkoutPlanRepository } from '../ports.js';
import { toWorkoutPlanView, type WorkoutPlanView } from '../workout-view.js';
import type { CreateWorkoutPlanExerciseInput } from './create-workout-plan.js';

export interface CreateTemplateAdminInput {
  adminId: string;
  name: string;
  description?: string;
  workoutType?: string;
  estimatedDurationMinutes?: number;
  difficulty?: ExerciseDifficulty;
  tags?: string[];
  /** Key returned by the template cover upload endpoint. */
  coverImageKey?: string | null;
  exercises: CreateWorkoutPlanExerciseInput[];
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateTemplateAdminInput {
  adminId: string;
  templateId: string;
  name?: string;
  description?: string;
  workoutType?: string;
  estimatedDurationMinutes?: number;
  difficulty?: ExerciseDifficulty;
  tags?: string[];
  /** Omitted = unchanged; null = remove the cover; a key = the new cover (the old object is left in storage). */
  coverImageKey?: string | null;
  exercises?: CreateWorkoutPlanExerciseInput[];
  ipAddress?: string;
  userAgent?: string;
}

/** Cover support for saving a template. Omitted = uploads are off: any request carrying a cover key is refused. */
export type TemplateCoverDeps = ImageStorageDeps;

export class AdminManageTemplateUseCase {
  constructor(
    private readonly workoutRepo: IWorkoutPlanRepository,
    private readonly exerciseRepo: IExerciseRepository,
    private readonly auditLogger: IWorkoutAuditLogger,
    private readonly images?: TemplateCoverDeps,
  ) {}

  private get resolveCoverUrl(): PublicImageUrlResolver {
    return this.images?.resolveUrl ?? NO_WORKOUT_COVER_URLS;
  }

  /**
   * A cover is only worth saving when storage is configured and the object is really there. Saving a template is the
   * final step (there are no drafts), so the existence check runs here, before anything is written. The key's shape
   * is already pinned by the request schema (`onusfit/workouts/<hex>.webp`) and again by the database.
   */
  private async assertCoverSaveable(key: string): Promise<void> {
    const storage: ImageStorageDeps = {
      store: this.images?.store ?? null,
      resolveUrl: this.resolveCoverUrl,
      logger: this.images?.logger,
    };
    assertImageStorageConfigured(storage, key, 'a workout template');
    await assertImageObjectsExist(storage, [key], 'workout cover');
  }

  async list(
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<{
    templates: WorkoutPlanView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const { templates, total } = await this.workoutRepo.listSystemTemplates(offset, safeLimit, search);
    return {
      templates: templates.map((t) => toWorkoutPlanView(t, true, this.resolveCoverUrl)),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  }

  async create(input: CreateTemplateAdminInput): Promise<WorkoutPlanView> {
    const coverImageKey = input.coverImageKey ?? null;
    if (coverImageKey !== null) await this.assertCoverSaveable(coverImageKey);

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

    const templateId = crypto.randomUUID();
    const now = new Date();

    const planExercises = input.exercises.map(
      (e) =>
        new WorkoutPlanExercise({
          id: crypto.randomUUID(),
          workoutId: templateId,
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

    const template = new WorkoutPlan({
      id: templateId,
      userId: null, // System template ownership: null
      name: input.name,
      description: input.description ?? null,
      workoutType: input.workoutType ?? 'strength',
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? 45,
      difficulty: input.difficulty ?? 'intermediate',
      isTemplate: true,
      isAiGenerated: false,
      tags: input.tags ?? [],
      coverImageKey,
      exercises: planExercises,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const created = await this.workoutRepo.create(template);

    await this.auditLogger.logAction(
      input.adminId,
      'workout.template.create',
      { templateId: created.id, name: created.name, hasCover: created.coverImageKey !== null },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toWorkoutPlanView(created, true, this.resolveCoverUrl);
  }

  async update(input: UpdateTemplateAdminInput): Promise<WorkoutPlanView> {
    const existing = await this.workoutRepo.findById(input.templateId);
    if (!existing || existing.deletedAt !== null || !existing.isTemplate) {
      throw new AppError('not_found', 'NOT_FOUND', 'System workout template not found.');
    }

    // Only a key that is new to this template is checked against storage: editing the text of a template that
    // already has a cover never depends on R2 being reachable.
    const newCover = input.coverImageKey;
    if (typeof newCover === 'string' && newCover !== existing.coverImageKey) {
      await this.assertCoverSaveable(newCover);
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
            workoutId: input.templateId,
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
      userId: null,
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      workoutType: input.workoutType ?? existing.workoutType,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? existing.estimatedDurationMinutes,
      difficulty: input.difficulty ?? existing.difficulty,
      isTemplate: true,
      isAiGenerated: existing.isAiGenerated,
      tags: input.tags ?? [...existing.tags],
      // Replacing or removing a cover only changes the reference: the previous object stays in storage.
      coverImageKey: input.coverImageKey !== undefined ? input.coverImageKey : existing.coverImageKey,
      exercises: [...updatedExercises],
      createdAt: existing.createdAt,
      updatedAt: new Date(),
      deletedAt: null,
    });

    const saved = await this.workoutRepo.update(input.templateId, updated);
    if (!saved) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to update system template.');
    }

    await this.auditLogger.logAction(
      input.adminId,
      'workout.template.update',
      {
        templateId: saved.id,
        name: saved.name,
        hasCover: saved.coverImageKey !== null,
        coverChanged: saved.coverImageKey !== existing.coverImageKey,
      },
      null,
      input.ipAddress,
      input.userAgent,
    );

    return toWorkoutPlanView(saved, true, this.resolveCoverUrl);
  }

  async delete(adminId: string, templateId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const existing = await this.workoutRepo.findById(templateId);
    if (!existing || existing.deletedAt !== null || !existing.isTemplate) {
      throw new AppError('not_found', 'NOT_FOUND', 'System workout template not found.');
    }

    await this.workoutRepo.softDelete(templateId);

    await this.auditLogger.logAction(
      adminId,
      'workout.template.delete',
      { templateId, name: existing.name },
      null,
      ipAddress,
      userAgent,
    );
  }
}

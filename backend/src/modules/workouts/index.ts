import type { RequestHandler } from 'express';
import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.js';
import type { ImageLogger } from '../../shared/images/public-image-check.js';
import type { ImageProcessor } from '../../shared/images/image-processor.js';
import { createFeatureImageUrlResolver } from '../../shared/images/public-image-url.js';
import type { PublicObjectStore } from '../../shared/storage/object-store.js';
import { AdminManageExerciseUseCase } from './application/use-cases/admin-manage-exercise.js';
import { AdminManageTemplateUseCase } from './application/use-cases/admin-manage-template.js';
import { CreateWorkoutPlanUseCase } from './application/use-cases/create-workout-plan.js';
import { DeleteWorkoutPlanUseCase } from './application/use-cases/delete-workout-plan.js';
import { GetExerciseUseCase } from './application/use-cases/get-exercise.js';
import { GetWorkoutPlanUseCase } from './application/use-cases/get-workout-plan.js';
import { GetWorkoutSessionUseCase } from './application/use-cases/get-workout-session.js';
import { GetWorkoutStatsUseCase } from './application/use-cases/get-workout-stats.js';
import { ListExercisesUseCase } from './application/use-cases/list-exercises.js';
import { ListPersonalRecordsUseCase } from './application/use-cases/list-personal-records.js';
import { ListWorkoutPlansUseCase } from './application/use-cases/list-workout-plans.js';
import { ListWorkoutSessionsUseCase } from './application/use-cases/list-workout-sessions.js';
import { UploadExerciseImageUseCase } from './application/use-cases/upload-exercise-image.js';
import { UploadWorkoutCoverUseCase } from './application/use-cases/upload-workout-cover.js';
import { LogWorkoutSessionUseCase } from './application/use-cases/log-workout-session.js';
import { UpdateWorkoutPlanUseCase } from './application/use-cases/update-workout-plan.js';
import { PgExerciseRepository } from './infrastructure/pg-exercise-repository.js';
import { PgPersonalRecordRepository } from './infrastructure/pg-personal-record-repository.js';
import { PgWorkoutSessionRepository } from './infrastructure/pg-session-repository.js';
import { PgWorkoutAuditLogger } from './infrastructure/workout-audit-logger.js';
import { PgWorkoutPlanRepository } from './infrastructure/pg-workout-repository.js';
import { createWorkoutAdminController } from './interface/admin-workouts.controller.js';
import { createWorkoutAdminRoutes } from './interface/admin-workouts.routes.js';
import { createWorkoutMemberController } from './interface/workouts.controller.js';
import { createWorkoutMemberRoutes } from './interface/workouts.routes.js';

export type {
  ExerciseView,
  WorkoutPlanView,
  WorkoutPlanExerciseView,
  WorkoutSessionView,
  WorkoutSessionSetView,
  PersonalRecordView,
} from './application/workout-view.js';
export type { WorkoutStatsView } from './application/use-cases/get-workout-stats.js';
export * from './application/ports.js';

export interface WorkoutsModule {
  memberRoutes: RouteGroup;
  adminRoutes: RouteGroup;
  exerciseRepo: PgExerciseRepository;
  workoutRepo: PgWorkoutPlanRepository;
  sessionRepo: PgWorkoutSessionRepository;
  prRepo: PgPersonalRecordRepository;
}

export function createWorkoutsModule(deps: {
  memberBasePath: string;
  adminBasePath: string;
  db: SqlExecutor;
  uow: UnitOfWork;
  idempotency?: IdempotencyService;
  /**
   * Exercise images and workout template covers. `store` null (R2 not configured) turns uploads off; exercises and
   * templates without an uploaded image are unaffected. `publicBaseUrl` is the trusted origin every uploaded image
   * URL is built from.
   */
  images?: {
    store: PublicObjectStore | null;
    publicBaseUrl: string | null;
    /** Validates and converts uploads. Null/omitted turns uploads off. */
    processor?: Pick<ImageProcessor, 'process'> | null;
  };
  limiters?: { adminImageUploads: RequestHandler };
  logger?: ImageLogger | undefined;
}): WorkoutsModule {
  const exerciseRepo = new PgExerciseRepository(deps.db);
  const workoutRepo = new PgWorkoutPlanRepository(deps.db);
  const sessionRepo = new PgWorkoutSessionRepository(deps.db);
  const prRepo = new PgPersonalRecordRepository(deps.db);
  const auditLogger = new PgWorkoutAuditLogger(deps.db);

  // Uploaded exercise images: the URL is only ever built from the trusted media origin and a canonical key.
  const resolveImageUrl = createFeatureImageUrlResolver(deps.images?.publicBaseUrl ?? null, 'exercises');
  // Uploaded template covers: a separate resolver, because a cover's key belongs to the `workouts` folder, and an
  // exercise key (or any other feature's) must never resolve to a cover URL, or the other way round.
  const resolveCoverUrl = createFeatureImageUrlResolver(deps.images?.publicBaseUrl ?? null, 'workouts');
  const imageProcessor = deps.images?.processor;
  const imageDeps = {
    store: deps.images?.store ?? null,
    resolveUrl: resolveImageUrl,
    logger: deps.logger,
  };
  const coverDeps = { ...imageDeps, resolveUrl: resolveCoverUrl };

  // Member use cases
  const memberController = createWorkoutMemberController({
    listExercises: new ListExercisesUseCase(exerciseRepo, resolveImageUrl),
    getExercise: new GetExerciseUseCase(exerciseRepo, resolveImageUrl),
    listWorkoutPlans: new ListWorkoutPlansUseCase(workoutRepo, resolveCoverUrl),
    getWorkoutPlan: new GetWorkoutPlanUseCase(workoutRepo, resolveCoverUrl),
    createWorkoutPlan: new CreateWorkoutPlanUseCase(workoutRepo, exerciseRepo),
    updateWorkoutPlan: new UpdateWorkoutPlanUseCase(workoutRepo, exerciseRepo),
    deleteWorkoutPlan: new DeleteWorkoutPlanUseCase(workoutRepo),
    logWorkoutSession: new LogWorkoutSessionUseCase(sessionRepo, prRepo, exerciseRepo, deps.idempotency),
    listWorkoutSessions: new ListWorkoutSessionsUseCase(sessionRepo),
    getWorkoutSession: new GetWorkoutSessionUseCase(sessionRepo),
    listPersonalRecords: new ListPersonalRecordsUseCase(prRepo),
  });

  // Admin use cases
  const adminController = createWorkoutAdminController({
    listExercises: new ListExercisesUseCase(exerciseRepo, resolveImageUrl),
    manageExercise: new AdminManageExerciseUseCase(exerciseRepo, auditLogger, imageDeps),
    uploadExerciseImage: new UploadExerciseImageUseCase({
      ...imageDeps,
      process: imageProcessor ? (bytes) => imageProcessor.process(bytes, 'exercises') : null,
      audit: auditLogger,
    }),
    uploadWorkoutCover: new UploadWorkoutCoverUseCase({
      ...coverDeps,
      process: imageProcessor ? (bytes) => imageProcessor.process(bytes, 'workouts') : null,
      audit: auditLogger,
    }),
    manageTemplate: new AdminManageTemplateUseCase(workoutRepo, exerciseRepo, auditLogger, coverDeps),
    getStats: new GetWorkoutStatsUseCase(exerciseRepo, workoutRepo, sessionRepo),
  });

  return {
    memberRoutes: createWorkoutMemberRoutes(deps.memberBasePath, memberController),
    adminRoutes: createWorkoutAdminRoutes(deps.adminBasePath, adminController, deps.limiters),
    exerciseRepo,
    workoutRepo,
    sessionRepo,
    prRepo,
  };
}

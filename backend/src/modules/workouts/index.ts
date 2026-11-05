import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
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
}): WorkoutsModule {
  const exerciseRepo = new PgExerciseRepository(deps.db);
  const workoutRepo = new PgWorkoutPlanRepository(deps.db);
  const sessionRepo = new PgWorkoutSessionRepository(deps.db);
  const prRepo = new PgPersonalRecordRepository(deps.db);
  const auditLogger = new PgWorkoutAuditLogger(deps.db);

  // Member use cases
  const memberController = createWorkoutMemberController({
    listExercises: new ListExercisesUseCase(exerciseRepo),
    getExercise: new GetExerciseUseCase(exerciseRepo),
    listWorkoutPlans: new ListWorkoutPlansUseCase(workoutRepo),
    getWorkoutPlan: new GetWorkoutPlanUseCase(workoutRepo),
    createWorkoutPlan: new CreateWorkoutPlanUseCase(workoutRepo, exerciseRepo),
    updateWorkoutPlan: new UpdateWorkoutPlanUseCase(workoutRepo, exerciseRepo),
    deleteWorkoutPlan: new DeleteWorkoutPlanUseCase(workoutRepo),
    logWorkoutSession: new LogWorkoutSessionUseCase(sessionRepo, prRepo, exerciseRepo),
    listWorkoutSessions: new ListWorkoutSessionsUseCase(sessionRepo),
    getWorkoutSession: new GetWorkoutSessionUseCase(sessionRepo),
    listPersonalRecords: new ListPersonalRecordsUseCase(prRepo),
  });

  // Admin use cases
  const adminController = createWorkoutAdminController({
    listExercises: new ListExercisesUseCase(exerciseRepo),
    manageExercise: new AdminManageExerciseUseCase(exerciseRepo, auditLogger),
    manageTemplate: new AdminManageTemplateUseCase(workoutRepo, exerciseRepo, auditLogger),
    getStats: new GetWorkoutStatsUseCase(exerciseRepo, workoutRepo, sessionRepo),
  });

  return {
    memberRoutes: createWorkoutMemberRoutes(deps.memberBasePath, memberController),
    adminRoutes: createWorkoutAdminRoutes(deps.adminBasePath, adminController),
    exerciseRepo,
    workoutRepo,
    sessionRepo,
    prRepo,
  };
}

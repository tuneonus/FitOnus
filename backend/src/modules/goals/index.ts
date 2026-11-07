// Goals Domain
export * from './domain/goal.js';
export * from './domain/goal-checkpoint.js';
export * from './domain/habit.js';
export * from './domain/habit-completion.js';
export * from './domain/goal-calculator.js';
export * from './domain/streak-calculator.js';

// Goals Application Ports & Views
export * from './application/ports.js';
export * from './application/goals-view.js';
export * from './application/errors.js';

// Goals Application Use Cases
export * from './application/use-cases/create-goal.js';
export * from './application/use-cases/list-goals.js';
export * from './application/use-cases/get-goal-details.js';
export * from './application/use-cases/update-goal.js';
export * from './application/use-cases/delete-goal.js';
export * from './application/use-cases/calculate-goal-progress.js';
export * from './application/use-cases/goal-checkpoints.js';
export * from './application/use-cases/create-habit.js';
export * from './application/use-cases/list-habits.js';
export * from './application/use-cases/update-habit.js';
export * from './application/use-cases/delete-habit.js';
export * from './application/use-cases/set-habit-completion.js';
export * from './application/use-cases/calculate-habit-streaks.js';
export * from './application/use-cases/get-habit-history.js';

// Goals Infrastructure Repositories
export * from './infrastructure/pg-goal-repository.js';
export * from './infrastructure/pg-habit-repository.js';
export * from './infrastructure/pg-goals-telemetry-adapter.js';

// Goals Interface HTTP & Routing
export * from './interface/goals.schemas.js';
export * from './interface/goals.controller.js';
export * from './interface/goals.routes.js';

import type { SqlExecutor } from '../../database/transaction.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { PgGoalRepository } from './infrastructure/pg-goal-repository.js';
import { PgHabitRepository } from './infrastructure/pg-habit-repository.js';
import { PgGoalsTelemetryAdapter } from './infrastructure/pg-goals-telemetry-adapter.js';
import { CreateGoalUseCase } from './application/use-cases/create-goal.js';
import { ListGoalsUseCase } from './application/use-cases/list-goals.js';
import { GetGoalDetailsUseCase } from './application/use-cases/get-goal-details.js';
import { UpdateGoalUseCase } from './application/use-cases/update-goal.js';
import { DeleteGoalUseCase } from './application/use-cases/delete-goal.js';
import { CalculateGoalProgressUseCase } from './application/use-cases/calculate-goal-progress.js';
import {
  GetGoalCheckpointsUseCase,
  LogGoalCheckpointUseCase,
} from './application/use-cases/goal-checkpoints.js';
import { CreateHabitUseCase } from './application/use-cases/create-habit.js';
import { ListHabitsUseCase } from './application/use-cases/list-habits.js';
import { GetHabitHistoryUseCase } from './application/use-cases/get-habit-history.js';
import { UpdateHabitUseCase } from './application/use-cases/update-habit.js';
import { DeleteHabitUseCase } from './application/use-cases/delete-habit.js';
import { SetHabitCompletionUseCase } from './application/use-cases/set-habit-completion.js';
import { CalculateHabitStreaksUseCase } from './application/use-cases/calculate-habit-streaks.js';
import {
  createGoalsController,
  type GoalsController,
  type GoalsUseCases,
} from './interface/goals.controller.js';
import { createGoalsRoutes, createHabitsRoutes } from './interface/goals.routes.js';

export interface GoalsModule {
  goalsRoutes: RouteGroup;
  habitsRoutes: RouteGroup;
  routes: RouteGroup[];
  goalRepo: PgGoalRepository;
  habitRepo: PgHabitRepository;
  telemetryAdapter: PgGoalsTelemetryAdapter;
  useCases: GoalsUseCases;
  controller: GoalsController;
}

export interface CreateGoalsModuleOptions {
  basePath?: string;
  goalsBasePath?: string;
  habitsBasePath?: string;
  db: SqlExecutor;
}

export function createGoalsModule(deps: CreateGoalsModuleOptions): GoalsModule {
  const goalRepo = new PgGoalRepository(deps.db);
  const habitRepo = new PgHabitRepository(deps.db);
  const telemetryAdapter = new PgGoalsTelemetryAdapter(deps.db);

  const useCases: GoalsUseCases = {
    createGoal: new CreateGoalUseCase(goalRepo, telemetryAdapter),
    listGoals: new ListGoalsUseCase(goalRepo, telemetryAdapter),
    getGoalDetails: new GetGoalDetailsUseCase(goalRepo, telemetryAdapter),
    updateGoal: new UpdateGoalUseCase(goalRepo),
    deleteGoal: new DeleteGoalUseCase(goalRepo),
    calculateGoalProgress: new CalculateGoalProgressUseCase(goalRepo),
    getGoalCheckpoints: new GetGoalCheckpointsUseCase(goalRepo),
    logGoalCheckpoint: new LogGoalCheckpointUseCase(goalRepo),
    createHabit: new CreateHabitUseCase(habitRepo),
    listHabits: new ListHabitsUseCase(habitRepo),
    getHabitHistory: new GetHabitHistoryUseCase(habitRepo),
    updateHabit: new UpdateHabitUseCase(habitRepo),
    deleteHabit: new DeleteHabitUseCase(habitRepo),
    setHabitCompletion: new SetHabitCompletionUseCase(habitRepo),
    calculateHabitStreaks: new CalculateHabitStreaksUseCase(habitRepo),
  };

  const controller = createGoalsController(useCases);

  const goalsBasePath = deps.goalsBasePath ?? (deps.basePath ? `${deps.basePath}/goals` : '/api/v1/goals');
  const habitsBasePath =
    deps.habitsBasePath ?? (deps.basePath ? `${deps.basePath}/habits` : '/api/v1/habits');

  const goalsRoutes = createGoalsRoutes(goalsBasePath, controller);
  const habitsRoutes = createHabitsRoutes(habitsBasePath, controller);

  return {
    goalsRoutes,
    habitsRoutes,
    routes: [goalsRoutes, habitsRoutes],
    goalRepo,
    habitRepo,
    telemetryAdapter,
    useCases,
    controller,
  };
}

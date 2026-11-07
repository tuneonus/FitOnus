/**
 * Analytics Module Public Interface
 *
 * Exports domain models, pure mathematical calculation engines,
 * application ports, DTOs, use cases, HTTP interface, and module factory.
 */

import type { SqlExecutor } from '../../database/transaction.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { PgAnalyticsWorkoutRepository } from './infrastructure/pg-analytics-workout-repository.js';
import { PgAnalyticsNutritionRepository } from './infrastructure/pg-analytics-nutrition-repository.js';
import { PgAnalyticsBodyRepository } from './infrastructure/pg-analytics-body-repository.js';
import { PgAnalyticsGoalsHabitsRepository } from './infrastructure/pg-analytics-goals-habits-repository.js';
import {
  GetAnalyticsOverviewUseCase,
  GetWorkoutAnalyticsUseCase,
  GetExerciseProgressionUseCase,
  GetNutritionAnalyticsUseCase,
  GetHydrationAnalyticsUseCase,
  GetBodyAnalyticsUseCase,
  GetGoalsHabitsAnalyticsUseCase,
} from './application/index.js';
import {
  createAnalyticsController,
  type AnalyticsController,
  type AnalyticsUseCases,
} from './interface/analytics.controller.js';
import { createAnalyticsRoutes } from './interface/analytics.routes.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/pg-analytics-workout-repository.js';
export * from './infrastructure/pg-analytics-nutrition-repository.js';
export * from './infrastructure/pg-analytics-body-repository.js';
export * from './infrastructure/pg-analytics-goals-habits-repository.js';
export * from './interface/analytics.schemas.js';
export * from './interface/analytics.controller.js';
export * from './interface/analytics.routes.js';

export interface AnalyticsModule {
  routes: RouteGroup;
  workoutRepo: PgAnalyticsWorkoutRepository;
  nutritionRepo: PgAnalyticsNutritionRepository;
  bodyRepo: PgAnalyticsBodyRepository;
  goalsHabitsRepo: PgAnalyticsGoalsHabitsRepository;
  useCases: AnalyticsUseCases;
  controller: AnalyticsController;
}

export interface CreateAnalyticsModuleOptions {
  basePath?: string;
  db: SqlExecutor;
}

/**
 * Analytics Module Composition Factory
 *
 * Wires repositories, application use cases, controllers, and Express route groups.
 */
export function createAnalyticsModule(deps: CreateAnalyticsModuleOptions): AnalyticsModule {
  const workoutRepo = new PgAnalyticsWorkoutRepository(deps.db);
  const nutritionRepo = new PgAnalyticsNutritionRepository(deps.db);
  const bodyRepo = new PgAnalyticsBodyRepository(deps.db);
  const goalsHabitsRepo = new PgAnalyticsGoalsHabitsRepository(deps.db);

  const useCases: AnalyticsUseCases = {
    getOverview: new GetAnalyticsOverviewUseCase(workoutRepo, nutritionRepo, bodyRepo),
    getWorkouts: new GetWorkoutAnalyticsUseCase(workoutRepo, bodyRepo),
    getExerciseProgression: new GetExerciseProgressionUseCase(workoutRepo),
    getNutrition: new GetNutritionAnalyticsUseCase(nutritionRepo, bodyRepo),
    getHydration: new GetHydrationAnalyticsUseCase(nutritionRepo),
    getBody: new GetBodyAnalyticsUseCase(bodyRepo),
    getGoalsHabits: new GetGoalsHabitsAnalyticsUseCase(goalsHabitsRepo),
  };

  const controller = createAnalyticsController(useCases);
  const basePath = deps.basePath ?? '/api/v1/analytics';
  const routes = createAnalyticsRoutes(basePath, controller);

  return {
    routes,
    workoutRepo,
    nutritionRepo,
    bodyRepo,
    goalsHabitsRepo,
    useCases,
    controller,
  };
}

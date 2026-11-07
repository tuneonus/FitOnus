/**
 * Analytics HTTP Controller
 *
 * Thin controller layer mapping authenticated HTTP requests to Analytics Use Cases.
 */

import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type {
  GetAnalyticsOverviewUseCase,
  GetWorkoutAnalyticsUseCase,
  GetExerciseProgressionUseCase,
  GetNutritionAnalyticsUseCase,
  GetHydrationAnalyticsUseCase,
  GetBodyAnalyticsUseCase,
  GetGoalsHabitsAnalyticsUseCase,
} from '../application/index.js';
import type {
  ActivityOverviewView,
  WorkoutAnalyticsView,
  ExerciseProgressionView,
  NutritionAnalyticsView,
  HydrationAnalyticsView,
  BodyAnalyticsView,
  GoalsHabitsAnalyticsView,
} from '../application/dtos.js';
import {
  getAnalyticsOverviewRequest,
  getWorkoutAnalyticsRequest,
  getExerciseProgressionRequest,
  getNutritionAnalyticsRequest,
  getHydrationAnalyticsRequest,
  getBodyAnalyticsRequest,
  getGoalsHabitsAnalyticsRequest,
} from './analytics.schemas.js';

export interface AnalyticsUseCases {
  getOverview: GetAnalyticsOverviewUseCase;
  getWorkouts: GetWorkoutAnalyticsUseCase;
  getExerciseProgression: GetExerciseProgressionUseCase;
  getNutrition: GetNutritionAnalyticsUseCase;
  getHydration: GetHydrationAnalyticsUseCase;
  getBody: GetBodyAnalyticsUseCase;
  getGoalsHabits: GetGoalsHabitsAnalyticsUseCase;
}

export type AnalyticsController = ReturnType<typeof createAnalyticsController>;

export function createAnalyticsController(useCases: AnalyticsUseCases) {
  return {
    getOverview: async (req: Request): Promise<RouteResult<ActivityOverviewView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getAnalyticsOverviewRequest);

      const data = await useCases.getOverview.execute({
        userId: actor.userId,
        timezone: query.timezone,
        refDate: query.refDate,
      });

      return {
        data,
        message: 'Activity overview retrieved successfully',
      };
    },

    getWorkouts: async (req: Request): Promise<RouteResult<WorkoutAnalyticsView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getWorkoutAnalyticsRequest);

      const data = await useCases.getWorkouts.execute({
        userId: actor.userId,
        range: query.range,
        timezone: query.timezone,
        refDate: query.refDate,
      });

      return {
        data,
        message: 'Workout analytics retrieved successfully',
      };
    },

    getExerciseProgression: async (req: Request): Promise<RouteResult<ExerciseProgressionView>> => {
      const actor = requireActor(req);
      const { params, query } = getValidated(req, getExerciseProgressionRequest);

      const data = await useCases.getExerciseProgression.execute({
        userId: actor.userId,
        exerciseId: params.exerciseId,
        range: query.range,
        timezone: query.timezone,
        refDate: query.refDate,
      });

      return {
        data,
        message: 'Exercise progression retrieved successfully',
      };
    },

    getNutrition: async (req: Request): Promise<RouteResult<NutritionAnalyticsView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getNutritionAnalyticsRequest);

      const data = await useCases.getNutrition.execute({
        userId: actor.userId,
        range: query.range,
        timezone: query.timezone,
        refDate: query.refDate,
      });

      return {
        data,
        message: 'Nutrition analytics retrieved successfully',
      };
    },

    getHydration: async (req: Request): Promise<RouteResult<HydrationAnalyticsView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getHydrationAnalyticsRequest);

      const data = await useCases.getHydration.execute({
        userId: actor.userId,
        range: query.range,
        timezone: query.timezone,
        refDate: query.refDate,
        customTargetMl: query.targetMl,
      });

      return {
        data,
        message: 'Hydration analytics retrieved successfully',
      };
    },

    getBody: async (req: Request): Promise<RouteResult<BodyAnalyticsView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getBodyAnalyticsRequest);

      const data = await useCases.getBody.execute({
        userId: actor.userId,
        range: query.range,
        timezone: query.timezone,
        refDate: query.refDate,
      });

      return {
        data,
        message: 'Body composition analytics retrieved successfully',
      };
    },

    getGoalsHabits: async (req: Request): Promise<RouteResult<GoalsHabitsAnalyticsView>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, getGoalsHabitsAnalyticsRequest);

      const data = await useCases.getGoalsHabits.execute({
        userId: actor.userId,
        windowDays: query.windowDays,
        timezone: query.timezone,
        refDate: query.refDate,
      });

      return {
        data,
        message: 'Goals and habits analytics retrieved successfully',
      };
    },
  };
}

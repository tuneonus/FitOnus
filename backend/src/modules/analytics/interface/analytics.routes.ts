/**
 * Analytics HTTP Route Definitions
 *
 * Defines the 7 authenticated REST endpoints under /api/v1/analytics
 * using defineRoute for schema-driven validation, response serialization,
 * and OpenAPI generation.
 */

import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { AnalyticsController } from './analytics.controller.js';
import {
  getAnalyticsOverviewRequest,
  getWorkoutAnalyticsRequest,
  getExerciseProgressionRequest,
  getNutritionAnalyticsRequest,
  getHydrationAnalyticsRequest,
  getBodyAnalyticsRequest,
  getGoalsHabitsAnalyticsRequest,
  activityOverviewViewSchema,
  workoutAnalyticsViewSchema,
  exerciseProgressionViewSchema,
  nutritionAnalyticsViewSchema,
  hydrationAnalyticsViewSchema,
  bodyAnalyticsViewSchema,
  goalsHabitsAnalyticsViewSchema,
} from './analytics.schemas.js';

const analyticsTags = ['Analytics'];

export function createAnalyticsRoutes(
  basePath: string,
  controller: AnalyticsController,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Activity Overview
      defineRoute({
        method: 'get',
        path: '/overview',
        summary: 'Get Activity Overview',
        description: 'Returns consolidated 7-day activity metrics compared with the prior period.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getAnalyticsOverviewRequest,
        response: {
          status: 200,
          description: 'Activity overview retrieved successfully',
          message: 'Activity overview retrieved successfully',
          schema: activityOverviewViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getOverview,
      }),

      // 2. Workout Analytics
      defineRoute({
        method: 'get',
        path: '/workouts',
        summary: 'Get Workout Analytics',
        description: 'Returns workout frequency, volume, duration trends, and consistency score.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getWorkoutAnalyticsRequest,
        response: {
          status: 200,
          description: 'Workout analytics retrieved successfully',
          message: 'Workout analytics retrieved successfully',
          schema: workoutAnalyticsViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getWorkouts,
      }),

      // 3. Exercise Progression
      defineRoute({
        method: 'get',
        path: '/workouts/exercises/:exerciseId',
        summary: 'Get Exercise Progression',
        description: 'Returns exercise strength progression curve (e1RM, top weight, volume) and personal records.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getExerciseProgressionRequest,
        response: {
          status: 200,
          description: 'Exercise progression retrieved successfully',
          message: 'Exercise progression retrieved successfully',
          schema: exerciseProgressionViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getExerciseProgression,
      }),

      // 4. Nutrition Analytics
      defineRoute({
        method: 'get',
        path: '/nutrition',
        summary: 'Get Nutrition Analytics',
        description: 'Returns daily and average macronutrient trends, Atwater split, and target adherence.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getNutritionAnalyticsRequest,
        response: {
          status: 200,
          description: 'Nutrition analytics retrieved successfully',
          message: 'Nutrition analytics retrieved successfully',
          schema: nutritionAnalyticsViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getNutrition,
      }),

      // 5. Hydration Analytics
      defineRoute({
        method: 'get',
        path: '/hydration',
        summary: 'Get Hydration Analytics',
        description: 'Returns water intake daily trend and target adherence rate.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getHydrationAnalyticsRequest,
        response: {
          status: 200,
          description: 'Hydration analytics retrieved successfully',
          message: 'Hydration analytics retrieved successfully',
          schema: hydrationAnalyticsViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getHydration,
      }),

      // 6. Body Composition Analytics
      defineRoute({
        method: 'get',
        path: '/body',
        summary: 'Get Body Analytics',
        description: 'Returns EMA-smoothed weight trend, weekly velocity, and body measurement trajectories.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getBodyAnalyticsRequest,
        response: {
          status: 200,
          description: 'Body composition analytics retrieved successfully',
          message: 'Body composition analytics retrieved successfully',
          schema: bodyAnalyticsViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getBody,
      }),

      // 7. Goals & Habits Analytics
      defineRoute({
        method: 'get',
        path: '/goals-habits',
        summary: 'Get Goals & Habits Analytics',
        description: 'Returns goal stats, habit streaks, completion rates, and habit consistency heatmap.',
        tags: analyticsTags,
        access: { kind: 'authenticated' },
        request: getGoalsHabitsAnalyticsRequest,
        response: {
          status: 200,
          description: 'Goals and habits analytics retrieved successfully',
          message: 'Goals and habits analytics retrieved successfully',
          schema: goalsHabitsAnalyticsViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.getGoalsHabits,
      }),
    ],
  };
}


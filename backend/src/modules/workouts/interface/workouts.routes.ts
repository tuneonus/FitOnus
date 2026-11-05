import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { WorkoutMemberController } from './workouts.controller.js';
import {
  createWorkoutPlanRequest,
  deleteWorkoutPlanRequest,
  exerciseViewSchema,
  getExerciseRequest,
  getWorkoutPlanRequest,
  getWorkoutSessionRequest,
  listExercisesRequest,
  listPersonalRecordsRequest,
  listWorkoutPlansRequest,
  listWorkoutSessionsRequest,
  personalRecordViewSchema,
  saveWorkoutSessionRequest,
  updateWorkoutPlanRequest,
  workoutPlanDetailSchema,
  workoutPlanSummarySchema,
  workoutSessionViewSchema,
} from './workouts.schemas.js';

const tags = ['Workouts'];

export function createWorkoutMemberRoutes(basePath: string, controller: WorkoutMemberController): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. List Exercises
      defineRoute({
        method: 'get',
        path: '/exercises',
        summary: 'List exercises catalog',
        description: 'Browse and search system and custom exercises with muscle and equipment filters.',
        tags,
        access: { kind: 'authenticated' },
        request: listExercisesRequest,
        response: {
          status: 200,
          description: 'Exercises catalog',
          message: 'Exercises retrieved successfully',
          schema: z.array(exerciseViewSchema),
          paginated: true,
        },
        handler: controller.listExercises,
      }),

      // 2. Get Exercise Detail
      defineRoute({
        method: 'get',
        path: '/exercises/:id',
        summary: 'Get exercise details',
        description: 'Retrieve detailed exercise cues, instructions, and muscle mappings.',
        tags,
        access: { kind: 'authenticated' },
        request: getExerciseRequest,
        response: {
          status: 200,
          description: 'Exercise detail',
          message: 'Exercise retrieved successfully',
          schema: exerciseViewSchema,
        },
        errorStatuses: [404],
        handler: controller.getExercise,
      }),

      // 3. List Workout Plans
      defineRoute({
        method: 'get',
        path: '/plans',
        summary: 'List workout plans',
        description: 'Returns personal workout routines and system-curated starter templates.',
        tags,
        access: { kind: 'authenticated' },
        request: listWorkoutPlansRequest,
        response: {
          status: 200,
          description: 'Workout plans list',
          message: 'Workout plans retrieved successfully',
          schema: z.array(workoutPlanSummarySchema),
          paginated: true,
        },
        handler: controller.listWorkoutPlans,
      }),

      // 4. Create Workout Plan
      defineRoute({
        method: 'post',
        path: '/plans',
        summary: 'Create custom workout plan',
        description: 'Create a custom workout routine with ordered exercises, target sets, and rep ranges.',
        tags,
        access: { kind: 'authenticated' },
        request: createWorkoutPlanRequest,
        response: {
          status: 201,
          description: 'Created workout plan',
          message: 'Workout plan created successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [400],
        handler: controller.createWorkoutPlan,
      }),

      // 5. Get Workout Plan
      defineRoute({
        method: 'get',
        path: '/plans/:id',
        summary: 'Get workout plan details',
        description: 'Retrieve full routine structure including all ordered exercises.',
        tags,
        access: { kind: 'authenticated' },
        request: getWorkoutPlanRequest,
        response: {
          status: 200,
          description: 'Workout plan detail',
          message: 'Workout plan retrieved successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [403, 404],
        handler: controller.getWorkoutPlan,
      }),

      // 6. Update Workout Plan
      defineRoute({
        method: 'put',
        path: '/plans/:id',
        summary: 'Update custom workout plan',
        description: 'Update exercises, targets, or details of a user-owned workout plan.',
        tags,
        access: { kind: 'authenticated' },
        request: updateWorkoutPlanRequest,
        response: {
          status: 200,
          description: 'Updated workout plan',
          message: 'Workout plan updated successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [400, 403, 404],
        handler: controller.updateWorkoutPlan,
      }),

      // 7. Delete Workout Plan
      defineRoute({
        method: 'delete',
        path: '/plans/:id',
        summary: 'Delete custom workout plan',
        description: 'Soft-delete a user-owned workout routine.',
        tags,
        access: { kind: 'authenticated' },
        request: deleteWorkoutPlanRequest,
        response: {
          status: 204,
          description: 'Workout plan deleted',
          message: 'Workout plan deleted',
          schema: z.object({ success: z.boolean() }),
        },
        errorStatuses: [403, 404],
        handler: controller.deleteWorkoutPlan,
      }),

      // 8. Log / Save Workout Session
      defineRoute({
        method: 'post',
        path: '/sessions',
        summary: 'Save completed workout session',
        description: 'Atomically persists completed workout telemetry, evaluates PRs, and updates volume.',
        tags,
        access: { kind: 'authenticated' },
        request: saveWorkoutSessionRequest,
        response: {
          status: 201,
          description: 'Completed workout session summary',
          message: 'Workout session completed and saved successfully',
          schema: workoutSessionViewSchema,
        },
        errorStatuses: [400],
        handler: controller.saveWorkoutSession,
      }),

      // 9. List Workout Sessions
      defineRoute({
        method: 'get',
        path: '/sessions',
        summary: 'List user workout sessions',
        description: 'Chronological workout history with volume, duration, and exercise details.',
        tags,
        access: { kind: 'authenticated' },
        request: listWorkoutSessionsRequest,
        response: {
          status: 200,
          description: 'Workout sessions history',
          message: 'Workout sessions retrieved successfully',
          schema: z.array(workoutSessionViewSchema),
          paginated: true,
        },
        handler: controller.listWorkoutSessions,
      }),

      // 10. Get Workout Session Detail
      defineRoute({
        method: 'get',
        path: '/sessions/:id',
        summary: 'Get workout session details',
        description: 'Set-by-set telemetry and performance metrics for a specific completed session.',
        tags,
        access: { kind: 'authenticated' },
        request: getWorkoutSessionRequest,
        response: {
          status: 200,
          description: 'Workout session detail',
          message: 'Workout session retrieved successfully',
          schema: workoutSessionViewSchema,
        },
        errorStatuses: [403, 404],
        handler: controller.getWorkoutSession,
      }),

      // 11. List Personal Records
      defineRoute({
        method: 'get',
        path: '/records',
        summary: 'List personal records',
        description: 'Current all-time best records or milestone progression history per exercise.',
        tags,
        access: { kind: 'authenticated' },
        request: listPersonalRecordsRequest,
        response: {
          status: 200,
          description: 'Personal records list',
          message: 'Personal records retrieved successfully',
          schema: z.array(personalRecordViewSchema),
        },
        handler: controller.listPersonalRecords,
      }),
    ],
  };
}

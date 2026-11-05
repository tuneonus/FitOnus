import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { WorkoutAdminController } from './admin-workouts.controller.js';
import {
  createAdminTemplateRequest,
  createExerciseAdminRequest,
  deleteAdminTemplateRequest,
  deleteExerciseAdminRequest,
  exerciseViewSchema,
  listAdminTemplatesRequest,
  listExercisesRequest,
  updateAdminTemplateRequest,
  updateExerciseAdminRequest,
  workoutPlanDetailSchema,
  workoutStatsSchema,
} from './workouts.schemas.js';

const tags = ['Admin Workouts'];

export function createWorkoutAdminRoutes(basePath: string, controller: WorkoutAdminController): RouteGroup {
  return {
    basePath,
    routes: [
      // 0. List System Exercises
      defineRoute({
        method: 'get',
        path: '/exercises',
        summary: 'Admin List Exercises',
        description: 'Browse global exercise library with search and filters.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: listExercisesRequest,
        response: {
          status: 200,
          description: 'Exercises list',
          message: 'Exercises retrieved successfully',
          schema: z.array(exerciseViewSchema),
          paginated: true,
        },
        errorStatuses: [401, 403],
        handler: controller.listExercises,
      }),

      // 1. Create System Exercise
      defineRoute({
        method: 'post',
        path: '/exercises',
        summary: 'Admin Create Exercise',
        description: 'Add a new verified exercise to the global library with instructions and cues.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: createExerciseAdminRequest,
        response: {
          status: 201,
          description: 'Exercise created',
          message: 'Exercise created successfully',
          schema: exerciseViewSchema,
        },
        errorStatuses: [400, 401, 403],
        handler: controller.createExercise,
      }),

      // 2. Update System Exercise
      defineRoute({
        method: 'put',
        path: '/exercises/:id',
        summary: 'Admin Update Exercise',
        description: 'Update metadata, instructions, or muscle targets of a global exercise.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: updateExerciseAdminRequest,
        response: {
          status: 200,
          description: 'Exercise updated',
          message: 'Exercise updated successfully',
          schema: exerciseViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.updateExercise,
      }),

      // 3. Delete System Exercise
      defineRoute({
        method: 'delete',
        path: '/exercises/:id',
        summary: 'Admin Delete Exercise',
        description: 'Soft-delete a global exercise from the library.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: deleteExerciseAdminRequest,
        response: {
          status: 204,
          description: 'Exercise deleted',
          message: 'Exercise deleted successfully',
          schema: z.object({ success: z.boolean() }),
        },
        errorStatuses: [401, 403, 404],
        handler: controller.deleteExercise,
      }),

      // 4. List System Templates
      defineRoute({
        method: 'get',
        path: '/templates',
        summary: 'Admin List Workout Templates',
        description: 'List system-curated starter workout routines.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: listAdminTemplatesRequest,
        response: {
          status: 200,
          description: 'Templates list',
          message: 'System workout templates retrieved successfully',
          schema: z.array(workoutPlanDetailSchema),
          paginated: true,
        },
        errorStatuses: [401, 403],
        handler: controller.listTemplates,
      }),

      // 5. Create System Template
      defineRoute({
        method: 'post',
        path: '/templates',
        summary: 'Admin Create Workout Template',
        description: 'Create a system-curated starter workout routine (is_template = true, user_id = null).',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: createAdminTemplateRequest,
        response: {
          status: 201,
          description: 'Template created',
          message: 'System workout template created successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [400, 401, 403],
        handler: controller.createTemplate,
      }),

      // 6. Update System Template
      defineRoute({
        method: 'put',
        path: '/templates/:id',
        summary: 'Admin Update Workout Template',
        description: 'Update exercises or configuration of a system template.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: updateAdminTemplateRequest,
        response: {
          status: 200,
          description: 'Template updated',
          message: 'System workout template updated successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.updateTemplate,
      }),

      // 7. Delete System Template
      defineRoute({
        method: 'delete',
        path: '/templates/:id',
        summary: 'Admin Delete Workout Template',
        description: 'Soft-delete a system-curated workout template.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: deleteAdminTemplateRequest,
        response: {
          status: 204,
          description: 'Template deleted',
          message: 'System template deleted successfully',
          schema: z.object({ success: z.boolean() }),
        },
        errorStatuses: [401, 403, 404],
        handler: controller.deleteTemplate,
      }),

      // 8. Workout Statistics
      defineRoute({
        method: 'get',
        path: '/stats',
        summary: 'Admin Workout Statistics',
        description: 'Aggregate platform workout metrics, volume lifted, and session counts.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        response: {
          status: 200,
          description: 'Workout platform statistics',
          message: 'Workout platform statistics retrieved successfully',
          schema: workoutStatsSchema,
        },
        errorStatuses: [401, 403],
        handler: controller.getStats,
      }),
    ],
  };
}

import type { RequestHandler } from 'express';
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
  uploadedExerciseImageSchema,
  uploadedWorkoutCoverSchema,
  workoutPlanDetailSchema,
  workoutStatsSchema,
} from './workouts.schemas.js';

const tags = ['Admin Workouts'];

export interface WorkoutAdminRateLimiters {
  /** Image uploads (exercises, template covers): each decodes and re-encodes a picture and writes to the public bucket. */
  adminImageUploads: RequestHandler;
}

export function createWorkoutAdminRoutes(
  basePath: string,
  controller: WorkoutAdminController,
  limiters?: WorkoutAdminRateLimiters,
): RouteGroup {
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

      // 0b. Upload an exercise picture
      defineRoute({
        method: 'post',
        path: '/exercises/images',
        summary: 'Admin Upload Exercise Image',
        description:
          'The request body is the raw image file, not JSON or multipart: send Content-Type image/jpeg, image/png, ' +
          'image/webp or image/heic. At most 10 MB, 8192 px on a side and 40 megapixels (HEIC: 16). The file content ' +
          'is inspected, so the declared type alone is not trusted. The image is converted to an optimized WebP (at ' +
          'most 1600 px on the long side) with all metadata (EXIF, GPS) removed and stored in the public media bucket ' +
          'under onusfit/exercises/ with a random name. Returns the imageKey to send when creating or updating an ' +
          'exercise, and its public imageUrl. Uploading attaches nothing by itself. Answers 503 when R2 is not ' +
          'configured. Only for admin-authored artwork: the bucket is public.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        middleware: limiters ? [limiters.adminImageUploads] : [],
        response: {
          status: 201,
          description: 'Stored image',
          message: 'Image uploaded',
          schema: uploadedExerciseImageSchema,
        },
        errorStatuses: [400, 401, 403, 413, 415, 422, 503],
        handler: controller.uploadImage,
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

      // 4b. Upload a template cover picture
      defineRoute({
        method: 'post',
        path: '/templates/images',
        summary: 'Admin Upload Workout Template Cover',
        description:
          'The request body is the raw image file, not JSON or multipart: send Content-Type image/jpeg, image/png, ' +
          'image/webp or image/heic. At most 10 MB, 8192 px on a side and 40 megapixels (HEIC: 16). The file content ' +
          'is inspected, so the declared type alone is not trusted. The image is converted to an optimized WebP (at ' +
          'most 1600 px on the long side) with all metadata (EXIF, GPS) removed and stored in the public media bucket ' +
          'under onusfit/workouts/ with a random name. Returns the imageKey to send as coverImageKey when creating or ' +
          'updating a template, and its public imageUrl. Uploading attaches nothing by itself. Answers 503 when R2 ' +
          'is not configured. Only for admin-authored artwork: the bucket is public.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        middleware: limiters ? [limiters.adminImageUploads] : [],
        response: {
          status: 201,
          description: 'Stored image',
          message: 'Image uploaded',
          schema: uploadedWorkoutCoverSchema,
        },
        errorStatuses: [400, 401, 403, 413, 415, 422, 503],
        handler: controller.uploadTemplateCover,
      }),

      // 5. Create System Template
      defineRoute({
        method: 'post',
        path: '/templates',
        summary: 'Admin Create Workout Template',
        description:
          'Create a system-curated starter workout routine (is_template = true, user_id = null). An optional ' +
          'coverImageKey (from POST /templates/images) attaches a cover picture.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: createAdminTemplateRequest,
        response: {
          status: 201,
          description: 'Template created',
          message: 'System workout template created successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [400, 401, 403, 422, 503],
        handler: controller.createTemplate,
      }),

      // 6. Update System Template
      defineRoute({
        method: 'put',
        path: '/templates/:id',
        summary: 'Admin Update Workout Template',
        description:
          'Update exercises or configuration of a system template. coverImageKey: omitted = unchanged, null = ' +
          'remove the cover, a key from POST /templates/images = replace it (the old object stays in storage).',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: updateAdminTemplateRequest,
        response: {
          status: 200,
          description: 'Template updated',
          message: 'System workout template updated successfully',
          schema: workoutPlanDetailSchema,
        },
        errorStatuses: [400, 401, 403, 404, 422, 503],
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

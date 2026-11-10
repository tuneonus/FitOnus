import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import { ADMIN_NO_CACHE_HEADERS } from '../../admin/interface/admin.controller.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { AdminManageExerciseUseCase } from '../application/use-cases/admin-manage-exercise.js';
import type { AdminManageTemplateUseCase } from '../application/use-cases/admin-manage-template.js';
import type { GetWorkoutStatsUseCase, WorkoutStatsView } from '../application/use-cases/get-workout-stats.js';
import type { ListExercisesUseCase } from '../application/use-cases/list-exercises.js';
import type { ExerciseView, WorkoutPlanView } from '../application/workout-view.js';
import {
  createAdminTemplateRequest,
  createExerciseAdminRequest,
  deleteAdminTemplateRequest,
  deleteExerciseAdminRequest,
  listAdminTemplatesRequest,
  listExercisesRequest,
  updateAdminTemplateRequest,
  updateExerciseAdminRequest,
} from './workouts.schemas.js';

export interface WorkoutAdminUseCases {
  listExercises: ListExercisesUseCase;
  manageExercise: AdminManageExerciseUseCase;
  manageTemplate: AdminManageTemplateUseCase;
  getStats: GetWorkoutStatsUseCase;
}

export type WorkoutAdminController = ReturnType<typeof createWorkoutAdminController>;

export function createWorkoutAdminController(useCases: WorkoutAdminUseCases) {
  return {
    listExercises: async (req: Request): Promise<RouteResult<ExerciseView[]>> => {
      const { query } = getValidated(req, listExercisesRequest);
      const result = await useCases.listExercises.execute(query);
      return {
        data: result.exercises,
        status: 200,
        headers: ADMIN_NO_CACHE_HEADERS,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        message: 'Exercises retrieved successfully',
      };
    },

    createExercise: async (req: Request): Promise<RouteResult<ExerciseView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, createExerciseAdminRequest);
      const data = await useCases.manageExercise.create({
        adminId: actor.userId,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return { data, status: 201, headers: ADMIN_NO_CACHE_HEADERS, message: 'Exercise created successfully' };
    },

    updateExercise: async (req: Request): Promise<RouteResult<ExerciseView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, updateExerciseAdminRequest);
      const data = await useCases.manageExercise.update({
        adminId: actor.userId,
        exerciseId: params.id,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return { data, headers: ADMIN_NO_CACHE_HEADERS, message: 'Exercise updated successfully' };
    },

    deleteExercise: async (req: Request): Promise<RouteResult<{ success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteExerciseAdminRequest);
      await useCases.manageExercise.delete(actor.userId, params.id, req.ip, req.get('user-agent'));
      return { data: { success: true }, status: 204, headers: ADMIN_NO_CACHE_HEADERS, message: 'Exercise deleted successfully' };
    },

    listTemplates: async (req: Request): Promise<RouteResult<WorkoutPlanView[]>> => {
      const { query } = getValidated(req, listAdminTemplatesRequest);
      const res = await useCases.manageTemplate.list(query.page, query.limit, query.search);
      return {
        data: res.templates,
        headers: ADMIN_NO_CACHE_HEADERS,
        message: 'System workout templates retrieved successfully',
        meta: {
          page: res.page,
          limit: res.limit,
          total: res.total,
          totalPages: res.totalPages,
        },
      };
    },

    createTemplate: async (req: Request): Promise<RouteResult<WorkoutPlanView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, createAdminTemplateRequest);
      const data = await useCases.manageTemplate.create({
        adminId: actor.userId,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return { data, status: 201, headers: ADMIN_NO_CACHE_HEADERS, message: 'System workout template created successfully' };
    },

    updateTemplate: async (req: Request): Promise<RouteResult<WorkoutPlanView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, updateAdminTemplateRequest);
      const data = await useCases.manageTemplate.update({
        adminId: actor.userId,
        templateId: params.id,
        ...body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      return { data, headers: ADMIN_NO_CACHE_HEADERS, message: 'System workout template updated successfully' };
    },

    deleteTemplate: async (req: Request): Promise<RouteResult<{ success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteAdminTemplateRequest);
      await useCases.manageTemplate.delete(actor.userId, params.id, req.ip, req.get('user-agent'));
      return { data: { success: true }, status: 204, headers: ADMIN_NO_CACHE_HEADERS, message: 'System template deleted successfully' };
    },

    getStats: async (_req: Request): Promise<RouteResult<WorkoutStatsView>> => {
      const data = await useCases.getStats.execute();
      return { data, headers: ADMIN_NO_CACHE_HEADERS, message: 'Workout platform statistics retrieved successfully' };
    },
  };
}

import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { CreateWorkoutPlanUseCase } from '../application/use-cases/create-workout-plan.js';
import type { DeleteWorkoutPlanUseCase } from '../application/use-cases/delete-workout-plan.js';
import type { GetExerciseUseCase } from '../application/use-cases/get-exercise.js';
import type { GetWorkoutPlanUseCase } from '../application/use-cases/get-workout-plan.js';
import type { GetWorkoutSessionUseCase } from '../application/use-cases/get-workout-session.js';
import type { ListExercisesUseCase } from '../application/use-cases/list-exercises.js';
import type { ListPersonalRecordsUseCase } from '../application/use-cases/list-personal-records.js';
import type { ListWorkoutPlansUseCase } from '../application/use-cases/list-workout-plans.js';
import type { ListWorkoutSessionsUseCase } from '../application/use-cases/list-workout-sessions.js';
import type { LogWorkoutSessionUseCase } from '../application/use-cases/log-workout-session.js';
import type { UpdateWorkoutPlanUseCase } from '../application/use-cases/update-workout-plan.js';
import type {
  ExerciseView,
  PersonalRecordView,
  WorkoutPlanView,
  WorkoutSessionView,
} from '../application/workout-view.js';
import {
  createWorkoutPlanRequest,
  deleteWorkoutPlanRequest,
  getExerciseRequest,
  getWorkoutPlanRequest,
  getWorkoutSessionRequest,
  listExercisesRequest,
  listPersonalRecordsRequest,
  listWorkoutPlansRequest,
  listWorkoutSessionsRequest,
  saveWorkoutSessionRequest,
  updateWorkoutPlanRequest,
} from './workouts.schemas.js';

export interface WorkoutMemberUseCases {
  listExercises: ListExercisesUseCase;
  getExercise: GetExerciseUseCase;
  listWorkoutPlans: ListWorkoutPlansUseCase;
  getWorkoutPlan: GetWorkoutPlanUseCase;
  createWorkoutPlan: CreateWorkoutPlanUseCase;
  updateWorkoutPlan: UpdateWorkoutPlanUseCase;
  deleteWorkoutPlan: DeleteWorkoutPlanUseCase;
  logWorkoutSession: LogWorkoutSessionUseCase;
  listWorkoutSessions: ListWorkoutSessionsUseCase;
  getWorkoutSession: GetWorkoutSessionUseCase;
  listPersonalRecords: ListPersonalRecordsUseCase;
}

export type WorkoutMemberController = ReturnType<typeof createWorkoutMemberController>;

export function createWorkoutMemberController(useCases: WorkoutMemberUseCases) {
  return {
    listExercises: async (req: Request): Promise<RouteResult<ExerciseView[]>> => {
      const { query } = getValidated(req, listExercisesRequest);
      const res = await useCases.listExercises.execute(query);
      return {
        data: res.exercises,
        message: 'Exercises retrieved successfully',
        meta: {
          page: res.page,
          limit: res.limit,
          total: res.total,
          totalPages: res.totalPages,
        },
      };
    },

    getExercise: async (req: Request): Promise<RouteResult<ExerciseView>> => {
      const { params } = getValidated(req, getExerciseRequest);
      const data = await useCases.getExercise.execute(params.id);
      return { data, message: 'Exercise retrieved successfully' };
    },

    listWorkoutPlans: async (req: Request): Promise<RouteResult<WorkoutPlanView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, listWorkoutPlansRequest);
      const res = await useCases.listWorkoutPlans.execute({
        userId: actor.userId,
        type: query.type,
        page: query.page,
        limit: query.limit,
      });
      return {
        data: res.plans,
        message: 'Workout plans retrieved successfully',
        meta: {
          page: res.page,
          limit: res.limit,
          total: res.total,
          totalPages: res.totalPages,
        },
      };
    },

    getWorkoutPlan: async (req: Request): Promise<RouteResult<WorkoutPlanView>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, getWorkoutPlanRequest);
      const data = await useCases.getWorkoutPlan.execute(actor.userId, params.id);
      return { data, message: 'Workout plan retrieved successfully' };
    },

    createWorkoutPlan: async (req: Request): Promise<RouteResult<WorkoutPlanView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, createWorkoutPlanRequest);
      const data = await useCases.createWorkoutPlan.execute({
        userId: actor.userId,
        ...body,
      });
      return { data, status: 201, message: 'Workout plan created successfully' };
    },

    updateWorkoutPlan: async (req: Request): Promise<RouteResult<WorkoutPlanView>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, updateWorkoutPlanRequest);
      const data = await useCases.updateWorkoutPlan.execute({
        userId: actor.userId,
        planId: params.id,
        ...body,
      });
      return { data, message: 'Workout plan updated successfully' };
    },

    deleteWorkoutPlan: async (req: Request): Promise<RouteResult<{ success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteWorkoutPlanRequest);
      await useCases.deleteWorkoutPlan.execute(actor.userId, params.id);
      return { data: { success: true }, status: 204, message: 'Workout plan deleted' };
    },

    saveWorkoutSession: async (req: Request): Promise<RouteResult<WorkoutSessionView>> => {
      const actor = requireActor(req);
      const { body, headers } = getValidated(req, saveWorkoutSessionRequest);
      const idempotencyKey = headers?.['idempotency-key'];
      const result = await useCases.logWorkoutSession.execute(
        {
          userId: actor.userId,
          workoutId: body.workoutId,
          workoutName: body.workoutName,
          startedAt: new Date(body.startedAt),
          completedAt: new Date(body.completedAt),
          durationSeconds: body.durationSeconds,
          difficultyRating: body.difficultyRating,
          notes: body.notes,
          caloriesBurned: body.caloriesBurned,
          caloriesSource: body.caloriesSource,
          sets: body.sets,
        },
        idempotencyKey,
      );
      return {
        data: result.value,
        status: 201,
        headers: result.replayed ? { 'Idempotent-Replayed': 'true' } : undefined,
        message: 'Workout session completed and saved successfully',
      };
    },

    listWorkoutSessions: async (req: Request): Promise<RouteResult<WorkoutSessionView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, listWorkoutSessionsRequest);
      const res = await useCases.listWorkoutSessions.execute({
        userId: actor.userId,
        workoutId: query.workoutId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page,
        limit: query.limit,
      });
      return {
        data: res.sessions,
        message: 'Workout sessions retrieved successfully',
        meta: {
          page: res.page,
          limit: res.limit,
          total: res.total,
          totalPages: res.totalPages,
        },
      };
    },

    getWorkoutSession: async (req: Request): Promise<RouteResult<WorkoutSessionView>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, getWorkoutSessionRequest);
      const data = await useCases.getWorkoutSession.execute(actor.userId, params.id);
      return { data, message: 'Workout session retrieved successfully' };
    },

    listPersonalRecords: async (req: Request): Promise<RouteResult<PersonalRecordView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, listPersonalRecordsRequest);
      const res = await useCases.listPersonalRecords.execute({
        userId: actor.userId,
        exerciseId: query.exerciseId,
        type: query.type,
      });
      return { data: res.records, message: 'Personal records retrieved successfully' };
    },
  };
}

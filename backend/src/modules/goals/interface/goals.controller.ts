import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { CreateGoalUseCase } from '../application/use-cases/create-goal.js';
import type { ListGoalsUseCase } from '../application/use-cases/list-goals.js';
import type { GetGoalDetailsUseCase } from '../application/use-cases/get-goal-details.js';
import type { UpdateGoalUseCase } from '../application/use-cases/update-goal.js';
import type { DeleteGoalUseCase } from '../application/use-cases/delete-goal.js';
import type {
  CalculateGoalProgressUseCase,
  GoalProgressResult,
} from '../application/use-cases/calculate-goal-progress.js';
import type {
  GetGoalCheckpointsUseCase,
  LogGoalCheckpointUseCase,
} from '../application/use-cases/goal-checkpoints.js';
import type { CreateHabitUseCase } from '../application/use-cases/create-habit.js';
import type { ListHabitsUseCase } from '../application/use-cases/list-habits.js';
import type { GetHabitHistoryUseCase } from '../application/use-cases/get-habit-history.js';
import type { UpdateHabitUseCase } from '../application/use-cases/update-habit.js';
import type { DeleteHabitUseCase } from '../application/use-cases/delete-habit.js';
import type {
  SetHabitCompletionUseCase,
  SetHabitCompletionResult,
} from '../application/use-cases/set-habit-completion.js';
import type { CalculateHabitStreaksUseCase } from '../application/use-cases/calculate-habit-streaks.js';
import type { StreakResult } from '../domain/streak-calculator.js';
import type {
  GoalView,
  GoalDetailsView,
  GoalCheckpointView,
  HabitView,
  HabitHistoryView,
} from '../application/goals-view.js';
import {
  createGoalRequest,
  listGoalsRequest,
  getGoalDetailsRequest,
  updateGoalRequest,
  deleteGoalRequest,
  calculateGoalProgressRequest,
  getGoalCheckpointsRequest,
  logGoalCheckpointRequest,
  createHabitRequest,
  listHabitsRequest,
  getHabitHistoryRequest,
  updateHabitRequest,
  deleteHabitRequest,
  setHabitCompletionRequest,
  getHabitStreaksRequest,
} from './goals.schemas.js';

export interface GoalsUseCases {
  createGoal: CreateGoalUseCase;
  listGoals: ListGoalsUseCase;
  getGoalDetails: GetGoalDetailsUseCase;
  updateGoal: UpdateGoalUseCase;
  deleteGoal: DeleteGoalUseCase;
  calculateGoalProgress: CalculateGoalProgressUseCase;
  getGoalCheckpoints: GetGoalCheckpointsUseCase;
  logGoalCheckpoint: LogGoalCheckpointUseCase;
  createHabit: CreateHabitUseCase;
  listHabits: ListHabitsUseCase;
  getHabitHistory: GetHabitHistoryUseCase;
  updateHabit: UpdateHabitUseCase;
  deleteHabit: DeleteHabitUseCase;
  setHabitCompletion: SetHabitCompletionUseCase;
  calculateHabitStreaks: CalculateHabitStreaksUseCase;
}

export type GoalsController = ReturnType<typeof createGoalsController>;

export function createGoalsController(useCases: GoalsUseCases) {
  return {
    createGoal: async (req: Request): Promise<RouteResult<GoalView>> => {
      const actor = requireActor(req);
      const { body, query } = getValidated(req, createGoalRequest);
      const result = await useCases.createGoal.execute({
        userId: actor.userId,
        type: body.type,
        title: body.title,
        description: body.description,
        targetValue: body.targetValue,
        startValue: body.startValue,
        metricUnit: body.metricUnit,
        cadence: body.cadence,
        direction: body.direction,
        isPrimary: body.isPrimary,
        deadlineLabel: body.deadlineLabel,
        targetDate: body.targetDate,
        metadata: body.metadata,
        timezone: query.timezone,
      });
      return {
        data: result,
        status: 201,
        message: 'Goal created successfully',
      };
    },

    listGoals: async (req: Request): Promise<RouteResult<GoalView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, listGoalsRequest);
      const result = await useCases.listGoals.execute({
        userId: actor.userId,
        status: query.status,
        isPrimary: query.isPrimary,
        syncTelemetry: query.syncTelemetry,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Goals retrieved successfully',
      };
    },

    getGoalDetails: async (req: Request): Promise<RouteResult<GoalDetailsView>> => {
      const actor = requireActor(req);
      const { params, query } = getValidated(req, getGoalDetailsRequest);
      const result = await useCases.getGoalDetails.execute({
        id: params.id,
        userId: actor.userId,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Goal details retrieved successfully',
      };
    },

    updateGoal: async (req: Request): Promise<RouteResult<GoalView>> => {
      const actor = requireActor(req);
      const { params, query, body } = getValidated(req, updateGoalRequest);
      const result = await useCases.updateGoal.execute({
        id: params.id,
        userId: actor.userId,
        title: body.title,
        description: body.description,
        targetValue: body.targetValue,
        currentValue: body.currentValue,
        deadlineLabel: body.deadlineLabel,
        targetDate: body.targetDate,
        status: body.status,
        isPrimary: body.isPrimary,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Goal updated successfully',
      };
    },

    deleteGoal: async (req: Request): Promise<RouteResult<{ id: string; success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteGoalRequest);
      const result = await useCases.deleteGoal.execute({
        id: params.id,
        userId: actor.userId,
      });
      return {
        data: result,
        message: 'Goal deleted successfully',
      };
    },

    calculateGoalProgress: async (req: Request): Promise<RouteResult<GoalProgressResult>> => {
      const actor = requireActor(req);
      const { params, body } = getValidated(req, calculateGoalProgressRequest);
      const result = await useCases.calculateGoalProgress.execute({
        goalId: params.id,
        userId: actor.userId,
        candidateValue: body?.candidateValue,
      });
      return {
        data: result,
        message: 'Goal progress calculated successfully',
      };
    },

    getGoalCheckpoints: async (req: Request): Promise<RouteResult<GoalCheckpointView[]>> => {
      const actor = requireActor(req);
      const { params, query } = getValidated(req, getGoalCheckpointsRequest);
      const result = await useCases.getGoalCheckpoints.execute({
        goalId: params.id,
        userId: actor.userId,
        limit: query.limit,
      });
      return {
        data: result,
        message: 'Goal checkpoints retrieved successfully',
      };
    },

    logGoalCheckpoint: async (req: Request): Promise<RouteResult<GoalCheckpointView>> => {
      const actor = requireActor(req);
      const { params, query, body } = getValidated(req, logGoalCheckpointRequest);
      const result = await useCases.logGoalCheckpoint.execute({
        goalId: params.id,
        userId: actor.userId,
        value: body.value,
        date: body.date,
        notes: body.notes,
        source: body.source,
        timezone: query.timezone,
      });
      return {
        data: result,
        status: 201,
        message: 'Goal checkpoint logged successfully',
      };
    },

    createHabit: async (req: Request): Promise<RouteResult<HabitView>> => {
      const actor = requireActor(req);
      const { body } = getValidated(req, createHabitRequest);
      const result = await useCases.createHabit.execute({
        userId: actor.userId,
        title: body.title,
        description: body.description,
        category: body.category,
        frequency: body.frequency,
        targetDaysPerWeek: body.targetDaysPerWeek,
        icon: body.icon,
        color: body.color,
      });
      return {
        data: result,
        status: 201,
        message: 'Habit created successfully',
      };
    },

    listHabits: async (req: Request): Promise<RouteResult<HabitView[]>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, listHabitsRequest);
      const result = await useCases.listHabits.execute({
        userId: actor.userId,
        category: query.category,
        isArchived: query.isArchived,
        date: query.date,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Habits retrieved successfully',
      };
    },

    getHabitHistory: async (req: Request): Promise<RouteResult<HabitHistoryView>> => {
      const actor = requireActor(req);
      const { params, query } = getValidated(req, getHabitHistoryRequest);
      const result = await useCases.getHabitHistory.execute({
        habitId: params.id,
        userId: actor.userId,
        limitDays: query.limitDays,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Habit history retrieved successfully',
      };
    },

    updateHabit: async (req: Request): Promise<RouteResult<HabitView>> => {
      const actor = requireActor(req);
      const { params, query, body } = getValidated(req, updateHabitRequest);
      const result = await useCases.updateHabit.execute({
        id: params.id,
        userId: actor.userId,
        title: body.title,
        description: body.description,
        category: body.category,
        frequency: body.frequency,
        targetDaysPerWeek: body.targetDaysPerWeek,
        icon: body.icon,
        color: body.color,
        isArchived: body.isArchived,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Habit updated successfully',
      };
    },

    deleteHabit: async (req: Request): Promise<RouteResult<{ id: string; success: boolean }>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, deleteHabitRequest);
      const result = await useCases.deleteHabit.execute({
        id: params.id,
        userId: actor.userId,
      });
      return {
        data: result,
        message: 'Habit deleted successfully',
      };
    },

    setHabitCompletion: async (req: Request): Promise<RouteResult<SetHabitCompletionResult>> => {
      const actor = requireActor(req);
      const { params, query, body } = getValidated(req, setHabitCompletionRequest);
      const result = await useCases.setHabitCompletion.execute({
        id: body.id,
        habitId: params.id,
        userId: actor.userId,
        date: body.date,
        completed: body.completed,
        notes: body.notes,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Habit completion updated successfully',
      };
    },

    getHabitStreaks: async (req: Request): Promise<RouteResult<StreakResult>> => {
      const actor = requireActor(req);
      const { params, query } = getValidated(req, getHabitStreaksRequest);
      const result = await useCases.calculateHabitStreaks.execute({
        habitId: params.id,
        userId: actor.userId,
        referenceDate: query.referenceDate,
        timezone: query.timezone,
      });
      return {
        data: result,
        message: 'Habit streaks retrieved successfully',
      };
    },
  };
}

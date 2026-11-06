import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { GoalsController } from './goals.controller.js';
import {
  goalViewSchema,
  goalDetailsViewSchema,
  goalCheckpointViewSchema,
  goalProgressResponseSchema,
  habitViewSchema,
  habitHistoryResponseSchema,
  habitCompletionResponseSchema,
  habitStreakSchema,
  deleteResultSchema,
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
import { z } from 'zod';

const goalTags = ['Goals'];
const habitTags = ['Habits'];

export function createGoalsRoutes(basePath: string, controller: GoalsController): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Create Goal
      defineRoute({
        method: 'post',
        path: '/',
        summary: 'Create a fitness or wellness goal',
        description: 'Create a new user-scoped target goal with baseline telemetry synchronization.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: createGoalRequest,
        response: {
          status: 201,
          description: 'Created goal',
          message: 'Goal created successfully',
          schema: goalViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.createGoal,
      }),

      // 2. List User Goals
      defineRoute({
        method: 'get',
        path: '/',
        summary: 'List user goals',
        description: 'Retrieve user goals with live telemetry synchronization and 7-day hit stats.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: listGoalsRequest,
        response: {
          status: 200,
          description: 'List of goals',
          message: 'Goals retrieved successfully',
          schema: z.array(goalViewSchema),
        },
        errorStatuses: [401],
        handler: controller.listGoals,
      }),

      // 3. Get Goal Details
      defineRoute({
        method: 'get',
        path: '/:id',
        summary: 'Get goal details',
        description: 'Retrieve goal details with recent milestone checkpoints and progression history.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: getGoalDetailsRequest,
        response: {
          status: 200,
          description: 'Goal details with checkpoints',
          message: 'Goal details retrieved successfully',
          schema: goalDetailsViewSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.getGoalDetails,
      }),

      // 4. Update Goal
      defineRoute({
        method: 'patch',
        path: '/:id',
        summary: 'Update goal details or progress',
        description: 'Update target, title, deadline, status, or progress (which auto-records a checkpoint).',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: updateGoalRequest,
        response: {
          status: 200,
          description: 'Updated goal',
          message: 'Goal updated successfully',
          schema: goalViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.updateGoal,
      }),

      // 5. Delete Goal (soft delete)
      defineRoute({
        method: 'delete',
        path: '/:id',
        summary: 'Delete a goal',
        description: 'Soft-delete a user-owned goal record.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: deleteGoalRequest,
        response: {
          status: 200,
          description: 'Goal deleted result',
          message: 'Goal deleted successfully',
          schema: deleteResultSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.deleteGoal,
      }),

      // 6. Calculate Goal Progress
      defineRoute({
        method: 'post',
        path: '/:id/progress',
        summary: 'Calculate goal progress',
        description: 'Evaluate deterministic progress for a goal, with optional candidate value simulation.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: calculateGoalProgressRequest,
        response: {
          status: 200,
          description: 'Calculated goal progress',
          message: 'Goal progress calculated successfully',
          schema: goalProgressResponseSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.calculateGoalProgress,
      }),

      // 7. Get Goal Checkpoints
      defineRoute({
        method: 'get',
        path: '/:id/checkpoints',
        summary: 'Get goal checkpoints',
        description: 'Retrieve milestone progression checkpoints for a goal.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: getGoalCheckpointsRequest,
        response: {
          status: 200,
          description: 'List of goal checkpoints',
          message: 'Goal checkpoints retrieved successfully',
          schema: z.array(goalCheckpointViewSchema),
        },
        errorStatuses: [401, 404],
        handler: controller.getGoalCheckpoints,
      }),

      // 8. Log Goal Checkpoint
      defineRoute({
        method: 'post',
        path: '/:id/checkpoints',
        summary: 'Log goal milestone checkpoint',
        description: 'Record an explicit progress checkpoint and update current goal value.',
        tags: goalTags,
        access: { kind: 'authenticated' },
        request: logGoalCheckpointRequest,
        response: {
          status: 201,
          description: 'Logged checkpoint',
          message: 'Goal checkpoint logged successfully',
          schema: goalCheckpointViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.logGoalCheckpoint,
      }),
    ],
  };
}

export function createHabitsRoutes(basePath: string, controller: GoalsController): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Create Habit
      defineRoute({
        method: 'post',
        path: '/',
        summary: 'Create a daily or weekly habit',
        description: 'Create a new tracked habit routine with weekly target frequency.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: createHabitRequest,
        response: {
          status: 201,
          description: 'Created habit',
          message: 'Habit created successfully',
          schema: habitViewSchema,
        },
        errorStatuses: [400, 401],
        handler: controller.createHabit,
      }),

      // 2. List User Habits
      defineRoute({
        method: 'get',
        path: '/',
        summary: 'List user habits',
        description: 'Retrieve user habits with today completion status and weekly progress.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: listHabitsRequest,
        response: {
          status: 200,
          description: 'List of habits',
          message: 'Habits retrieved successfully',
          schema: z.array(habitViewSchema),
        },
        errorStatuses: [401],
        handler: controller.listHabits,
      }),

      // 3. Get Habit History
      defineRoute({
        method: 'get',
        path: '/:id',
        summary: 'Get habit history and streaks',
        description: 'Retrieve habit details with calendar completion history and current streak status.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: getHabitHistoryRequest,
        response: {
          status: 200,
          description: 'Habit details with history',
          message: 'Habit history retrieved successfully',
          schema: habitHistoryResponseSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.getHabitHistory,
      }),

      // 4. Update Habit
      defineRoute({
        method: 'patch',
        path: '/:id',
        summary: 'Update habit details or archive status',
        description: 'Update title, category, frequency, target days, or archive state.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: updateHabitRequest,
        response: {
          status: 200,
          description: 'Updated habit',
          message: 'Habit updated successfully',
          schema: habitViewSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.updateHabit,
      }),

      // 5. Delete Habit
      defineRoute({
        method: 'delete',
        path: '/:id',
        summary: 'Delete a habit',
        description: 'Soft-delete a user-owned habit routine.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: deleteHabitRequest,
        response: {
          status: 200,
          description: 'Habit deleted result',
          message: 'Habit deleted successfully',
          schema: deleteResultSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.deleteHabit,
      }),

      // 6. Set Habit Completion (Explicit Idempotent State)
      defineRoute({
        method: 'post',
        path: '/:id/completion',
        summary: 'Set habit completion state',
        description: 'Idempotently mark or unmark habit completion for a date and recompute streaks.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: setHabitCompletionRequest,
        response: {
          status: 200,
          description: 'Habit completion result with updated streaks',
          message: 'Habit completion updated successfully',
          schema: habitCompletionResponseSchema,
        },
        errorStatuses: [400, 401, 404],
        handler: controller.setHabitCompletion,
      }),

      // 7. Get Habit Streaks
      defineRoute({
        method: 'get',
        path: '/:id/streaks',
        summary: 'Calculate habit streaks',
        description: 'Compute current streak, longest streak, and total completions for a habit.',
        tags: habitTags,
        access: { kind: 'authenticated' },
        request: getHabitStreaksRequest,
        response: {
          status: 200,
          description: 'Habit streaks',
          message: 'Habit streaks retrieved successfully',
          schema: habitStreakSchema,
        },
        errorStatuses: [401, 404],
        handler: controller.getHabitStreaks,
      }),
    ],
  };
}

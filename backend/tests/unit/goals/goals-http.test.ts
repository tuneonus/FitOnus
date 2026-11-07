import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import {
  createGoalsController,
  type GoalsUseCases,
} from '../../../src/modules/goals/interface/goals.controller.js';
import { createGoalsRoutes, createHabitsRoutes } from '../../../src/modules/goals/interface/goals.routes.js';
import type {
  GoalView,
  GoalDetailsView,
  GoalCheckpointView,
  HabitView,
  HabitHistoryView,
} from '../../../src/modules/goals/application/goals-view.js';
import type { GoalProgressResult } from '../../../src/modules/goals/application/use-cases/calculate-goal-progress.js';
import type { SetHabitCompletionResult } from '../../../src/modules/goals/application/use-cases/set-habit-completion.js';
import type { StreakResult } from '../../../src/modules/goals/domain/streak-calculator.js';

describe('Goals & Habits HTTP API', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const goalId = '22222222-2222-4222-8222-222222222222';
  const habitId = '33333333-3333-4333-8333-333333333333';
  const checkpointId = '44444444-4444-4444-8444-444444444444';

  const sampleGoalView: GoalView = {
    id: goalId,
    userId,
    type: 'weightLoss',
    title: 'Lose weight · 75 kg',
    description: 'Target weight goal',
    unit: 'kg',
    start: 85.0,
    current: 82.5,
    target: 75.0,
    progress: 0.25,
    cadence: 'once',
    direction: 'decrease',
    status: 'active',
    isPrimary: true,
    deadline: 'Dec 31, 2026',
    targetDate: '2026-12-31',
    completedOn: null,
    history: [85.0, 82.5],
    createdAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  };

  const sampleCheckpointView: GoalCheckpointView = {
    id: checkpointId,
    goalId,
    value: 82.5,
    date: '2026-11-06',
    recordedAt: '2026-11-06T08:00:00.000Z',
    source: 'manual_checkpoint',
    notes: 'Morning weigh-in',
  };

  const sampleGoalDetails: GoalDetailsView = {
    goal: sampleGoalView,
    checkpoints: [sampleCheckpointView],
    recentHistory: [85.0, 82.5],
  };

  const sampleProgressResult: GoalProgressResult = {
    goalId,
    startValue: 85.0,
    currentValue: 80.0,
    targetValue: 75.0,
    progress: 0.5,
    percentage: 50,
    isCompleted: false,
  };

  const sampleHabitView: HabitView = {
    id: habitId,
    userId,
    title: 'Morning Sunlight',
    description: '15 min outdoor walk',
    category: 'wellness',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    icon: 'sun',
    color: 'amber',
    currentStreak: 5,
    longestStreak: 12,
    totalCompletions: 30,
    isCompletedToday: true,
    isArchived: false,
    weeklyProgress: {
      completedDays: 5,
      targetDays: 7,
      percentage: 71,
    },
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
  };

  const sampleStreaks: StreakResult = {
    currentStreak: 5,
    longestStreak: 12,
    totalCompletions: 30,
  };

  const sampleHabitHistory: HabitHistoryView = {
    habit: sampleHabitView,
    completionDates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
    streaks: sampleStreaks,
  };

  const sampleCompletionResult: SetHabitCompletionResult = {
    habit: sampleHabitView,
    date: '2026-11-06',
    completed: true,
    streaks: sampleStreaks,
  };

  function createTestApp(useCasesOverrides: Partial<GoalsUseCases> = {}, authenticated = true) {
    const useCases: GoalsUseCases = {
      createGoal: { execute: vi.fn().mockResolvedValue(sampleGoalView) } as any,
      listGoals: { execute: vi.fn().mockResolvedValue([sampleGoalView]) } as any,
      getGoalDetails: { execute: vi.fn().mockResolvedValue(sampleGoalDetails) } as any,
      updateGoal: { execute: vi.fn().mockResolvedValue(sampleGoalView) } as any,
      deleteGoal: { execute: vi.fn().mockResolvedValue({ id: goalId, success: true }) } as any,
      calculateGoalProgress: { execute: vi.fn().mockResolvedValue(sampleProgressResult) } as any,
      getGoalCheckpoints: { execute: vi.fn().mockResolvedValue([sampleCheckpointView]) } as any,
      logGoalCheckpoint: { execute: vi.fn().mockResolvedValue(sampleCheckpointView) } as any,
      createHabit: { execute: vi.fn().mockResolvedValue(sampleHabitView) } as any,
      listHabits: { execute: vi.fn().mockResolvedValue([sampleHabitView]) } as any,
      getHabitHistory: { execute: vi.fn().mockResolvedValue(sampleHabitHistory) } as any,
      updateHabit: { execute: vi.fn().mockResolvedValue(sampleHabitView) } as any,
      deleteHabit: { execute: vi.fn().mockResolvedValue({ id: habitId, success: true }) } as any,
      setHabitCompletion: { execute: vi.fn().mockResolvedValue(sampleCompletionResult) } as any,
      calculateHabitStreaks: { execute: vi.fn().mockResolvedValue(sampleStreaks) } as any,
      ...useCasesOverrides,
    };

    const controller = createGoalsController(useCases);
    const goalsGroup = createGoalsRoutes('/api/v1/goals', controller);
    const habitsGroup = createHabitsRoutes('/api/v1/habits', controller);

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (!authenticated) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }
      req.actor = createActor({ userId, sessionId: 's1', role: 'member' });
      next();
    };

    app.use(goalsGroup.basePath, buildRouter(goalsGroup.routes, { authenticate }));
    app.use(habitsGroup.basePath, buildRouter(habitsGroup.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, useCases };
  }

  // 1. Authentication & Access Control
  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated requests to goals and habits endpoints with 401', async () => {
      const { app } = createTestApp({}, false);

      const endpoints = [
        { method: 'get', path: '/api/v1/goals' },
        { method: 'post', path: '/api/v1/goals', body: { type: 'weightLoss', targetValue: 75 } },
        { method: 'get', path: `/api/v1/goals/${goalId}` },
        { method: 'patch', path: `/api/v1/goals/${goalId}`, body: { title: 'New' } },
        { method: 'delete', path: `/api/v1/goals/${goalId}` },
        { method: 'get', path: '/api/v1/habits' },
        { method: 'post', path: '/api/v1/habits', body: { title: 'Meditate' } },
        { method: 'get', path: `/api/v1/habits/${habitId}` },
        { method: 'patch', path: `/api/v1/habits/${habitId}`, body: { title: 'New' } },
        { method: 'delete', path: `/api/v1/habits/${habitId}` },
        {
          method: 'post',
          path: `/api/v1/habits/${habitId}/completion`,
          body: { date: '2026-11-06', completed: true },
        },
      ];

      for (const ep of endpoints) {
        const req = (request(app) as any)[ep.method](ep.path);
        if (ep.body) req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });
  });

  // 2. Goals API Endpoints
  describe('Goals Endpoints', () => {
    it('POST /api/v1/goals creates a goal successfully with 201', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).post('/api/v1/goals').send({
        type: 'weightLoss',
        title: 'Lose weight',
        targetValue: 75.0,
        startValue: 85.0,
        deadlineLabel: 'Dec 31, 2026',
        targetDate: '2026-12-31',
        isPrimary: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(goalId);
      expect(res.body.message).toBe('Goal created successfully');
      expect(useCases.createGoal.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'weightLoss',
          targetValue: 75.0,
        }),
      );
    });

    it('POST /api/v1/goals validates input and rejects negative target value with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).post('/api/v1/goals').send({
        type: 'weightLoss',
        targetValue: -10,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/goals lists user goals with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app)
        .get('/api/v1/goals')
        .query({ status: 'active', isPrimary: 'true', syncTelemetry: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(useCases.listGoals.execute).toHaveBeenCalledWith({
        userId,
        status: 'active',
        isPrimary: true,
        syncTelemetry: true,
      });
    });

    it('GET /api/v1/goals/:id returns goal details with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get(`/api/v1/goals/${goalId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.goal.id).toBe(goalId);
      expect(res.body.data.checkpoints.length).toBe(1);
      expect(useCases.getGoalDetails.execute).toHaveBeenCalledWith({
        id: goalId,
        userId,
      });
    });

    it('GET /api/v1/goals/:id returns 404 when goal does not exist', async () => {
      const { app } = createTestApp({
        getGoalDetails: {
          execute: vi.fn().mockRejectedValue(new AppError('not_found', 'NOT_FOUND', 'Goal not found')),
        } as any,
      });

      const res = await request(app).get(`/api/v1/goals/${goalId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('PATCH /api/v1/goals/:id updates goal details with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).patch(`/api/v1/goals/${goalId}`).send({
        title: 'Updated Goal Title',
        currentValue: 81.0,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(useCases.updateGoal.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: goalId,
          userId,
          title: 'Updated Goal Title',
          currentValue: 81.0,
        }),
      );
    });

    it('DELETE /api/v1/goals/:id soft-deletes goal with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).delete(`/api/v1/goals/${goalId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(goalId);
      expect(useCases.deleteGoal.execute).toHaveBeenCalledWith({
        id: goalId,
        userId,
      });
    });

    it('POST /api/v1/goals/:id/progress calculates progress with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).post(`/api/v1/goals/${goalId}/progress`).send({ candidateValue: 80.0 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.progress).toBe(0.5);
      expect(useCases.calculateGoalProgress.execute).toHaveBeenCalledWith({
        goalId,
        userId,
        candidateValue: 80.0,
      });
    });

    it('GET /api/v1/goals/:id/checkpoints returns checkpoints with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get(`/api/v1/goals/${goalId}/checkpoints`).query({ limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(useCases.getGoalCheckpoints.execute).toHaveBeenCalledWith({
        goalId,
        userId,
        limit: 10,
      });
    });

    it('POST /api/v1/goals/:id/checkpoints logs checkpoint with 201', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).post(`/api/v1/goals/${goalId}/checkpoints`).send({
        value: 82.5,
        date: '2026-11-06',
        notes: 'Morning weigh-in',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.value).toBe(82.5);
      expect(useCases.logGoalCheckpoint.execute).toHaveBeenCalledWith({
        goalId,
        userId,
        value: 82.5,
        date: '2026-11-06',
        notes: 'Morning weigh-in',
        source: undefined,
      });
    });
  });

  // 3. Habits API Endpoints
  describe('Habits Endpoints', () => {
    it('POST /api/v1/habits creates a habit successfully with 201', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).post('/api/v1/habits').send({
        title: 'Morning Sunlight',
        category: 'wellness',
        frequency: 'daily',
        targetDaysPerWeek: 7,
        icon: 'sun',
        color: 'amber',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(habitId);
      expect(res.body.message).toBe('Habit created successfully');
      expect(useCases.createHabit.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: 'Morning Sunlight',
          category: 'wellness',
        }),
      );
    });

    it('POST /api/v1/habits rejects invalid targetDaysPerWeek (> 7) with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).post('/api/v1/habits').send({
        title: 'Stretch',
        targetDaysPerWeek: 14,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/habits lists user habits with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app)
        .get('/api/v1/habits')
        .query({ category: 'wellness', isArchived: 'false', date: '2026-11-06' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(useCases.listHabits.execute).toHaveBeenCalledWith({
        userId,
        category: 'wellness',
        isArchived: false,
        date: '2026-11-06',
      });
    });

    it('GET /api/v1/habits/:id returns habit history and streaks with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get(`/api/v1/habits/${habitId}`).query({ limitDays: 60 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.habit.id).toBe(habitId);
      expect(res.body.data.completionDates.length).toBe(5);
      expect(useCases.getHabitHistory.execute).toHaveBeenCalledWith({
        habitId,
        userId,
        limitDays: 60,
      });
    });

    it('PATCH /api/v1/habits/:id updates habit details with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).patch(`/api/v1/habits/${habitId}`).send({
        title: 'Updated Routine',
        targetDaysPerWeek: 5,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(useCases.updateHabit.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: habitId,
          userId,
          title: 'Updated Routine',
          targetDaysPerWeek: 5,
        }),
      );
    });

    it('DELETE /api/v1/habits/:id soft-deletes habit with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).delete(`/api/v1/habits/${habitId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(habitId);
      expect(useCases.deleteHabit.execute).toHaveBeenCalledWith({
        id: habitId,
        userId,
      });
    });

    it('POST /api/v1/habits/:id/completion explicitly sets completion=true idempotently', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).post(`/api/v1/habits/${habitId}/completion`).send({
        date: '2026-11-06',
        completed: true,
        notes: 'Completed after work',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.completed).toBe(true);
      expect(res.body.data.streaks.currentStreak).toBe(5);
      expect(useCases.setHabitCompletion.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          habitId,
          userId,
          date: '2026-11-06',
          completed: true,
        }),
      );
    });

    it('POST /api/v1/habits/:id/completion explicitly unmarks completion with completed=false', async () => {
      const { app, useCases } = createTestApp({
        setHabitCompletion: {
          execute: vi.fn().mockResolvedValue({
            habit: sampleHabitView,
            date: '2026-11-06',
            completed: false,
            streaks: { currentStreak: 4, longestStreak: 12, totalCompletions: 29 },
          }),
        } as any,
      });

      const res = await request(app).post(`/api/v1/habits/${habitId}/completion`).send({
        date: '2026-11-06',
        completed: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.completed).toBe(false);
      expect(useCases.setHabitCompletion.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          habitId,
          userId,
          date: '2026-11-06',
          completed: false,
        }),
      );
    });

    it('POST /api/v1/habits/:id/completion rejects non-boolean completed state with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).post(`/api/v1/habits/${habitId}/completion`).send({
        date: '2026-11-06',
        completed: 'yes', // invalid type
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/habits/:id/streaks computes streaks with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app)
        .get(`/api/v1/habits/${habitId}/streaks`)
        .query({ referenceDate: '2026-11-06' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentStreak).toBe(5);
      expect(useCases.calculateHabitStreaks.execute).toHaveBeenCalledWith({
        habitId,
        userId,
        referenceDate: '2026-11-06',
      });
    });
  });
});

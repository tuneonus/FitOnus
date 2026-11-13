import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import {
  createGoalsController,
  type GoalsUseCases,
} from '../../../src/modules/goals/interface/goals.controller.js';
import { createGoalsRoutes, createHabitsRoutes } from '../../../src/modules/goals/interface/goals.routes.js';

const userId = '11111111-1111-4111-8111-111111111111';
const goalId = '22222222-2222-4222-8222-222222222222';
const habitId = '33333333-3333-4333-8333-333333333333';

const goalView = {
  id: goalId,
  userId,
  type: 'custom',
  title: 'g',
  description: null,
  unit: 'u',
  start: 0,
  current: 0,
  target: 1,
  progress: 0,
  cadence: 'once',
  direction: 'increase',
  status: 'active',
  isPrimary: false,
  deadline: 'Ongoing',
  targetDate: '2026-11-12',
  completedOn: null,
  isOverdue: true,
  history: [0],
  createdAt: '2026-11-12T20:00:00.000Z',
  updatedAt: '2026-11-12T20:00:00.000Z',
};

function createApp() {
  const execute = () => ({ execute: vi.fn().mockResolvedValue(goalView) }) as any;
  const useCases = {
    createGoal: execute(),
    listGoals: { execute: vi.fn().mockResolvedValue([goalView]) },
    getGoalDetails: {
      execute: vi.fn().mockResolvedValue({ goal: goalView, checkpoints: [], recentHistory: [0] }),
    },
    updateGoal: execute(),
    deleteGoal: execute(),
    calculateGoalProgress: execute(),
    getGoalCheckpoints: execute(),
    logGoalCheckpoint: execute(),
    createHabit: execute(),
    listHabits: { execute: vi.fn().mockResolvedValue([]) },
    getHabitHistory: execute(),
    updateHabit: execute(),
    deleteHabit: execute(),
    setHabitCompletion: execute(),
    calculateHabitStreaks: {
      execute: vi.fn().mockResolvedValue({ currentStreak: 0, longestStreak: 0, totalCompletions: 0 }),
    },
  } as unknown as GoalsUseCases;

  const controller = createGoalsController(useCases);
  const goals = createGoalsRoutes('/api/v1/goals', controller);
  const habits = createHabitsRoutes('/api/v1/habits', controller);
  const app = express();
  app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
  app.use(express.json());
  const authenticate: express.RequestHandler = (req, _res, next) => {
    req.actor = createActor({ userId, sessionId: 's1', role: 'member' });
    next();
  };
  app.use(goals.basePath, buildRouter(goals.routes, { authenticate }));
  app.use(habits.basePath, buildRouter(habits.routes, { authenticate }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, useCases };
}

describe('goals HTTP: timezone and numeric bounds', () => {
  it('forwards the timezone query to the use case (and omits it when absent)', async () => {
    const { app, useCases } = createApp();

    await request(app).get('/api/v1/habits').query({ timezone: 'Asia/Kolkata' }).expect(200);
    expect(useCases.listHabits.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId, timezone: 'Asia/Kolkata' }),
    );

    await request(app).get('/api/v1/goals').expect(200);
    expect((useCases.listGoals.execute as any).mock.calls[0][0].timezone).toBeUndefined();

    await request(app)
      .get(`/api/v1/habits/${habitId}/streaks`)
      .query({ timezone: 'America/New_York' })
      .expect(200);
    expect(useCases.calculateHabitStreaks.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ habitId, timezone: 'America/New_York' }),
    );

    await request(app)
      .post('/api/v1/goals')
      .query({ timezone: 'Asia/Kolkata' })
      .send({ type: 'custom', targetValue: 5 })
      .expect(201);
    expect(useCases.createGoal.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ timezone: 'Asia/Kolkata' }),
    );
  });

  it('passes an unknown timezone through (the use case falls back to UTC) and exposes isOverdue', async () => {
    const { app } = createApp();
    const res = await request(app).get('/api/v1/goals').query({ timezone: 'Not/AZone' }).expect(200);
    expect(res.body.data[0].isOverdue).toBe(true);
  });

  it('turns out-of-range numbers and impossible dates into 400 VALIDATION_FAILED, not a database error', async () => {
    const { app } = createApp();

    const tooBig = await request(app)
      .post('/api/v1/goals')
      .send({ type: 'custom', targetValue: 100_000_000 });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.code).toBe('VALIDATION_FAILED');

    const badDate = await request(app).get('/api/v1/habits').query({ date: '2026-02-30' });
    expect(badDate.status).toBe(400);
    expect(badDate.body.error.code).toBe('VALIDATION_FAILED');

    const longSource = await request(app)
      .post(`/api/v1/goals/${goalId}/checkpoints`)
      .send({ value: 1, source: 's'.repeat(31) });
    expect(longSource.status).toBe(400);
  });
});

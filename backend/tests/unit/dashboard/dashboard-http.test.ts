import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import type { DashboardSummary } from '../../../src/modules/dashboard/domain/dashboard-summary.js';
import { createDashboardController } from '../../../src/modules/dashboard/interface/dashboard.controller.js';
import { createDashboardRoutes } from '../../../src/modules/dashboard/interface/dashboard.routes.js';
import type { GetDashboardSummaryUseCase } from '../../../src/modules/dashboard/application/use-cases/get-dashboard-summary.js';

describe('Dashboard REST API HTTP Integration', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  const sampleSummary: DashboardSummary = {
    userDisplayName: 'Jane Doe',
    summary: {
      recoveryScore: null,
      sleepScore: null,
      sleepDuration: null,
      steps: null,
      caloriesBurned: 350,
      caloriesConsumed: 1800,
      activeMinutes: 40,
      waterIntake: 2.0,
      waterIntakeMl: 2000,
      heartRate: null,
      weight: 68.0,
    },
    aiSummary: {
      greeting: 'Good morning, Jane!',
      sleepInsights: null,
      recoveryInsights: null,
      recommendation: "Today's recommendation:\nUpper Body Power (45 mins).",
    },
    todayWorkout: {
      id: 'w-1',
      name: 'Upper Body Power',
      duration: 45,
      exercises: 6,
      estimatedCalories: 338,
    },
    nutrition: {
      calories: 1800,
      caloriesGoal: 2000,
      protein: 130,
      proteinGoal: 140,
      carbs: 180,
      carbsGoal: 200,
      fat: 50,
      fatGoal: 60,
    },
    progress: {
      dailyGoalProgress: 0.88,
      weeklyGoalProgress: 0.5,
    },
    recentActivity: [
      {
        id: 'ws-1',
        type: 'workout',
        title: 'Upper Body Power',
        subtitle: '40 mins • 350 kcal',
        timestamp: 'Today',
      },
    ],
  };

  function createTestApp(authenticated = true, actingUserId = userId) {
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue(sampleSummary),
    } as unknown as GetDashboardSummaryUseCase;

    const controller = createDashboardController({ getDashboardSummary: mockUseCase });
    const routesGroup = createDashboardRoutes('/api/v1/dashboard', controller);

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (!authenticated) {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }
      req.actor = createActor({ userId: actingUserId, sessionId: 's1', role: 'member' });
      next();
    };

    app.use(routesGroup.basePath, buildRouter(routesGroup.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, mockUseCase };
  }

  it('rejects unauthenticated requests with 401', async () => {
    const { app } = createTestApp(false);
    const res = await request(app).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 200 and expected payload structure when authenticated', async () => {
    const { app, mockUseCase } = createTestApp(true);
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .query({ timezone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userDisplayName).toBe('Jane Doe');
    expect(res.body.data.summary.caloriesBurned).toBe(350);
    expect(res.body.data.nutrition.calories).toBe(1800);
    expect(res.body.data.todayWorkout.name).toBe('Upper Body Power');
    expect(mockUseCase.execute).toHaveBeenCalledWith({
      userId,
      timezone: 'America/New_York',
    });
  });

  it('rejects invalid timezone with 400', async () => {
    const { app } = createTestApp(true);
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .query({ timezone: 'Invalid/Timezone/That/Does/Not/Exist' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

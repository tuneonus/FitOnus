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
  createAnalyticsController,
  type AnalyticsUseCases,
} from '../../../src/modules/analytics/interface/analytics.controller.js';
import { createAnalyticsRoutes } from '../../../src/modules/analytics/interface/analytics.routes.js';
import type {
  ActivityOverviewView,
  WorkoutAnalyticsView,
  ExerciseProgressionView,
  NutritionAnalyticsView,
  HydrationAnalyticsView,
  BodyAnalyticsView,
  GoalsHabitsAnalyticsView,
} from '../../../src/modules/analytics/application/dtos.js';

describe('Analytics REST API HTTP Integration', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const exerciseId = 'e3b0c442-98fc-1c14-9afbf4c8996fb924';

  const sampleOverviewView: ActivityOverviewView = {
    period: 'Oct 3 – Oct 9, 2026',
    workoutSummary: {
      completedSessions: 4,
      targetSessions: 4,
      totalVolumeKg: 24500,
      totalDurationMinutes: 215,
      consistencyPct: 100,
    },
    nutritionSummary: {
      avgCalories: 2180,
      targetCalories: 2200,
      avgProteinGrams: 162,
      targetProteinGrams: 160,
      calorieAdherencePct: 85,
      proteinAdherencePct: 100,
      loggedDays: 6,
    },
    hydrationSummary: {
      avgWaterMl: 2850,
      targetWaterMl: 3000,
      adherencePct: 80,
    },
    bodySummary: {
      currentWeightKg: 78.4,
      startWeightKg: 82.0,
      targetWeightKg: 75.0,
      weeklyVelocityKg: -0.4,
      progressPct: 51.4,
    },
    comparisonVsPriorPeriod: [
      {
        label: 'Workouts',
        current: '4',
        previous: '3',
        delta: 1,
        pctChange: 33,
        better: true,
      },
      {
        label: 'Volume',
        current: '24.5 t',
        previous: '21.0 t',
        delta: 3500,
        pctChange: 17,
        better: true,
      },
      {
        label: 'Calories',
        current: '2,180 kcal',
        previous: '2,240 kcal',
        delta: -60,
        pctChange: -3,
        better: true,
      },
    ],
  };

  const sampleWorkoutView: WorkoutAnalyticsView = {
    range: 'M',
    totalSessions: 16,
    totalVolumeKg: 98400,
    avgDurationMin: 52,
    consistencyPct: 92,
    frequencySeries: [
      { label: 'W-3', value: 4 },
      { label: 'W-2', value: 3 },
      { label: 'W-1', value: 5 },
      { label: 'This wk', value: 4 },
    ],
    volumeSeries: [
      { label: 'W-3', value: 22500 },
      { label: 'W-2', value: 19800 },
      { label: 'W-1', value: 31600 },
      { label: 'This wk', value: 24500 },
    ],
    durationSeries: [
      { label: 'W-3', value: 50 },
      { label: 'W-2', value: 48 },
      { label: 'W-1', value: 55 },
      { label: 'This wk', value: 53 },
    ],
  };

  const sampleProgressionView: ExerciseProgressionView = {
    exerciseId,
    exerciseName: 'Barbell Bench Press',
    currentPr: {
      weightKg: 100,
      reps: 5,
      volumeKg: 2500,
      estimated1rmKg: 116.7,
      achievedAt: '2026-10-05T18:30:00.000Z',
    },
    progression: [
      {
        date: '2026-08-10',
        topWeightKg: 85,
        reps: 6,
        estimated1rmKg: 99.2,
        volumeKg: 2100,
      },
      {
        date: '2026-10-05',
        topWeightKg: 100,
        reps: 5,
        estimated1rmKg: 116.7,
        volumeKg: 2500,
      },
    ],
  };

  const sampleNutritionView: NutritionAnalyticsView = {
    range: 'W',
    avgCalories: 2180,
    targetCalories: 2200,
    calorieAdherencePct: 85,
    proteinAdherencePct: 100,
    macroSplit: [
      { label: 'Protein', pct: 30, grams: 162 },
      { label: 'Carbs', pct: 45, grams: 245 },
      { label: 'Fat', pct: 25, grams: 60 },
    ],
    dailyTrends: [
      {
        date: '2026-10-03',
        label: 'Sat',
        calories: 2150,
        protein: 158,
        carbs: 240,
        fat: 62,
        logged: true,
      },
      {
        date: '2026-10-04',
        label: 'Sun',
        calories: 2220,
        protein: 165,
        carbs: 250,
        fat: 58,
        logged: true,
      },
    ],
  };

  const sampleHydrationView: HydrationAnalyticsView = {
    range: 'W',
    avgWaterMl: 2850,
    targetWaterMl: 3000,
    adherencePct: 80,
    points: [
      { date: '2026-10-03', label: 'Sat', amountMl: 3000, goalMet: true },
      { date: '2026-10-04', label: 'Sun', amountMl: 2500, goalMet: false },
    ],
  };

  const sampleBodyView: BodyAnalyticsView = {
    startingWeightKg: 82.0,
    currentWeightKg: 78.4,
    targetWeightKg: 75.0,
    weeklyVelocityKg: -0.4,
    goalProgressPct: 51.4,
    weightTrend: [
      { date: '2026-09-01', raw: 81.5, ema: 81.6 },
      { date: '2026-10-01', raw: 78.6, ema: 78.8 },
    ],
    measurementTrends: {
      waistCm: [
        { date: '2026-09-01', value: 86.0 },
        { date: '2026-10-01', value: 83.5 },
      ],
      chestCm: [
        { date: '2026-09-01', value: 102.0 },
        { date: '2026-10-01', value: 103.0 },
      ],
    },
  };

  const sampleGoalsHabitsView: GoalsHabitsAnalyticsView = {
    goalStats: {
      totalGoals: 5,
      active: 3,
      completed: 2,
      completionRatePct: 40,
    },
    habitsSummary: [
      {
        habitId: 'h-1',
        title: 'Drink 3L Water',
        category: 'nutrition',
        currentStreak: 14,
        longestStreak: 21,
        completionRatePct: 86.7,
        completionsInWindow: 26,
      },
    ],
    overallHabitAdherencePct: 88.5,
    consistencyHeatmap: [
      { date: '2026-10-01', count: 2 },
      { date: '2026-10-02', count: 3 },
    ],
  };

  function createTestApp(
    useCasesOverrides: Partial<AnalyticsUseCases> = {},
    authenticated = true,
    actingUserId = userA,
  ) {
    const useCases: AnalyticsUseCases = {
      getOverview: { execute: vi.fn().mockResolvedValue(sampleOverviewView) } as any,
      getWorkouts: { execute: vi.fn().mockResolvedValue(sampleWorkoutView) } as any,
      getExerciseProgression: { execute: vi.fn().mockResolvedValue(sampleProgressionView) } as any,
      getNutrition: { execute: vi.fn().mockResolvedValue(sampleNutritionView) } as any,
      getHydration: { execute: vi.fn().mockResolvedValue(sampleHydrationView) } as any,
      getBody: { execute: vi.fn().mockResolvedValue(sampleBodyView) } as any,
      getGoalsHabits: { execute: vi.fn().mockResolvedValue(sampleGoalsHabitsView) } as any,
      ...useCasesOverrides,
    };

    const controller = createAnalyticsController(useCases);
    const routesGroup = createAnalyticsRoutes('/api/v1/analytics', controller);

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

    return { app, useCases };
  }

  describe('1. Authentication Requirement', () => {
    it('returns 401 UNAUTHENTICATED for unauthenticated requests on all 7 endpoints', async () => {
      const { app } = createTestApp({}, false);

      const endpoints = [
        '/api/v1/analytics/overview',
        '/api/v1/analytics/workouts',
        `/api/v1/analytics/workouts/exercises/${exerciseId}`,
        '/api/v1/analytics/nutrition',
        '/api/v1/analytics/hydration',
        '/api/v1/analytics/body',
        '/api/v1/analytics/goals-habits',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });
  });

  describe('2. Valid Authenticated Requests (200 OK)', () => {
    it('GET /api/v1/analytics/overview returns 200 with standard envelope', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/overview');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Activity overview retrieved successfully');
      expect(res.body.data.period).toBe(sampleOverviewView.period);
      expect(res.body.data.workoutSummary.completedSessions).toBe(4);
      expect(useCases.getOverview.execute).toHaveBeenCalledWith({
        userId: userA,
        timezone: 'UTC',
        refDate: undefined,
      });
    });

    it('GET /api/v1/analytics/workouts returns 200 with series trends', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/workouts?range=M');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.range).toBe('M');
      expect(res.body.data.totalSessions).toBe(16);
      expect(res.body.data.frequencySeries).toHaveLength(4);
      expect(useCases.getWorkouts.execute).toHaveBeenCalledWith({
        userId: userA,
        range: 'M',
        timezone: 'UTC',
        refDate: undefined,
      });
    });

    it('GET /api/v1/analytics/workouts/exercises/:exerciseId returns 200 with progression', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get(`/api/v1/analytics/workouts/exercises/${exerciseId}?range=all`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exerciseId).toBe(exerciseId);
      expect(res.body.data.currentPr?.weightKg).toBe(100);
      expect(res.body.data.progression).toHaveLength(2);
      expect(useCases.getExerciseProgression.execute).toHaveBeenCalledWith({
        userId: userA,
        exerciseId,
        range: 'all',
        timezone: 'UTC',
        refDate: undefined,
      });
    });

    it('GET /api/v1/analytics/nutrition returns 200 with macro split & daily trends', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/nutrition?range=W');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avgCalories).toBe(2180);
      expect(res.body.data.macroSplit).toHaveLength(3);
      expect(useCases.getNutrition.execute).toHaveBeenCalledWith({
        userId: userA,
        range: 'W',
        timezone: 'UTC',
        refDate: undefined,
      });
    });

    it('GET /api/v1/analytics/hydration returns 200 with water points', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/hydration?range=W&targetMl=2500');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avgWaterMl).toBe(2850);
      expect(res.body.data.points).toHaveLength(2);
      expect(useCases.getHydration.execute).toHaveBeenCalledWith({
        userId: userA,
        range: 'W',
        timezone: 'UTC',
        refDate: undefined,
        customTargetMl: 2500,
      });
    });

    it('GET /api/v1/analytics/body returns 200 with weight velocity and measurements', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/body?range=M');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weeklyVelocityKg).toBe(-0.4);
      expect(res.body.data.weightTrend).toHaveLength(2);
      expect(useCases.getBody.execute).toHaveBeenCalledWith({
        userId: userA,
        range: 'M',
        timezone: 'UTC',
        refDate: undefined,
      });
    });

    it('GET /api/v1/analytics/goals-habits returns 200 with consistency heatmap', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/goals-habits?windowDays=30');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.goalStats.totalGoals).toBe(5);
      expect(res.body.data.habitsSummary).toHaveLength(1);
      expect(res.body.data.consistencyHeatmap).toHaveLength(2);
      expect(useCases.getGoalsHabits.execute).toHaveBeenCalledWith({
        userId: userA,
        windowDays: 30,
        timezone: 'UTC',
        refDate: undefined,
      });
    });
  });

  describe('3. Request Validation & Error Handling (400 Bad Request)', () => {
    it('returns 400 when an invalid period range is provided', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/workouts?range=invalid-period');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when a malformed reference date is provided', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/overview?refDate=not-a-date');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when an invalid calendar date is provided (e.g. month 13)', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/overview?refDate=2026-13-40');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when an invalid timezone is provided', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/workouts?timezone=Invalid/Zone');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when windowDays is outside acceptable bounds (< 7)', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/goals-habits?windowDays=2');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when exerciseId is whitespace', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/workouts/exercises/%20');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('4. User Isolation & Security', () => {
    it('derives userId exclusively from auth context, ignoring query param spoofing', async () => {
      const { app, useCases } = createTestApp({}, true, userA);

      // Malicious attempt: User A provides ?userId=userB
      await request(app).get(`/api/v1/analytics/overview?userId=${userB}`);

      // Controller MUST receive userA from verified actor, NEVER userB
      expect(useCases.getOverview.execute).toHaveBeenCalledWith(expect.objectContaining({ userId: userA }));
      expect(useCases.getOverview.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: userB }),
      );
    });

    it('ensures User B gets their own isolated context', async () => {
      const { app, useCases } = createTestApp({}, true, userB);

      await request(app).get('/api/v1/analytics/workouts');

      expect(useCases.getWorkouts.execute).toHaveBeenCalledWith(expect.objectContaining({ userId: userB }));
    });
  });

  describe('5. Truthful Empty States & Null Preservation', () => {
    it('serializes empty state cleanly without fabricating data', async () => {
      const emptyOverview: ActivityOverviewView = {
        period: 'Oct 3 – Oct 9, 2026',
        workoutSummary: {
          completedSessions: 0,
          targetSessions: 3,
          totalVolumeKg: 0,
          totalDurationMinutes: 0,
          consistencyPct: 0,
        },
        nutritionSummary: {
          avgCalories: 0,
          targetCalories: null,
          avgProteinGrams: 0,
          targetProteinGrams: null,
          calorieAdherencePct: 0,
          proteinAdherencePct: 0,
          loggedDays: 0,
        },
        hydrationSummary: {
          avgWaterMl: 0,
          targetWaterMl: 3000,
          adherencePct: 0,
        },
        bodySummary: {
          currentWeightKg: null,
          startWeightKg: null,
          targetWeightKg: null,
          weeklyVelocityKg: 0,
          progressPct: 0,
        },
        comparisonVsPriorPeriod: [],
      };

      const { app } = createTestApp({
        getOverview: { execute: vi.fn().mockResolvedValue(emptyOverview) } as any,
      });

      const res = await request(app).get('/api/v1/analytics/overview');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workoutSummary.completedSessions).toBe(0);
      expect(res.body.data.bodySummary.currentWeightKg).toBeNull();
      expect(res.body.data.nutritionSummary.targetCalories).toBeNull();
    });
  });

  describe('6. HTTP Route Registration & Method Restrictions', () => {
    it('rejects POST/PUT/DELETE on read-only analytics endpoints with 405 Method Not Allowed', async () => {
      const { app } = createTestApp();

      const postRes = await request(app).post('/api/v1/analytics/overview');
      expect(postRes.status).toBe(405);
      expect(postRes.headers.allow).toContain('GET');

      const putRes = await request(app).put('/api/v1/analytics/workouts');
      expect(putRes.status).toBe(405);
      expect(putRes.headers.allow).toContain('GET');

      const delRes = await request(app).delete('/api/v1/analytics/body');
      expect(delRes.status).toBe(405);
      expect(delRes.headers.allow).toContain('GET');
    });

    it('returns 404 for unmapped subpaths', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/analytics/non-existent-subpath');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    });
  });
});

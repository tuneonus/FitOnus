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
  createProgressController,
  type ProgressUseCases,
} from '../../../src/modules/progress/interface/progress.controller.js';
import { createProgressRoutes } from '../../../src/modules/progress/interface/progress.routes.js';
import { WeightLog } from '../../../src/modules/progress/domain/weight-log.js';
import { BodyMeasurement } from '../../../src/modules/progress/domain/body-measurement.js';
import type { LogWeightResult } from '../../../src/modules/progress/application/use-cases/log-weight.js';
import type { GetWeightHistoryResult } from '../../../src/modules/progress/application/use-cases/get-weight-history.js';
import type { LogMeasurementResult } from '../../../src/modules/progress/application/use-cases/log-measurement.js';
import type { GetMeasurementsResult } from '../../../src/modules/progress/application/use-cases/get-measurements.js';
import type { ProgressAnalyticsResult } from '../../../src/modules/progress/application/use-cases/get-progress-analytics.js';
import type { PeriodComparisonResult } from '../../../src/modules/progress/application/use-cases/get-period-comparison.js';
import type { ProgressReportResult } from '../../../src/modules/progress/application/use-cases/get-progress-reports.js';

describe('Progress Member HTTP API', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const weightLogId = 'a1111111-1111-4111-8111-111111111111';
  const measurementId = 'b1111111-1111-4111-8111-111111111111';
  const clientId = 'c1111111-1111-4111-8111-111111111111';

  const sampleWeightLog = new WeightLog({
    id: weightLogId,
    userId,
    weightKg: 78.5,
    loggedAt: new Date('2026-11-05T08:00:00Z'),
    source: 'manual',
    notes: 'Morning weigh-in',
    clientId,
    createdAt: new Date('2026-11-05T08:00:00Z'),
    updatedAt: new Date('2026-11-05T08:00:00Z'),
  });

  const sampleLogWeightResult: LogWeightResult = {
    log: sampleWeightLog,
    isNew: true,
    currentWeight: 78.5,
    startingWeight: 82.0,
    changeFromStart: -3.5,
    changeFromPrevious: -0.2,
  };

  const sampleWeightHistoryResult: GetWeightHistoryResult = {
    summary: {
      currentWeightKg: 78.5,
      startingWeightKg: 82.0,
      targetWeightKg: 75.0,
      latestLoggedAt: new Date('2026-11-05T08:00:00Z'),
      totalLogsCount: 15,
    },
    points: [
      { label: 'Oct 29', value: 78.7 },
      { label: 'Nov 05', value: 78.5 },
    ],
    entries: [
      {
        id: weightLogId,
        date: 'Nov 5',
        time: '8:00 AM',
        value: 78.5,
        source: 'manual',
        note: 'Morning weigh-in',
      },
    ],
    total: 15,
  };

  const sampleMeasurement = new BodyMeasurement({
    id: measurementId,
    userId,
    loggedAt: new Date('2026-11-05T08:00:00Z'),
    waistCm: 82.5,
    chestCm: 101.0,
    hipCm: 96.0,
    armCm: 36.5,
    neckCm: 39.0,
    bodyFatPct: 15.5,
    muscleMassKg: 63.2,
    notes: 'Monthly tape measurement',
    source: 'manual',
    clientId,
    createdAt: new Date('2026-11-05T08:00:00Z'),
    updatedAt: new Date('2026-11-05T08:00:00Z'),
  });

  const sampleLogMeasurementResult: LogMeasurementResult = {
    measurement: sampleMeasurement,
    isNew: true,
    diffs: {
      waist: -1.0,
      chest: 0.5,
      bodyFat: -0.5,
    },
  };

  const sampleMeasurementsResult: GetMeasurementsResult = {
    latest: {
      id: measurementId,
      date: 'Nov 5',
      waist: 82.5,
      chest: 101.0,
      hip: 96.0,
      arm: 36.5,
      neck: 39.0,
      bodyFat: 15.5,
      muscleMass: 63.2,
    },
    diffs: {
      waist: -1.0,
      chest: 0.5,
      bodyFat: -0.5,
    },
    history: [
      {
        id: measurementId,
        date: 'Nov 5',
        values: {
          waist: 82.5,
          chest: 101.0,
          hip: 96.0,
          arm: 36.5,
          neck: 39.0,
          bodyFat: 15.5,
          muscleMass: 63.2,
        },
      },
    ],
    total: 1,
  };

  const sampleAnalyticsResult: ProgressAnalyticsResult = {
    metric: 'weight',
    label: 'Weight',
    unit: 'kg',
    chart: 'line',
    lowerIsBetter: true,
    hasDeviceData: true,
    goal: 75.0,
    firstValue: 82.0,
    latestValue: 78.5,
    delta: -3.5,
    points: [
      { label: 'W1', value: 82.0 },
      { label: 'W2', value: 80.5 },
      { label: 'W3', value: 78.5 },
    ],
  };

  const sampleComparisonResult: PeriodComparisonResult = {
    title: 'This Month vs Last Month',
    comparisons: [
      { label: 'Workouts', current: '16', previous: '14', better: true },
      { label: 'Weight change', current: '−1.5 kg', previous: '−1.0 kg', better: true },
      { label: 'Avg calories', current: '2,150 kcal', previous: '2,200 kcal', better: true },
      { label: 'Avg protein', current: '155 g', previous: '148 g', better: true },
    ],
  };

  const sampleReportResult: ProgressReportResult = {
    period: 'Oct 29 – Nov 5',
    generated: '2026-11-05T08:00:00.000Z',
    headline: 'Strong progress on consistency and calorie balance!',
    stats: [
      { label: 'Workouts', value: '4', unit: 'sessions', note: 'Met weekly target', good: true },
      { label: 'Weight', value: '78.5', unit: 'kg', note: '−0.3 kg this week', good: true },
      { label: 'Avg calories', value: '2,120', unit: 'kcal/day', note: 'Target 2,200', good: true },
    ],
    calories: [
      { label: 'Fri', value: 2100 },
      { label: 'Sat', value: 2150 },
    ],
    workouts: [
      { day: 'Friday', title: 'Upper Body Power' },
      { day: 'Monday', title: 'Lower Body Strength' },
    ],
    achievements: ['Bench Press PR: 85 kg × 5', '4-workout streak'],
    improvements: ['Hydration on rest days was below 2,000 ml'],
    nextGoals: ['Aim for 4 training sessions next week', 'Maintain protein intake ≥ 150g'],
  };

  function createTestApp(
    useCasesOverrides: Partial<ProgressUseCases> = {},
    authenticated = true,
  ) {
    const useCases: ProgressUseCases = {
      logWeight: { execute: vi.fn().mockResolvedValue(sampleLogWeightResult) } as any,
      getWeightHistory: { execute: vi.fn().mockResolvedValue(sampleWeightHistoryResult) } as any,
      updateWeight: { execute: vi.fn().mockResolvedValue({ log: sampleWeightLog }) } as any,
      deleteWeight: { execute: vi.fn().mockResolvedValue({ id: weightLogId, deleted: true }) } as any,
      logMeasurement: { execute: vi.fn().mockResolvedValue(sampleLogMeasurementResult) } as any,
      getMeasurements: { execute: vi.fn().mockResolvedValue(sampleMeasurementsResult) } as any,
      updateMeasurement: { execute: vi.fn().mockResolvedValue({ measurement: sampleMeasurement }) } as any,
      deleteMeasurement: { execute: vi.fn().mockResolvedValue({ id: measurementId, deleted: true }) } as any,
      getProgressAnalytics: { execute: vi.fn().mockResolvedValue(sampleAnalyticsResult) } as any,
      getPeriodComparison: { execute: vi.fn().mockResolvedValue(sampleComparisonResult) } as any,
      getAchievements: {
        execute: vi.fn().mockResolvedValue({
          achievements: [
            { title: 'Bench Press PR', detail: '85 kg × 5 · Nov 4', earned: true },
            { title: '16-workout month', detail: 'October', earned: true },
            { title: 'First 5 kg lost', detail: 'Achieved Oct 15', earned: true },
          ],
        }),
      } as any,
      getProgressReports: { execute: vi.fn().mockResolvedValue(sampleReportResult) } as any,
      ...useCasesOverrides,
    };

    const controller = createProgressController(useCases);
    const routesGroup = createProgressRoutes('/api/v1/progress', controller);

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

    app.use(routesGroup.basePath, buildRouter(routesGroup.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return { app, useCases };
  }

  // 1. Authentication & Access Control
  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated requests to progress endpoints with 401', async () => {
      const { app } = createTestApp({}, false);

      const endpoints = [
        { method: 'get', path: '/api/v1/progress/weight' },
        { method: 'post', path: '/api/v1/progress/weight', body: { weightKg: 78.5 } },
        { method: 'put', path: `/api/v1/progress/weight/${weightLogId}`, body: { weightKg: 78.0 } },
        { method: 'patch', path: `/api/v1/progress/weight/${weightLogId}`, body: { weightKg: 78.0 } },
        { method: 'delete', path: `/api/v1/progress/weight/${weightLogId}` },
        { method: 'get', path: '/api/v1/progress/measurements' },
        { method: 'post', path: '/api/v1/progress/measurements', body: { waistCm: 82.5 } },
        { method: 'put', path: `/api/v1/progress/measurements/${measurementId}`, body: { waistCm: 82.0 } },
        { method: 'patch', path: `/api/v1/progress/measurements/${measurementId}`, body: { waistCm: 82.0 } },
        { method: 'delete', path: `/api/v1/progress/measurements/${measurementId}` },
        { method: 'get', path: '/api/v1/progress/analytics?metric=weight' },
        { method: 'get', path: '/api/v1/progress/comparison' },
        { method: 'get', path: '/api/v1/progress/achievements' },
        { method: 'get', path: '/api/v1/progress/reports' },
      ];

      for (const ep of endpoints) {
        let req;
        if (ep.method === 'get') req = request(app).get(ep.path);
        else if (ep.method === 'post') req = request(app).post(ep.path).send(ep.body);
        else if (ep.method === 'put') req = request(app).put(ep.path).send(ep.body);
        else if (ep.method === 'patch') req = request(app).patch(ep.path).send(ep.body);
        else req = request(app).delete(ep.path);

        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });
  });

  // 2. Weight Logging CRUD
  describe('Weight Logging CRUD Endpoints', () => {
    it('creates a weight log successfully with 201 and response envelope', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app)
        .post('/api/v1/progress/weight')
        .send({
          weightKg: 78.5,
          loggedAt: '2026-11-05T08:00:00.000Z',
          source: 'manual',
          notes: 'Morning weigh-in',
          clientId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Weight logged successfully');
      expect(res.body.data.log.id).toBe(weightLogId);
      expect(res.body.data.log.weightKg).toBe(78.5);
      expect(res.body.data.isNew).toBe(true);
      expect(res.body.data.currentWeight).toBe(78.5);
      expect(res.body.data.startingWeight).toBe(82.0);
      expect(res.body.data.changeFromStart).toBe(-3.5);

      expect(useCases.logWeight.execute).toHaveBeenCalledWith({
        userId,
        weightKg: 78.5,
        loggedAt: new Date('2026-11-05T08:00:00.000Z'),
        source: 'manual',
        notes: 'Morning weigh-in',
        clientId,
      });
    });

    it('handles idempotent offline duplicate weight submission returning isNew: false', async () => {
      const duplicateResult: LogWeightResult = {
        ...sampleLogWeightResult,
        isNew: false,
      };
      const { app } = createTestApp({
        logWeight: { execute: vi.fn().mockResolvedValue(duplicateResult) } as any,
      });

      const res = await request(app)
        .post('/api/v1/progress/weight')
        .send({
          weightKg: 78.5,
          clientId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isNew).toBe(false);
      expect(res.body.data.log.id).toBe(weightLogId);
    });

    it('rejects weight < 25 kg or > 450 kg with 400 validation error', async () => {
      const { app } = createTestApp();

      const resTooLow = await request(app)
        .post('/api/v1/progress/weight')
        .send({ weightKg: 15 });
      expect(resTooLow.status).toBe(400);
      expect(resTooLow.body.success).toBe(false);

      const resTooHigh = await request(app)
        .post('/api/v1/progress/weight')
        .send({ weightKg: 500 });
      expect(resTooHigh.status).toBe(400);
      expect(resTooHigh.body.success).toBe(false);
    });

    it('rejects invalid clientId (non-UUID) with 400 validation error', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/progress/weight')
        .send({ weightKg: 75.0, clientId: 'not-a-valid-uuid' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('retrieves weight history and time-series points with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get('/api/v1/progress/weight?range=M&timezone=America/New_York&limit=10&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.currentWeightKg).toBe(78.5);
      expect(res.body.data.summary.startingWeightKg).toBe(82.0);
      expect(res.body.data.points).toHaveLength(2);
      expect(res.body.data.entries).toHaveLength(1);
      expect(res.body.data.total).toBe(15);

      expect(useCases.getWeightHistory.execute).toHaveBeenCalledWith({
        userId,
        range: 'M',
        timezone: 'America/New_York',
        limit: 10,
        offset: 0,
      });
    });

    it('rejects invalid range on weight history with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).get('/api/v1/progress/weight?range=INVALID');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('updates weight log via PUT and PATCH with 200', async () => {
      const { app, useCases } = createTestApp();

      // PUT
      const resPut = await request(app)
        .put(`/api/v1/progress/weight/${weightLogId}`)
        .send({
          weightKg: 78.2,
          notes: 'Updated note',
        });
      expect(resPut.status).toBe(200);
      expect(resPut.body.success).toBe(true);
      expect(resPut.body.message).toBe('Weight log updated successfully');
      expect(useCases.updateWeight.execute).toHaveBeenCalledWith({
        userId,
        id: weightLogId,
        weightKg: 78.2,
        loggedAt: undefined,
        source: undefined,
        notes: 'Updated note',
      });

      // PATCH
      const resPatch = await request(app)
        .patch(`/api/v1/progress/weight/${weightLogId}`)
        .send({
          weightKg: 78.0,
        });
      expect(resPatch.status).toBe(200);
      expect(resPatch.body.success).toBe(true);
    });

    it('returns 404 when updating non-existent or foreign weight log', async () => {
      const { app } = createTestApp({
        updateWeight: {
          execute: vi.fn().mockRejectedValue(new AppError('not_found', 'NOT_FOUND', 'Weight log not found or not owned by user')),
        } as any,
      });

      const res = await request(app)
        .put(`/api/v1/progress/weight/${weightLogId}`)
        .send({ weightKg: 78.0 });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('deletes weight log with 200 confirmation', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).delete(`/api/v1/progress/weight/${weightLogId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Weight log deleted successfully');
      expect(res.body.data.id).toBe(weightLogId);
      expect(res.body.data.deleted).toBe(true);

      expect(useCases.deleteWeight.execute).toHaveBeenCalledWith({
        userId,
        id: weightLogId,
      });
    });

    it('returns 404 when deleting non-existent weight log', async () => {
      const { app } = createTestApp({
        deleteWeight: {
          execute: vi.fn().mockRejectedValue(new AppError('not_found', 'NOT_FOUND', 'Weight log not found')),
        } as any,
      });

      const res = await request(app).delete(`/api/v1/progress/weight/${weightLogId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // 3. Body Measurements CRUD
  describe('Body Measurements CRUD Endpoints', () => {
    it('creates body measurement log successfully with 201 and diffs', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app)
        .post('/api/v1/progress/measurements')
        .send({
          waistCm: 82.5,
          chestCm: 101.0,
          hipCm: 96.0,
          bodyFatPct: 15.5,
          notes: 'Monthly tape measurement',
          clientId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Body measurement logged successfully');
      expect(res.body.data.measurement.id).toBe(measurementId);
      expect(res.body.data.measurement.waistCm).toBe(82.5);
      expect(res.body.data.diffs.waist).toBe(-1.0);

      expect(useCases.logMeasurement.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          waistCm: 82.5,
          chestCm: 101.0,
          hipCm: 96.0,
          bodyFatPct: 15.5,
          notes: 'Monthly tape measurement',
          clientId,
        }),
      );
    });

    it('rejects measurement log when no measurement metrics are provided with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post('/api/v1/progress/measurements')
        .send({
          notes: 'Only notes, no measurements',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const detailMessages = (res.body.error.details as any[]).map((d) => d.message).join(' ');
      expect(detailMessages).toContain('At least one body measurement metric must be provided');
    });

    it('rejects body fat percentage out of bounds (> 75% or < 1%) with 400', async () => {
      const { app } = createTestApp();

      const resTooHigh = await request(app)
        .post('/api/v1/progress/measurements')
        .send({ waistCm: 80, bodyFatPct: 85 });
      expect(resTooHigh.status).toBe(400);

      const resTooLow = await request(app)
        .post('/api/v1/progress/measurements')
        .send({ waistCm: 80, bodyFatPct: 0 });
      expect(resTooLow.status).toBe(400);
    });

    it('retrieves measurements history with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get('/api/v1/progress/measurements?limit=10&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.latest.waist).toBe(82.5);
      expect(res.body.data.diffs.waist).toBe(-1.0);
      expect(res.body.data.history).toHaveLength(1);
      expect(res.body.data.total).toBe(1);

      expect(useCases.getMeasurements.execute).toHaveBeenCalledWith({
        userId,
        limit: 10,
        offset: 0,
      });
    });

    it('updates body measurement via PUT and PATCH with 200', async () => {
      const { app, useCases } = createTestApp();

      const resPut = await request(app)
        .put(`/api/v1/progress/measurements/${measurementId}`)
        .send({
          waistCm: 81.5,
          chestCm: 102.0,
        });

      expect(resPut.status).toBe(200);
      expect(resPut.body.success).toBe(true);
      expect(resPut.body.message).toBe('Body measurement updated successfully');
      expect(useCases.updateMeasurement.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          id: measurementId,
          waistCm: 81.5,
          chestCm: 102.0,
        }),
      );

      const resPatch = await request(app)
        .patch(`/api/v1/progress/measurements/${measurementId}`)
        .send({ waistCm: 81.0 });

      expect(resPatch.status).toBe(200);
      expect(resPatch.body.success).toBe(true);
    });

    it('returns 404 when updating non-existent measurement', async () => {
      const { app } = createTestApp({
        updateMeasurement: {
          execute: vi.fn().mockRejectedValue(new AppError('not_found', 'NOT_FOUND', 'Body measurement not found')),
        } as any,
      });

      const res = await request(app)
        .put(`/api/v1/progress/measurements/${measurementId}`)
        .send({ waistCm: 81.0 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('deletes body measurement with 200 confirmation', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).delete(`/api/v1/progress/measurements/${measurementId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Body measurement deleted successfully');
      expect(res.body.data.id).toBe(measurementId);
      expect(res.body.data.deleted).toBe(true);

      expect(useCases.deleteMeasurement.execute).toHaveBeenCalledWith({
        userId,
        id: measurementId,
      });
    });
  });

  // 4. Analytics, Comparison, Achievements & Reports
  describe('Analytics & Reports Endpoints', () => {
    it('retrieves progress analytics for weight metric with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get('/api/v1/progress/analytics?metric=weight&range=M&timezone=UTC');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metric).toBe('weight');
      expect(res.body.data.label).toBe('Weight');
      expect(res.body.data.unit).toBe('kg');
      expect(res.body.data.chart).toBe('line');
      expect(res.body.data.hasDeviceData).toBe(true);
      expect(res.body.data.points).toHaveLength(3);

      expect(useCases.getProgressAnalytics.execute).toHaveBeenCalledWith({
        userId,
        metric: 'weight',
        range: 'M',
        timezone: 'UTC',
      });
    });

    it('rejects invalid analytics metric with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).get('/api/v1/progress/analytics?metric=unsupported_metric');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('retrieves period comparison with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get('/api/v1/progress/comparison?period=month&timezone=UTC');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('This Month vs Last Month');
      expect(res.body.data.comparisons).toHaveLength(4);
      expect(res.body.data.comparisons[0].label).toBe('Workouts');
      expect(res.body.data.comparisons[0].better).toBe(true);

      expect(useCases.getPeriodComparison.execute).toHaveBeenCalledWith({
        userId,
        period: 'month',
        timezone: 'UTC',
      });
    });

    it('rejects invalid period comparison parameter with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).get('/api/v1/progress/comparison?period=year');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('retrieves earned achievements with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get('/api/v1/progress/achievements');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.achievements).toHaveLength(3);
      expect(res.body.data.achievements[0].title).toBe('Bench Press PR');

      expect(useCases.getAchievements.execute).toHaveBeenCalledWith({ userId });
    });

    it('retrieves progress reports with 200', async () => {
      const { app, useCases } = createTestApp();

      const res = await request(app).get('/api/v1/progress/reports?type=weekly&date=2026-11-05&timezone=UTC');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.period).toBe('Oct 29 – Nov 5');
      expect(res.body.data.headline).toContain('Strong progress');
      expect(res.body.data.stats).toHaveLength(3);
      expect(res.body.data.workouts).toHaveLength(2);
      expect(res.body.data.achievements).toHaveLength(2);

      expect(useCases.getProgressReports.execute).toHaveBeenCalledWith({
        userId,
        type: 'weekly',
        date: '2026-11-05',
        timezone: 'UTC',
      });
    });

    it('rejects invalid report date format with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).get('/api/v1/progress/reports?type=weekly&date=11-05-2026');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid report type with 400', async () => {
      const { app } = createTestApp();

      const res = await request(app).get('/api/v1/progress/reports?type=yearly');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

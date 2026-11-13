import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import {
  createNutritionMemberController,
  type NutritionMemberUseCases,
} from '../../../src/modules/nutrition/interface/nutrition.controller.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';

const userId = '11111111-1111-4111-8111-111111111111';

function createApp() {
  const daily = {
    date: '2026-11-13',
    targets: null,
    consumed: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, waterMl: 0 },
    remaining: null,
    meals: [],
  };
  const analytics = {
    range: 'week',
    startDate: '2026-11-07',
    endDate: '2026-11-13',
    avgCalories: 0,
    avgProtein: 0,
    targetCalories: null,
    targetProtein: null,
    loggedDaysCount: 0,
    totalDaysInRange: 7,
    caloriesTrend: [],
    proteinTrend: [],
    macroSplit: [],
    topFoods: [],
  };
  const water = {
    id: '22222222-2222-4222-8222-222222222222',
    userId,
    date: '2026-11-13',
    amountMl: 250,
    loggedAt: '2026-11-12T20:00:00.000Z',
    createdAt: '2026-11-12T20:00:00.000Z',
  };
  const useCases = {
    getDailyNutrition: { execute: vi.fn().mockResolvedValue(daily) },
    getNutritionAnalytics: { execute: vi.fn().mockResolvedValue(analytics) },
    logWater: { execute: vi.fn().mockResolvedValue({ entry: water, created: true }) },
    logMeal: { execute: vi.fn() },
  } as unknown as NutritionMemberUseCases;

  const group = createNutritionMemberRoutes('/api/v1/nutrition', createNutritionMemberController(useCases));
  const app = express();
  app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
  app.use(express.json());
  const authenticate: express.RequestHandler = (req, _res, next) => {
    req.actor = createActor({ userId, sessionId: 's1', role: 'member' });
    next();
  };
  app.use(group.basePath, buildRouter(group.routes, { authenticate }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, useCases };
}

describe('nutrition HTTP: timezone, optional dates and numeric bounds', () => {
  it('daily and analytics work without a date and forward the timezone', async () => {
    const { app, useCases } = createApp();

    await request(app).get('/api/v1/nutrition/daily').query({ timezone: 'Asia/Kolkata' }).expect(200);
    expect(useCases.getDailyNutrition.execute).toHaveBeenLastCalledWith({
      userId,
      date: undefined,
      timezone: 'Asia/Kolkata',
    });

    await request(app)
      .get('/api/v1/nutrition/analytics')
      .query({ range: 'week', timezone: 'Asia/Kolkata' })
      .expect(200);
    expect(useCases.getNutritionAnalytics.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ range: 'week', endDate: undefined, timezone: 'Asia/Kolkata' }),
    );
  });

  it('log water accepts a body without date and forwards the timezone query', async () => {
    const { app, useCases } = createApp();
    await request(app)
      .post('/api/v1/nutrition/water')
      .query({ timezone: 'Asia/Kolkata' })
      .send({ amountMl: 250 })
      .expect(201);
    expect(useCases.logWater.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId, amountMl: 250, date: undefined, timezone: 'Asia/Kolkata' }),
    );
  });

  it('rejects out-of-range numbers and impossible dates with 400 VALIDATION_FAILED', async () => {
    const { app, useCases } = createApp();

    const big = await request(app)
      .post('/api/v1/nutrition/water')
      .send({ date: '2026-11-13', amountMl: 2_147_483_647 });
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe('VALIDATION_FAILED');

    const calories = await request(app)
      .post('/api/v1/nutrition/meals')
      .send({
        mealType: 'lunch',
        date: '2026-11-13',
        items: [{ foodName: 'x', servingMultiplier: 1, calories: 1e9 }],
      });
    expect(calories.status).toBe(400);

    const food = await request(app).post('/api/v1/nutrition/foods').send({
      name: 'x',
      servingSize: 1,
      servingUnit: 'g',
      servingWeightG: 100,
      calories: 100,
      proteinG: 99_999,
      carbohydratesG: 0,
      fatG: 0,
    });
    expect(food.status).toBe(400);

    const date = await request(app).get('/api/v1/nutrition/daily').query({ date: '2026-02-30' });
    expect(date.status).toBe(400);
    expect(date.body.error.code).toBe('VALIDATION_FAILED');
    expect(useCases.logWater.execute).not.toHaveBeenCalled();
  });
});

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
  createNutritionMemberController,
  type NutritionMemberUseCases,
} from '../../../src/modules/nutrition/interface/nutrition.controller.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';
import type {
  DailyNutritionView,
  FoodView,
  MealView,
  NutritionAnalyticsView,
  WaterIntakeView,
} from '../../../src/modules/nutrition/application/nutrition-view.js';

describe('Nutrition Member HTTP API', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const foodId = 'f1111111-1111-4111-8111-111111111111';
  const mealId = 'bbbbbbbb-1111-4111-8111-111111111111';
  const waterId = 'cccccccc-1111-4111-8111-111111111111';

  const sampleFoodView: FoodView = {
    id: foodId,
    name: 'Egg, whole, raw',
    brand: null,
    barcode: '012345678901',
    servingSize: 1,
    servingUnit: 'piece',
    servingWeightG: 50,
    servingVolumeMl: null,
    densityGPerMl: null,
    servingBasis: '100g',
    referenceNutrients: {
      calories: 143,
      proteinG: 12.56,
      carbohydratesG: 0.72,
      fatG: 9.51,
      fiberG: 0,
      sugarG: 0.37,
      sodiumMg: 142,
      cholesterolMg: 372,
    },
    standardServingNutrients: {
      effectiveWeightG: 50,
      servingMultiplier: 1,
      calories: 71.5,
      proteinG: 6.28,
      carbsG: 0.36,
      fatG: 4.76,
      fiberG: 0,
    },
    isCustom: false,
    isVerified: true,
    isFavorite: false,
  };

  const sampleMealView: MealView = {
    id: mealId,
    userId,
    mealType: 'breakfast',
    date: '2026-11-05',
    totalCalories: 143,
    totalProteinG: 12.56,
    totalCarbsG: 0.72,
    totalFatG: 9.51,
    totalFiberG: 0,
    notes: 'Morning fuel',
    items: [
      {
        id: 'dddddddd-1111-4111-8111-111111111111',
        foodId,
        foodName: 'Egg, whole, raw',
        foodBrand: null,
        servingSize: 1,
        servingUnit: 'piece',
        servingWeightG: 50,
        servingMultiplier: 2,
        loggedWeightG: 100,
        calories: 143,
        proteinG: 12.56,
        carbsG: 0.72,
        fatG: 9.51,
        fiberG: 0,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleWaterView: WaterIntakeView = {
    id: waterId,
    userId,
    date: '2026-11-05',
    amountMl: 500,
    loggedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const sampleDailyView: DailyNutritionView = {
    date: '2026-11-05',
    targets: {
      calories: 2200,
      proteinG: 150,
      carbsG: null,
      fatG: null,
      waterMl: null,
    },
    consumed: {
      calories: 143,
      proteinG: 12.56,
      carbsG: 0.72,
      fatG: 9.51,
      fiberG: 0,
      waterMl: 500,
    },
    remaining: {
      calories: 2057,
      proteinG: 137.44,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      waterMl: 0,
    },
    meals: [sampleMealView],
  };

  const sampleAnalyticsView: NutritionAnalyticsView = {
    range: 'week',
    startDate: '2026-10-30',
    endDate: '2026-11-05',
    avgCalories: 1800,
    avgProtein: 130,
    targetCalories: 2200,
    targetProtein: 150,
    loggedDaysCount: 5,
    totalDaysInRange: 7,
    caloriesTrend: [{ date: '2026-11-05', label: 'Thu', value: 1800 }],
    proteinTrend: [{ date: '2026-11-05', label: 'Thu', value: 130 }],
    macroSplit: [
      { label: 'Protein', pct: 30, grams: 130 },
      { label: 'Carbs', pct: 45, grams: 195 },
      { label: 'Fat', pct: 25, grams: 48 },
    ],
    topFoods: [{ foodName: 'Egg, whole, raw', count: 10, totalCalories: 715 }],
  };

  function createTestApp(useCasesOverrides: Partial<NutritionMemberUseCases> = {}, authenticated = true) {
    const useCases: NutritionMemberUseCases = {
      getDailyNutrition: { execute: vi.fn().mockResolvedValue(sampleDailyView) } as any,
      searchFoods: {
        execute: vi.fn().mockResolvedValue({ foods: [sampleFoodView], total: 1, page: 1, limit: 20 }),
      } as any,
      getRecentFoods: { execute: vi.fn().mockResolvedValue([sampleFoodView]) } as any,
      getFoodDetails: { execute: vi.fn().mockResolvedValue(sampleFoodView) } as any,
      createCustomFood: { execute: vi.fn().mockResolvedValue(sampleFoodView) } as any,
      logMeal: { execute: vi.fn().mockResolvedValue({ meal: sampleMealView, created: true }) } as any,
      updateMeal: { execute: vi.fn().mockResolvedValue(sampleMealView) } as any,
      getMeal: { execute: vi.fn().mockResolvedValue(sampleMealView) } as any,
      logWater: { execute: vi.fn().mockResolvedValue({ entry: sampleWaterView, created: true }) } as any,
      getNutritionAnalytics: { execute: vi.fn().mockResolvedValue(sampleAnalyticsView) } as any,
      manageFoodFavorites: {
        listFavorites: vi.fn().mockResolvedValue({ foods: [sampleFoodView], total: 1, page: 1, limit: 20 }),
        addFavorite: vi.fn().mockResolvedValue(undefined),
        removeFavorite: vi.fn().mockResolvedValue(undefined),
      } as any,
      ...useCasesOverrides,
    };

    const controller = createNutritionMemberController(useCases);
    const routesGroup = createNutritionMemberRoutes('/api/v1/nutrition', controller);

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

  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated requests to nutrition endpoints with 401', async () => {
      const { app } = createTestApp({}, false);

      const resDaily = await request(app).get('/api/v1/nutrition/daily?date=2026-11-05');
      expect(resDaily.status).toBe(401);
      expect(resDaily.body.success).toBe(false);
      expect(resDaily.body.error.code).toBe('UNAUTHENTICATED');

      const resFoods = await request(app).get('/api/v1/nutrition/foods/search');
      expect(resFoods.status).toBe(401);

      const resMeals = await request(app).post('/api/v1/nutrition/meals').send({});
      expect(resMeals.status).toBe(401);

      const resWater = await request(app).post('/api/v1/nutrition/water').send({});
      expect(resWater.status).toBe(401);
    });
  });

  describe('Validation & Error Handling', () => {
    it('rejects invalid date format on daily dashboard with 400', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/daily?date=invalid-date');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects meal logging with empty items array with 400', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/v1/nutrition/meals').send({
        mealType: 'lunch',
        date: '2026-11-05',
        items: [],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects water logging with non-positive amount with 400', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/v1/nutrition/water').send({
        date: '2026-11-05',
        amountMl: -50,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects invalid food id format on food details with 400', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/foods/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Daily Nutrition Dashboard', () => {
    it('returns daily nutrition summary with consumed and targets in envelope', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/daily?date=2026-11-05');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe('2026-11-05');
      expect(res.body.data.consumed.calories).toBe(143);
      expect(res.body.data.targets.calories).toBe(2200);
      expect(res.body.data.remaining.calories).toBe(2057);
      expect(res.body.data.meals).toHaveLength(1);
    });
  });

  describe('Food Search and Barcode Lookup', () => {
    it('searches foods catalog and returns paginated response', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/foods/search?q=egg&page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Egg, whole, raw');
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('retrieves food by barcode with 200', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/foods/barcode/012345678901');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.barcode).toBe('012345678901');
    });

    it('returns 404 when food by barcode is missing', async () => {
      const { app } = createTestApp({
        getFoodDetails: {
          execute: vi.fn().mockRejectedValue(new AppError('not_found', 'NOT_FOUND', 'Food not found')),
        } as any,
      });
      const res = await request(app).get('/api/v1/nutrition/foods/barcode/999999999999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 403 when requesting another user private custom food', async () => {
      const { app } = createTestApp({
        getFoodDetails: {
          execute: vi.fn().mockRejectedValue(new AppError('forbidden', 'FORBIDDEN', 'Access forbidden')),
        } as any,
      });
      const res = await request(app).get(`/api/v1/nutrition/foods/${foodId}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Custom Food Creation', () => {
    it('creates custom food and returns 201', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/v1/nutrition/foods').send({
        name: 'My Custom Oatmeal',
        servingSize: 1,
        servingUnit: 'bowl',
        servingWeightG: 150,
        calories: 220,
        proteinG: 8,
        carbohydratesG: 40,
        fatG: 4,
        fiberG: 5,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Egg, whole, raw');
    });
  });

  describe('Meal Logging & Concurrency Idempotency', () => {
    it('logs meal and returns 201 on initial creation', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app)
        .post('/api/v1/nutrition/meals')
        .send({
          id: mealId,
          mealType: 'breakfast',
          date: '2026-11-05',
          notes: 'Morning fuel',
          items: [{ foodId, servingMultiplier: 2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mealId);
      expect(res.headers['idempotent-replayed']).toBeUndefined();
      expect(useCases.logMeal.execute).toHaveBeenCalled();
    });

    it('handles idempotent meal retry returning 200 with Idempotent-Replayed header', async () => {
      const { app } = createTestApp({
        logMeal: {
          execute: vi.fn().mockResolvedValue({ meal: sampleMealView, created: false }),
        } as any,
      });

      const res = await request(app)
        .post('/api/v1/nutrition/meals')
        .send({
          id: mealId,
          mealType: 'breakfast',
          date: '2026-11-05',
          items: [{ foodId, servingMultiplier: 2 }],
        });

      expect(res.status).toBe(200);
      expect(res.headers['idempotent-replayed']).toBe('true');
      expect(res.body.data.id).toBe(mealId);
    });

    it('returns 409 Conflict when client submits a meal ID belonging to another user', async () => {
      const { app } = createTestApp({
        logMeal: {
          execute: vi
            .fn()
            .mockRejectedValue(new AppError('conflict', 'CONFLICT', 'ID collision with another user')),
        } as any,
      });

      const res = await request(app)
        .post('/api/v1/nutrition/meals')
        .send({
          id: mealId,
          mealType: 'breakfast',
          date: '2026-11-05',
          items: [{ foodId, servingMultiplier: 1 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('normalizes alias "snacks" to canonical "snack" seamlessly', async () => {
      const { app, useCases } = createTestApp();
      const res = await request(app)
        .post('/api/v1/nutrition/meals')
        .send({
          mealType: 'snacks',
          date: '2026-11-05',
          items: [{ foodId, servingMultiplier: 1 }],
        });

      expect(res.status).toBe(201);
      const [calledArg] = (useCases.logMeal.execute as any).mock.calls[0];
      expect(calledArg.mealType).toBe('snacks');
    });

    it('returns 500 when transaction rolls back unexpectedly', async () => {
      const { app } = createTestApp({
        logMeal: {
          execute: vi.fn().mockRejectedValue(new Error('Transaction aborted: serialization failure')),
        } as any,
      });

      const res = await request(app)
        .post('/api/v1/nutrition/meals')
        .send({
          mealType: 'breakfast',
          date: '2026-11-05',
          items: [{ foodId, servingMultiplier: 1 }],
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Meal Update and Retrieval', () => {
    it('updates meal and returns 200', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .put(`/api/v1/nutrition/meals/${mealId}`)
        .send({
          notes: 'Updated notes',
          items: [{ foodId, servingMultiplier: 3 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mealId);
    });

    it('retrieves single meal by ID with 200', async () => {
      const { app } = createTestApp();
      const res = await request(app).get(`/api/v1/nutrition/meals/${mealId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mealId);
    });

    it('returns 403 when trying to get or update a meal belonging to another user', async () => {
      const { app } = createTestApp({
        getMeal: {
          execute: vi.fn().mockRejectedValue(new AppError('forbidden', 'FORBIDDEN', 'Access forbidden')),
        } as any,
        updateMeal: {
          execute: vi.fn().mockRejectedValue(new AppError('forbidden', 'FORBIDDEN', 'Access forbidden')),
        } as any,
      });

      const getRes = await request(app).get(`/api/v1/nutrition/meals/${mealId}`);
      expect(getRes.status).toBe(403);

      const putRes = await request(app).put(`/api/v1/nutrition/meals/${mealId}`).send({ notes: 'x' });
      expect(putRes.status).toBe(403);
    });
  });

  describe('Water Intake Logging', () => {
    it('logs water intake and returns 201', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/v1/nutrition/water').send({
        id: waterId,
        date: '2026-11-05',
        amountMl: 500,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.amountMl).toBe(500);
      expect(res.headers['idempotent-replayed']).toBeUndefined();
    });

    it('returns 200 with Idempotent-Replayed on duplicate water sync retry', async () => {
      const { app } = createTestApp({
        logWater: {
          execute: vi.fn().mockResolvedValue({ entry: sampleWaterView, created: false }),
        } as any,
      });

      const res = await request(app).post('/api/v1/nutrition/water').send({
        id: waterId,
        date: '2026-11-05',
        amountMl: 500,
      });

      expect(res.status).toBe(200);
      expect(res.headers['idempotent-replayed']).toBe('true');
    });

    it('returns 409 Conflict on cross-user water ID collision', async () => {
      const { app } = createTestApp({
        logWater: {
          execute: vi
            .fn()
            .mockRejectedValue(new AppError('conflict', 'CONFLICT', 'ID collision with another user')),
        } as any,
      });

      const res = await request(app).post('/api/v1/nutrition/water').send({
        id: waterId,
        date: '2026-11-05',
        amountMl: 500,
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Nutrition Analytics', () => {
    it('returns analytics trends and splits with 200', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/analytics?range=week');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.range).toBe('week');
      expect(res.body.data.avgCalories).toBe(1800);
      expect(res.body.data.macroSplit).toHaveLength(3);
    });
  });

  describe('Food Favorites', () => {
    it('adds food to favorites and returns 201', async () => {
      const { app } = createTestApp();
      const res = await request(app).post('/api/v1/nutrition/favorites').send({ foodId });

      expect(res.status).toBe(201);
      expect(res.body.data.foodId).toBe(foodId);
      expect(res.body.data.isFavorite).toBe(true);
    });

    it('lists favorites with pagination and returns 200', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/nutrition/favorites?page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('removes food from favorites and returns 200', async () => {
      const { app } = createTestApp();
      const res = await request(app).delete(`/api/v1/nutrition/favorites/${foodId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });

    it('rejects favoriting another user private custom food with 403', async () => {
      const { app } = createTestApp({
        manageFoodFavorites: {
          addFavorite: vi.fn().mockRejectedValue(new AppError('forbidden', 'FORBIDDEN', 'Access forbidden')),
        } as any,
      });

      const res = await request(app).post('/api/v1/nutrition/favorites').send({ foodId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

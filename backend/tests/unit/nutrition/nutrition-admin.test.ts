import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { buildOpenApiDocument } from '../../../src/shared/http/openapi.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { Food } from '../../../src/modules/nutrition/domain/food.js';
import { AdminManageFoodUseCase } from '../../../src/modules/nutrition/application/use-cases/admin-manage-food.js';
import { AdminGetNutritionStatsUseCase } from '../../../src/modules/nutrition/application/use-cases/admin-get-nutrition-stats.js';
import { createNutritionAdminController } from '../../../src/modules/nutrition/interface/admin-nutrition.controller.js';
import { createNutritionAdminRoutes } from '../../../src/modules/nutrition/interface/admin-nutrition.routes.js';
import type {
  IFoodRepository,
  INutritionAuditLogger,
  NutritionCatalogStats,
} from '../../../src/modules/nutrition/application/ports.js';

describe('Admin Nutrition Module & API', () => {
  const adminId = 'a1111111-1111-4111-8111-111111111111';
  const memberId = 'm1111111-1111-4111-8111-111111111111';
  const foodId = 'f1111111-1111-4111-8111-111111111111';

  const sampleFood = new Food({
    id: foodId,
    name: 'Whole Milk 3.25%',
    brand: 'Organic Farm',
    barcode: '012345678901',
    servingSize: 1,
    servingUnit: 'cup',
    servingWeightG: 244,
    servingVolumeMl: 237,
    densityGPerMl: 1.0313,
    servingBasis: '100g',
    calories: 61,
    proteinG: 3.15,
    carbohydratesG: 4.8,
    fatG: 3.25,
    fiberG: 0,
    sugarG: 5.05,
    sodiumMg: 43,
    cholesterolMg: 10,
    dataSource: 'usda_fdc',
    sourceId: '171265',
    isCustom: false,
    isVerified: true,
    verificationStatus: 'verified',
    createdBy: null,
    createdAt: new Date('2026-11-05T10:00:00Z'),
    updatedAt: new Date('2026-11-05T10:00:00Z'),
    deletedAt: null,
  });

  const sampleStats: NutritionCatalogStats = {
    totalVerifiedFoods: 25,
    totalCustomFoods: 5,
    totalMealsLogged: 120,
    totalMealItemsLogged: 340,
    totalWaterLogs: 80,
    verifiedFoodsBySource: {
      usda_fdc: 25,
    },
  };

  let mockFoodRepo: IFoodRepository;
  let mockAuditLogger: INutritionAuditLogger;
  let manageFoodUseCase: AdminManageFoodUseCase;
  let getStatsUseCase: AdminGetNutritionStatsUseCase;

  beforeEach(() => {
    mockFoodRepo = {
      findById: vi.fn().mockResolvedValue(sampleFood),
      findByBarcode: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue({ foods: [sampleFood], total: 1 }),
      listRecent: vi.fn().mockResolvedValue([]),
      listFavorites: vi.fn().mockResolvedValue({ foods: [], total: 0 }),
      create: vi.fn().mockImplementation(async (f: Food) => f),
      update: vi.fn().mockImplementation(async (id: string, patch: any) => {
        return new Food({
          ...sampleFood,
          ...patch,
          id,
        });
      }),
      softDelete: vi.fn().mockResolvedValue(true),
      countVerified: vi.fn().mockResolvedValue(25),
      countCustom: vi.fn().mockResolvedValue(5),
      getCatalogStats: vi.fn().mockResolvedValue(sampleStats),
    };

    mockAuditLogger = {
      logAction: vi.fn().mockResolvedValue(undefined),
    };

    manageFoodUseCase = new AdminManageFoodUseCase(mockFoodRepo, mockAuditLogger);
    getStatsUseCase = new AdminGetNutritionStatsUseCase(mockFoodRepo);
  });

  function createTestApp(role: 'admin' | 'member' | 'unauthenticated' = 'admin') {
    const controller = createNutritionAdminController({
      manageFood: manageFoodUseCase,
      getStats: getStatsUseCase,
    });
    const routesGroup = createNutritionAdminRoutes('/api/v1/admin/nutrition', controller);

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    const authenticate: express.RequestHandler = (req, _res, next) => {
      if (role === 'unauthenticated') {
        throw new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.');
      }
      req.actor = createActor({
        userId: role === 'admin' ? adminId : memberId,
        sessionId: 'test-session',
        role,
      });
      next();
    };

    app.use(routesGroup.basePath, buildRouter(routesGroup.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }

  describe('Authorization & RBAC Enforcement', () => {
    it('returns 401 UNAUTHENTICATED for unauthenticated requests', async () => {
      const app = createTestApp('unauthenticated');
      const res = await request(app).get('/api/v1/admin/nutrition/stats');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 FORBIDDEN for regular member requests', async () => {
      const app = createTestApp('member');
      const res = await request(app).get('/api/v1/admin/nutrition/stats');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows admin access with valid admin role', async () => {
      const app = createTestApp('admin');
      const res = await request(app).get('/api/v1/admin/nutrition/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.totalVerifiedFoods).toBe(25);
    });
  });

  describe('GET /api/v1/admin/nutrition/stats', () => {
    it('returns platform nutrition metrics successfully', async () => {
      const app = createTestApp('admin');
      const res = await request(app).get('/api/v1/admin/nutrition/stats');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        totalVerifiedFoods: 25,
        totalCustomFoods: 5,
        totalMealsLogged: 120,
        totalMealItemsLogged: 340,
        totalWaterLogs: 80,
        verifiedFoodsBySource: {
          usda_fdc: 25,
        },
      });
      expect(mockFoodRepo.getCatalogStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/v1/admin/nutrition/foods', () => {
    it('lists foods with pagination and filters', async () => {
      const app = createTestApp('admin');
      const res = await request(app).get('/api/v1/admin/nutrition/foods').query({
        q: 'milk',
        page: 1,
        limit: 10,
        dataSource: 'usda_fdc',
        verificationStatus: 'verified',
        isCustom: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(foodId);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      expect(mockFoodRepo.search).toHaveBeenCalledWith({
        query: 'milk',
        userId: null,
        offset: 0,
        limit: 10,
        dataSource: 'usda_fdc',
        verificationStatus: 'verified',
        isCustom: false,
        includeDeleted: false,
      });
    });

    it('handles includeDeleted query parameter correctly', async () => {
      const app = createTestApp('admin');
      const res = await request(app).get('/api/v1/admin/nutrition/foods').query({ includeDeleted: 'true' });

      expect(res.status).toBe(200);
      expect(mockFoodRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDeleted: true,
        }),
      );
    });
  });

  describe('GET /api/v1/admin/nutrition/foods/:id', () => {
    it('returns full food details by ID', async () => {
      const app = createTestApp('admin');
      const res = await request(app).get(`/api/v1/admin/nutrition/foods/${foodId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(foodId);
      expect(res.body.data.name).toBe('Whole Milk 3.25%');
      expect(res.body.data.densityGPerMl).toBe(1.0313);
      expect(res.body.data.dataSource).toBe('usda_fdc');
      expect(res.body.data.verificationStatus).toBe('verified');
    });

    it('returns 404 when food does not exist', async () => {
      vi.mocked(mockFoodRepo.findById).mockResolvedValueOnce(null);
      const app = createTestApp('admin');
      const unknownId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app).get(`/api/v1/admin/nutrition/foods/${unknownId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 when ID is not a valid UUID', async () => {
      const app = createTestApp('admin');
      const res = await request(app).get('/api/v1/admin/nutrition/foods/invalid-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/v1/admin/nutrition/foods (Create Verified Food)', () => {
    const validCreatePayload = {
      name: 'Olive Oil, extra virgin',
      brand: 'Kirkland',
      barcode: '098765432109',
      servingSize: 1,
      servingUnit: 'tbsp',
      servingWeightG: 13.5,
      servingVolumeMl: 14.7,
      densityGPerMl: 0.9184,
      servingBasis: '100g',
      calories: 884,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 100,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 2,
      cholesterolMg: 0,
      dataSource: 'usda_fdc',
      sourceId: '171413',
    };

    it('successfully creates a verified food and writes an audit log', async () => {
      const app = createTestApp('admin');
      const res = await request(app).post('/api/v1/admin/nutrition/foods').send(validCreatePayload);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(validCreatePayload.name);
      expect(res.body.data.isVerified).toBe(true);
      expect(res.body.data.isCustom).toBe(false);
      expect(res.body.data.verificationStatus).toBe('verified');

      expect(mockFoodRepo.create).toHaveBeenCalledTimes(1);
      expect(mockAuditLogger.logAction).toHaveBeenCalledWith(
        adminId,
        'nutrition.food.create',
        expect.objectContaining({
          name: validCreatePayload.name,
          dataSource: 'usda_fdc',
        }),
        null,
        expect.any(String),
        undefined,
      );
    });

    it('rejects inconsistent serving weight vs volume and density (>15% error)', async () => {
      const app = createTestApp('admin');
      const inconsistentPayload = {
        ...validCreatePayload,
        servingWeightG: 100, // 14.7ml * 0.9184 = 13.5g != 100g
      };

      const res = await request(app).post('/api/v1/admin/nutrition/foods').send(inconsistentPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('inconsistent with liquid volume');
    });

    it('rejects physically impossible macros exceeding 100g on a 100g basis', async () => {
      const app = createTestApp('admin');
      const impossibleMacrosPayload = {
        ...validCreatePayload,
        proteinG: 50,
        carbohydratesG: 50,
        fatG: 50, // total = 150g > 105g
      };

      const res = await request(app).post('/api/v1/admin/nutrition/foods').send(impossibleMacrosPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('cannot exceed 100g');
    });

    it('rejects duplicate verified barcode with 409 CONFLICT', async () => {
      vi.mocked(mockFoodRepo.findByBarcode).mockResolvedValueOnce(sampleFood);
      const app = createTestApp('admin');

      const res = await request(app)
        .post('/api/v1/admin/nutrition/foods')
        .send({
          ...validCreatePayload,
          barcode: '012345678901',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('PUT /api/v1/admin/nutrition/foods/:id (Update Verified Food)', () => {
    it('updates food attributes successfully and writes an audit log', async () => {
      const app = createTestApp('admin');
      const res = await request(app).put(`/api/v1/admin/nutrition/foods/${foodId}`).send({
        name: 'Whole Milk 3.25% (Updated)',
        calories: 62,
      });

      expect(res.status).toBe(200);
      expect(mockFoodRepo.update).toHaveBeenCalledWith(
        foodId,
        expect.objectContaining({
          name: 'Whole Milk 3.25% (Updated)',
          calories: 62,
        }),
        null,
      );
      expect(mockAuditLogger.logAction).toHaveBeenCalledWith(
        adminId,
        'nutrition.food.update',
        expect.objectContaining({ foodId }),
        null,
        expect.any(String),
        undefined,
      );
    });

    it('returns 404 when updating non-existent food', async () => {
      vi.mocked(mockFoodRepo.findById).mockResolvedValueOnce(null);
      const app = createTestApp('admin');
      const unknownId = '00000000-0000-4000-8000-000000000000';

      const res = await request(app)
        .put(`/api/v1/admin/nutrition/foods/${unknownId}`)
        .send({ name: 'Does Not Exist' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/admin/nutrition/foods/:id (Soft-Delete System Food)', () => {
    it('soft deletes food and logs action with 204 response', async () => {
      const app = createTestApp('admin');
      const res = await request(app).delete(`/api/v1/admin/nutrition/foods/${foodId}`);

      expect(res.status).toBe(204);
      expect(mockFoodRepo.softDelete).toHaveBeenCalledWith(foodId);
      expect(mockAuditLogger.logAction).toHaveBeenCalledWith(
        adminId,
        'nutrition.food.delete',
        expect.objectContaining({ foodId, name: sampleFood.name }),
        null,
        expect.any(String),
        undefined,
      );
    });

    it('returns 404 when soft deleting a food that does not exist', async () => {
      vi.mocked(mockFoodRepo.findById).mockResolvedValueOnce(null);
      const app = createTestApp('admin');
      const unknownId = '00000000-0000-4000-8000-000000000000';

      const res = await request(app).delete(`/api/v1/admin/nutrition/foods/${unknownId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/admin/nutrition/foods/:id/verify', () => {
    it('promotes unverified food to verified status and resets ownership constraints', async () => {
      const customFood = new Food({
        ...sampleFood,
        isCustom: true,
        isVerified: false,
        verificationStatus: 'unverified',
        createdBy: memberId,
        dataSource: 'user_custom',
      });
      vi.mocked(mockFoodRepo.findById).mockResolvedValueOnce(customFood);

      const app = createTestApp('admin');
      const res = await request(app).post(`/api/v1/admin/nutrition/foods/${foodId}/verify`).send({
        verificationStatus: 'verified',
        dataSource: 'manufacturer_label',
        sourceId: 'BAR-12345',
      });

      expect(res.status).toBe(200);
      expect(mockFoodRepo.update).toHaveBeenCalledWith(
        foodId,
        expect.objectContaining({
          verificationStatus: 'verified',
          isVerified: true,
          isCustom: false,
          createdBy: null,
          dataSource: 'manufacturer_label',
          sourceId: 'BAR-12345',
        }),
        null,
      );
      expect(mockAuditLogger.logAction).toHaveBeenCalledWith(
        adminId,
        'nutrition.food.verify',
        expect.objectContaining({
          foodId,
          verificationStatus: 'verified',
        }),
        null,
        expect.any(String),
        undefined,
      );
    });

    it('rejects promoting custom food without an authoritative data source', async () => {
      const customFood = new Food({
        ...sampleFood,
        isCustom: true,
        isVerified: false,
        verificationStatus: 'unverified',
        createdBy: memberId,
        dataSource: 'user_custom',
      });
      vi.mocked(mockFoodRepo.findById).mockResolvedValueOnce(customFood);

      const app = createTestApp('admin');
      const res = await request(app).post(`/api/v1/admin/nutrition/foods/${foodId}/verify`).send({
        verificationStatus: 'verified',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('Must specify an authoritative data source');
    });

    it('sets status to rejected and keeps isVerified as false', async () => {
      const app = createTestApp('admin');
      const res = await request(app).post(`/api/v1/admin/nutrition/foods/${foodId}/verify`).send({
        verificationStatus: 'rejected',
      });

      expect(res.status).toBe(200);
      expect(mockFoodRepo.update).toHaveBeenCalledWith(
        foodId,
        expect.objectContaining({
          verificationStatus: 'rejected',
          isVerified: false,
        }),
        null,
      );
    });
  });

  describe('OpenAPI Route Documentation', () => {
    it('generates compliant OpenAPI 3.1.0 specification for all admin nutrition routes', () => {
      const controller = createNutritionAdminController({
        manageFood: manageFoodUseCase,
        getStats: getStatsUseCase,
      });
      const routesGroup = createNutritionAdminRoutes('/api/v1/admin/nutrition', controller);

      const openApiDoc = buildOpenApiDocument([routesGroup], {
        title: 'FitOnus Nutrition Admin API',
        version: '1.2.0',
      }) as {
        openapi: string;
        paths: Record<string, Record<string, any>>;
      };

      expect(openApiDoc.openapi).toBe('3.1.0');
      expect(openApiDoc.paths).toHaveProperty('/api/v1/admin/nutrition/stats');
      expect(openApiDoc.paths).toHaveProperty('/api/v1/admin/nutrition/foods');
      expect(openApiDoc.paths).toHaveProperty('/api/v1/admin/nutrition/foods/{id}');
      expect(openApiDoc.paths).toHaveProperty('/api/v1/admin/nutrition/foods/{id}/verify');

      // Check stats route
      expect(openApiDoc.paths['/api/v1/admin/nutrition/stats']).toHaveProperty('get');
      expect(openApiDoc.paths['/api/v1/admin/nutrition/stats']!.get.summary).toBe(
        'Admin Nutrition Statistics',
      );
      expect(openApiDoc.paths['/api/v1/admin/nutrition/stats']!.get.tags).toContain('Admin Nutrition');

      // Check food create route
      expect(openApiDoc.paths['/api/v1/admin/nutrition/foods']).toHaveProperty('post');
      expect(openApiDoc.paths['/api/v1/admin/nutrition/foods']!.post.summary).toBe(
        'Admin Create Verified Food',
      );

      // Check food update and delete routes
      expect(openApiDoc.paths['/api/v1/admin/nutrition/foods/{id}']).toHaveProperty('put');
      expect(openApiDoc.paths['/api/v1/admin/nutrition/foods/{id}']).toHaveProperty('delete');

      // Check verify route
      expect(openApiDoc.paths['/api/v1/admin/nutrition/foods/{id}/verify']).toHaveProperty('post');
      expect(openApiDoc.paths['/api/v1/admin/nutrition/foods/{id}/verify']!.post.summary).toBe(
        'Admin Verify Food',
      );
    });
  });
});

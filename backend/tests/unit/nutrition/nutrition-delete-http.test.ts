import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import {
  createNutritionMemberController,
  type NutritionMemberUseCases,
} from '../../../src/modules/nutrition/interface/nutrition.controller.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';

const userId = '11111111-1111-4111-8111-111111111111';
const mealId = '22222222-2222-4222-8222-222222222222';
const waterId = '33333333-3333-4333-8333-333333333333';

const mealView = {
  id: mealId,
  userId,
  mealType: 'lunch',
  date: '2026-11-05',
  totalCalories: 100,
  totalProteinG: 10,
  totalCarbsG: 5,
  totalFatG: 2,
  totalFiberG: 1,
  notes: null,
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      foodId: null,
      foodName: 'Dal',
      foodBrand: 'AI Estimate',
      servingSize: 1,
      servingUnit: 'bowl',
      servingWeightG: 200,
      servingMultiplier: 1,
      loggedWeightG: 200,
      calories: 100,
      proteinG: 10,
      carbsG: 5,
      fatG: 2,
      fiberG: 1,
      isEstimated: true,
    },
  ],
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
};

function createApp(
  overrides: Partial<Record<'deleteMeal' | 'restoreMeal' | 'deleteWater', unknown>> = {},
  authenticated = true,
) {
  const useCases = {
    deleteMeal: { execute: vi.fn().mockResolvedValue({ id: mealId, alreadyDeleted: false }) },
    restoreMeal: { execute: vi.fn().mockResolvedValue({ meal: mealView, restored: true }) },
    deleteWater: { execute: vi.fn().mockResolvedValue({ id: waterId }) },
    ...overrides,
  } as unknown as NutritionMemberUseCases;

  const group = createNutritionMemberRoutes('/api/v1/nutrition', createNutritionMemberController(useCases));
  const app = express();
  app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
  app.use(express.json());
  const authenticate: express.RequestHandler = (req, _res, next) => {
    if (!authenticated) {
      next(new AppError('unauthorized', 'UNAUTHENTICATED', 'Authentication is required.'));
      return;
    }
    req.actor = createActor({ userId, sessionId: 's1', role: 'member' });
    next();
  };
  app.use(group.basePath, buildRouter(group.routes, { authenticate }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, useCases };
}

describe('nutrition HTTP: delete and restore', () => {
  it('DELETE /meals/:id returns the id and passes the authenticated user to the use case', async () => {
    const { app, useCases } = createApp();

    const res = await request(app).delete(`/api/v1/nutrition/meals/${mealId}`).expect(200);

    expect(res.body.data).toEqual({ id: mealId, deleted: true });
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect((useCases as any).deleteMeal.execute).toHaveBeenCalledWith({ userId, id: mealId });
  });

  it('DELETE /meals/:id on an already-deleted meal still succeeds and flags the replay', async () => {
    const { app } = createApp({
      deleteMeal: { execute: vi.fn().mockResolvedValue({ id: mealId, alreadyDeleted: true }) },
    });

    const res = await request(app).delete(`/api/v1/nutrition/meals/${mealId}`).expect(200);

    expect(res.body.data).toEqual({ id: mealId, deleted: true });
    expect(res.headers['idempotent-replayed']).toBe('true');
  });

  it('POST /meals/:id/restore returns the full meal, including the estimate flag', async () => {
    const { app, useCases } = createApp();

    const res = await request(app).post(`/api/v1/nutrition/meals/${mealId}/restore`).expect(200);

    expect(res.body.data.id).toBe(mealId);
    expect(res.body.data.items[0].isEstimated).toBe(true);
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect((useCases as any).restoreMeal.execute).toHaveBeenCalledWith({ userId, id: mealId });
  });

  it('POST /meals/:id/restore on a live meal is a flagged no-op', async () => {
    const { app } = createApp({
      restoreMeal: { execute: vi.fn().mockResolvedValue({ meal: mealView, restored: false }) },
    });

    const res = await request(app).post(`/api/v1/nutrition/meals/${mealId}/restore`).expect(200);

    expect(res.headers['idempotent-replayed']).toBe('true');
  });

  it('DELETE /water/:id deletes one entry', async () => {
    const { app, useCases } = createApp();

    const res = await request(app).delete(`/api/v1/nutrition/water/${waterId}`).expect(200);

    expect(res.body.data).toEqual({ id: waterId, deleted: true });
    expect((useCases as any).deleteWater.execute).toHaveBeenCalledWith({ userId, id: waterId });
  });

  it('maps ownership and existence errors to 403 and 404', async () => {
    const forbidden = new AppError(
      'forbidden',
      'FORBIDDEN',
      'Cannot delete a meal belonging to another user',
    );
    const missing = new AppError('not_found', 'NOT_FOUND', 'Meal not found');

    await request(createApp({ deleteMeal: { execute: vi.fn().mockRejectedValue(forbidden) } }).app)
      .delete(`/api/v1/nutrition/meals/${mealId}`)
      .expect(403);
    await request(createApp({ restoreMeal: { execute: vi.fn().mockRejectedValue(missing) } }).app)
      .post(`/api/v1/nutrition/meals/${mealId}/restore`)
      .expect(404);
    await request(createApp({ deleteWater: { execute: vi.fn().mockRejectedValue(missing) } }).app)
      .delete(`/api/v1/nutrition/water/${waterId}`)
      .expect(404);
  });

  it('rejects a malformed id before reaching the use case', async () => {
    const { app, useCases } = createApp();

    await request(app).delete('/api/v1/nutrition/meals/not-a-uuid').expect(400);
    await request(app).post('/api/v1/nutrition/meals/not-a-uuid/restore').expect(400);
    await request(app).delete('/api/v1/nutrition/water/not-a-uuid').expect(400);

    expect((useCases as any).deleteMeal.execute).not.toHaveBeenCalled();
    expect((useCases as any).restoreMeal.execute).not.toHaveBeenCalled();
    expect((useCases as any).deleteWater.execute).not.toHaveBeenCalled();
  });

  it('requires authentication on all three routes', async () => {
    const { app, useCases } = createApp({}, false);

    await request(app).delete(`/api/v1/nutrition/meals/${mealId}`).expect(401);
    await request(app).post(`/api/v1/nutrition/meals/${mealId}/restore`).expect(401);
    await request(app).delete(`/api/v1/nutrition/water/${waterId}`).expect(401);

    expect((useCases as any).deleteMeal.execute).not.toHaveBeenCalled();
  });
});

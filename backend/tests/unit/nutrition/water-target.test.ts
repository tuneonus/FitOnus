import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/error-handler.js';
import { requestContext } from '../../../src/middleware/request-context.js';
import { createActor } from '../../../src/shared/auth/actor.js';
import { buildRouter } from '../../../src/shared/http/route.js';
import { createLogger } from '../../../src/shared/logging/logger.js';
import { resolveDailyTargets } from '../../../src/modules/profile/index.js';
import type {
  INutritionSettingsRepository,
  IUserProfileTargetPort,
} from '../../../src/modules/nutrition/application/ports.js';
import { SetWaterTargetUseCase } from '../../../src/modules/nutrition/application/use-cases/set-water-target.js';
import { toNutritionTargets } from '../../../src/modules/nutrition/infrastructure/pg-user-profile-target-adapter.js';
import { createNutritionMemberController } from '../../../src/modules/nutrition/interface/nutrition.controller.js';
import { createNutritionMemberRoutes } from '../../../src/modules/nutrition/interface/nutrition.routes.js';

const userId = '11111111-1111-4111-8111-111111111111';
const noProfile = {
  savedCalorieTarget: null,
  savedProteinGrams: null,
  savedWaterTargetMl: null,
  weightKg: null,
  heightCm: null,
  age: null,
  sex: null,
  primaryGoal: null,
  workoutDaysPerWeek: null,
};

describe('toNutritionTargets (what the diary receives)', () => {
  it('passes saved calories, all macros and the water target through with where each came from', () => {
    const view = toNutritionTargets(
      resolveDailyTargets({
        ...noProfile,
        savedCalorieTarget: 2100,
        savedProteinGrams: 160,
        savedWaterTargetMl: 3000,
      }),
    );

    expect(view).toEqual({
      source: 'saved',
      calories: 2100,
      proteinG: 160,
      carbsG: 235,
      fatG: 58,
      waterMl: 3000,
      waterSource: 'saved',
    });
  });

  it('shows no food targets for a member nothing is known about, rather than generic placeholders', () => {
    const view = toNutritionTargets(resolveDailyTargets({ ...noProfile, weightKg: 80 }));

    expect(view).toEqual({
      source: null,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      waterMl: 2800,
      waterSource: 'estimated',
    });
  });
});

describe('SetWaterTargetUseCase', () => {
  function build(effective: { waterMl: number | null; waterSource: 'saved' | 'estimated' | null }) {
    const settingsRepo: INutritionSettingsRepository = {
      saveWaterTarget: vi.fn().mockResolvedValue(undefined),
    };
    const targetPort: IUserProfileTargetPort = {
      findTargetsByUserId: vi.fn().mockResolvedValue({
        source: null,
        calories: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        ...effective,
      }),
    };
    return { settingsRepo, targetPort, useCase: new SetWaterTargetUseCase(settingsRepo, targetPort) };
  }

  it('saves the target and replies with the one now in effect', async () => {
    const { settingsRepo, useCase } = build({ waterMl: 3000, waterSource: 'saved' });

    const result = await useCase.execute({ userId, targetMl: 3000 });

    expect(settingsRepo.saveWaterTarget).toHaveBeenCalledWith(userId, 3000);
    expect(result).toEqual({ targetMl: 3000, source: 'saved' });
  });

  it('clearing falls back to the estimate and says so', async () => {
    const { settingsRepo, useCase } = build({ waterMl: 2800, waterSource: 'estimated' });

    const result = await useCase.execute({ userId, targetMl: null });

    expect(settingsRepo.saveWaterTarget).toHaveBeenCalledWith(userId, null);
    expect(result).toEqual({ targetMl: 2800, source: 'estimated' });
  });

  it.each([499, 8001, 2500.5, Number.NaN])('refuses %s before touching the database', async (bad) => {
    const { settingsRepo, useCase } = build({ waterMl: null, waterSource: null });

    await expect(useCase.execute({ userId, targetMl: bad })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(settingsRepo.saveWaterTarget).not.toHaveBeenCalled();
  });
});

describe('PUT /nutrition/water-target', () => {
  function createApp(execute = vi.fn().mockResolvedValue({ targetMl: 3000, source: 'saved' })) {
    const controller = createNutritionMemberController({ setWaterTarget: { execute } } as never);
    const group = createNutritionMemberRoutes('/api/v1/nutrition', controller);
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
    return { app, execute };
  }

  it('saves a valid target', async () => {
    const { app, execute } = createApp();

    const res = await request(app).put('/api/v1/nutrition/water-target').send({ targetMl: 3000 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ targetMl: 3000, source: 'saved' });
    expect(execute).toHaveBeenCalledWith({ userId, targetMl: 3000 });
  });

  it('null clears the target', async () => {
    const { app, execute } = createApp(vi.fn().mockResolvedValue({ targetMl: 2800, source: 'estimated' }));

    const res = await request(app).put('/api/v1/nutrition/water-target').send({ targetMl: null });

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({ userId, targetMl: null });
  });

  it.each([{}, { targetMl: 100 }, { targetMl: 9000 }, { targetMl: 2500.5 }, { targetMl: '3000' }])(
    'rejects %j with 400 and never reaches the use case',
    async (body) => {
      const { app, execute } = createApp();

      const res = await request(app).put('/api/v1/nutrition/water-target').send(body);

      expect(res.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
    },
  );
});

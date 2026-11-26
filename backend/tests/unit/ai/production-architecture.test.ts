import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiUsageGateService,
  CheckAndRecordAiQuotaUseCase,
  type AppSettingsRepository,
} from '../../../src/modules/app-settings/index.js';
import type { UserContextRepository } from '../../../src/modules/coach/application/ports.js';
import { GetCoachInsightsUseCase } from '../../../src/modules/coach/application/use-cases/get-coach-insights.js';
import { PythonCoachInsightsService } from '../../../src/modules/coach/infrastructure/python-coach-insights-service.js';
import { ToolReplayCache } from '../../../src/modules/coach/interface/internal-tools.routes.js';
import { AdaptAiWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/adapt-ai-workout-plan.js';
import { GenerateAiWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/generate-ai-workout-plan.js';
import { PythonWorkoutPlannerService } from '../../../src/modules/workouts/infrastructure/python-workout-planner-service.js';
import { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { isAppError } from '../../../src/shared/errors/app-error.js';
import { InMemoryAiUsageStore } from '../../helpers/ai-usage-gate.js';
import {
  closedPortUrl,
  json,
  okEmbedReply,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'phase20-unit-test-secret-32-chars-minimum!';
const USER = '11111111-1111-4111-8111-111111111111';

class InMemorySettingsRepo {
  flags: Record<string, boolean> = {
    aiCoach: true,
    mealPhotoScanner: true,
    voiceMealEntry: true,
    workoutGenerator: true,
  };
  limits: Record<string, number> = {
    dailyGlobalLimit: 50,
    coachChatDailyLimit: 20,
    mealPhotoDailyLimit: 10,
    voiceMealDailyLimit: 10,
    workoutGeneratorDailyLimit: 2,
  };
  readonly store = new InMemoryAiUsageStore();

  async getSettingByKey(key: string) {
    return { key, value: key === 'features.flags' ? this.flags : this.limits };
  }

  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) =>
    this.store.reserveAiUsage(input);

  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) =>
    this.store.releaseAiUsage(input);
}

describe('Phase 20 Production AI Architecture', () => {
  let server: FakePythonServer;

  beforeEach(async () => {
    server = await startFakePythonServer();
    GetCoachInsightsUseCase.clearCache();
  });

  afterEach(async () => {
    await server.close();
  });

  it('PythonAiClient.embed accepts the Python EmbedResponse wire contract (with model, usage, outcome, traceId)', async () => {
    server.respond((_req, res) =>
      json(
        res,
        200,
        okEmbedReply({
          model: 'gemini-embedding-001',
          traceId: 'trace-phase20-embed',
        }),
      ),
    );
    const client = new PythonAiClient({ baseUrl: server.url, serviceSecret: SECRET });
    const result = await client.embed({
      userId: USER,
      requestId: 'trace-phase20-embed',
      texts: ['Squat depth cues'],
    });

    expect(result.outcome).toBe('ok');
    expect(result.traceId).toBe('trace-phase20-embed');
    expect(result.usage.model).toBe('gemini-embedding-001');
    expect(result.embeddings).toHaveLength(1);
  });

  it('GenerateAiWorkoutPlanUseCase enforces workout_generator quota, feature flag, and pre-dispatch refund', async () => {
    const settings = new InMemorySettingsRepo();
    const gate = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository),
    );

    const unreachableClient = new PythonAiClient({
      baseUrl: await closedPortUrl(),
      serviceSecret: SECRET,
    });
    const planner = new PythonWorkoutPlannerService({
      client: unreachableClient,
      timeoutMs: 2_000,
    });
    const useCase = new GenerateAiWorkoutPlanUseCase(planner, gate);

    // Pre-dispatch failure (connection refused) refunds the workout_generator quota unit
    await expect(
      useCase.execute({
        userId: USER,
        goal: 'strength',
        experienceLevel: 'beginner',
        availableEquipment: ['bodyweight'],
        daysPerWeek: 3,
        sessionDurationMinutes: 45,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(settings.store.actionCount(USER, 'workout_generator')).toBe(0);

    // Feature flag off blocks before quota or Python call
    settings.flags.workoutGenerator = false;
    await expect(
      useCase.execute({
        userId: USER,
        goal: 'strength',
        experienceLevel: 'beginner',
        availableEquipment: ['bodyweight'],
        daysPerWeek: 3,
        sessionDurationMinutes: 45,
      }),
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(settings.store.actionCount(USER, 'workout_generator')).toBe(0);

    // Re-enable and consume up to daily limit (2)
    settings.flags.workoutGenerator = true;
    const okUseCase = new GenerateAiWorkoutPlanUseCase(
      {
        generatePlan: vi.fn().mockResolvedValue({
          plan: { plan_id: 'p1' },
          validation: {
            isValid: true,
            errors: [],
            warnings: [],
            safetyScore: 1,
            repaired: false,
            medicalRedFlags: [],
          },
          traceId: 'wp-1',
        }),
        adaptPlan: vi.fn(),
      },
      gate,
    );
    await okUseCase.execute({
      userId: USER,
      goal: 'strength',
      experienceLevel: 'beginner',
      availableEquipment: ['bodyweight'],
      daysPerWeek: 3,
      sessionDurationMinutes: 45,
    });
    await okUseCase.execute({
      userId: USER,
      goal: 'strength',
      experienceLevel: 'beginner',
      availableEquipment: ['bodyweight'],
      daysPerWeek: 3,
      sessionDurationMinutes: 45,
    });
    await expect(
      okUseCase.execute({
        userId: USER,
        goal: 'strength',
        experienceLevel: 'beginner',
        availableEquipment: ['bodyweight'],
        daysPerWeek: 3,
        sessionDurationMinutes: 45,
      }),
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED' });

    // AdaptAiWorkoutPlanUseCase shares the workout_generator quota gate
    const adaptUseCase = new AdaptAiWorkoutPlanUseCase({ generatePlan: vi.fn(), adaptPlan: vi.fn() }, gate);
    await expect(
      adaptUseCase.execute({
        userId: USER,
        currentPlan: {},
      }),
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED' });
  });

  it('ToolReplayCache rejects duplicate jti and bounds memory capacity', () => {
    const cache = new ToolReplayCache(3);
    expect(cache.checkAndStore('j1', 200, 100)).toBe(true);
    expect(cache.checkAndStore('j1', 200, 101)).toBe(false);
    expect(cache.checkAndStore('j2', 200, 102)).toBe(true);
    expect(cache.checkAndStore('j3', 200, 103)).toBe(true);
    // 4th insert evicts oldest while preserving j2/j3
    expect(cache.checkAndStore('j4', 200, 104)).toBe(true);
    expect(cache.checkAndStore('j3', 200, 105)).toBe(false);
  });

  it('GetCoachInsightsUseCase degrades deterministically when Python AI backend is unreachable', async () => {
    const settings = new InMemorySettingsRepo();
    const gate = new AiUsageGateService(
      new CheckAndRecordAiQuotaUseCase(settings as unknown as AppSettingsRepository),
    );
    const unreachableClient = new PythonAiClient({
      baseUrl: await closedPortUrl(),
      serviceSecret: SECRET,
    });
    const service = new PythonCoachInsightsService({
      client: unreachableClient,
      resolveModels: async () => ({ primary: 'gemini-3.5-flash-lite', fallback: 'gemini-3.1-flash-lite' }),
      pythonTimeoutMs: 2_000,
    });
    const contextRepo: UserContextRepository = {
      getUserFitnessContext: async () => ({
        profile: {
          displayName: 'Dev',
          sex: 'male',
          age: 28,
          heightCm: 175,
          currentWeightKg: 75,
          targetWeightKg: 70,
          primaryGoal: 'Lose fat',
          experienceLevel: 'Intermediate',
          preferredWorkoutPlace: 'Gym',
          workoutDaysPerWeek: 4,
          dietType: 'Balanced',
          dailyCalorieTarget: 2200,
          dailyProteinGrams: 140,
        },
        todayNutrition: {
          caloriesConsumed: 1500,
          proteinGrams: 90,
          carbsGrams: 150,
          fatGrams: 50,
          waterIntakeMl: 1800,
          calorieTarget: 2200,
          proteinTarget: 140,
        },
        recentWorkouts: [
          {
            name: 'Upper Body',
            durationMinutes: 45,
            volumeKg: 3500,
            totalSets: 16,
            caloriesBurned: 280,
            completedAt: new Date().toISOString(),
          },
        ],
        todayPlannedWorkout: null,
        activeGoals: [],
        latestWeightKg: 75,
      }),
    };

    const useCase = new GetCoachInsightsUseCase(
      contextRepo,
      {
        generateCoachResponse: vi.fn(),
        generateInsights: (ctx, lang) => service.generateInsights(ctx, lang),
      },
      gate,
    );
    const res = await useCase.execute({ userId: USER, lang: 'en' });
    expect(res.insights.length).toBeGreaterThan(0);
    expect(isAppError(res)).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCoachInsightsUseCase } from '../../../src/modules/coach/application/use-cases/get-coach-insights.js';
import type { UserContextRepository, GeminiService } from '../../../src/modules/coach/application/ports.js';
import type { CoachInsightsResponse, UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { allowAllAiUsageGate } from '../../helpers/ai-usage-gate.js';

describe('GetCoachInsightsUseCase', () => {
  let mockUserContextRepo: UserContextRepository;
  let mockGeminiService: GeminiService;
  let useCase: GetCoachInsightsUseCase;

  const mockContext: UserFitnessContext = {
    profile: {
      displayName: 'Karthik',
      sex: 'male',
      age: 28,
      heightCm: 178,
      currentWeightKg: 75,
      targetWeightKg: 72,
      primaryGoal: 'Muscle Gain',
      experienceLevel: 'Intermediate',
      preferredWorkoutPlace: 'Gym',
      workoutDaysPerWeek: 5,
      dietType: 'High Protein',
      dailyCalorieTarget: 2400,
      dailyProteinGrams: 150,
    },
    todayNutrition: {
      caloriesConsumed: 1400,
      proteinGrams: 90,
      carbsGrams: 160,
      fatGrams: 45,
      waterIntakeMl: 2000,
      calorieTarget: 2400,
      proteinTarget: 150,
    },
    recentWorkouts: [
      {
        name: 'Upper Body Push',
        durationMinutes: 45,
        volumeKg: 4200,
        totalSets: 14,
        caloriesBurned: 350,
        completedAt: new Date().toISOString(),
      },
    ],
    todayPlannedWorkout: {
      name: 'Leg Day',
      durationMinutes: 50,
      exercisesCount: 5,
    },
    activeGoals: [],
    latestWeightKg: 75,
  };

  const sampleInsightsResponse: CoachInsightsResponse = {
    greeting: 'Good morning Karthik!',
    recommendation: 'Target Leg Day today with proper warm-up.',
    insights: [
      {
        id: 'ins-1',
        title: 'Workout Consistency',
        description: 'You completed Upper Body Push yesterday. Ready for Leg Day?',
        category: 'workout',
        priority: 'high',
        severity: 'positive',
        action: 'View Workout',
        question: 'What exercises are scheduled for Leg Day?',
        evidence: ['Upper Body Push logged'],
        confidence: 'high',
        requiresDevice: false,
      },
      {
        id: 'ins-2',
        title: 'Hydration on Track',
        description: '2.0L logged so far. Keep sipping through your workout.',
        category: 'hydration',
        priority: 'medium',
        severity: 'info',
        action: 'Log Water',
        question: 'Should I drink electrolytes today?',
        evidence: ['2000 ml logged'],
        confidence: 'high',
        requiresDevice: false,
      },
    ],
    generatedAt: new Date().toISOString(),
    hasSufficientData: true,
  };

  beforeEach(() => {
    GetCoachInsightsUseCase.clearCache();
    mockUserContextRepo = {
      getUserFitnessContext: vi.fn().mockResolvedValue(mockContext),
    };
    mockGeminiService = {
      generateCoachResponse: vi.fn(),
      generateInsights: vi.fn().mockResolvedValue(sampleInsightsResponse),
    };
    useCase = new GetCoachInsightsUseCase(mockUserContextRepo, mockGeminiService, allowAllAiUsageGate());
  });

  it('generates real personalized insights using context and gemini', async () => {
    const result = await useCase.execute({
      userId: 'user-123',
      timezone: 'Asia/Kolkata',
      lang: 'en',
    });

    expect(mockUserContextRepo.getUserFitnessContext).toHaveBeenCalledWith('user-123', 'Asia/Kolkata');
    expect(mockGeminiService.generateInsights).toHaveBeenCalledWith(mockContext, 'en');
    expect(result.insights).toHaveLength(2);
    expect(result.greeting).toBe('Good morning Karthik!');
    expect(result.hasSufficientData).toBe(true);
  });

  it('serves cached insights on subsequent calls and avoids duplicate Gemini calls', async () => {
    const result1 = await useCase.execute({ userId: 'user-123', lang: 'en' });
    const result2 = await useCase.execute({ userId: 'user-123', lang: 'en' });

    expect(mockGeminiService.generateInsights).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });

  it('enforces per-user cache isolation (User A cache does not leak to User B)', async () => {
    await useCase.execute({ userId: 'user-A', lang: 'en' });
    await useCase.execute({ userId: 'user-B', lang: 'en' });

    expect(mockGeminiService.generateInsights).toHaveBeenCalledTimes(2);
    expect(mockUserContextRepo.getUserFitnessContext).toHaveBeenCalledWith('user-A', 'UTC');
    expect(mockUserContextRepo.getUserFitnessContext).toHaveBeenCalledWith('user-B', 'UTC');
  });

  it('bypasses cache when forceRefresh is true', async () => {
    await useCase.execute({ userId: 'user-123', lang: 'en' });
    await useCase.execute({ userId: 'user-123', lang: 'en', forceRefresh: true });

    expect(mockGeminiService.generateInsights).toHaveBeenCalledTimes(2);
  });

  it('deduplicates simultaneous in-flight requests for the same user', async () => {
    let resolveInsights: (val: CoachInsightsResponse) => void;
    const delayedPromise = new Promise<CoachInsightsResponse>((resolve) => {
      resolveInsights = resolve;
    });
    vi.mocked(mockGeminiService.generateInsights).mockReturnValueOnce(delayedPromise);

    const call1 = useCase.execute({ userId: 'user-concurrent', lang: 'en' });
    const call2 = useCase.execute({ userId: 'user-concurrent', lang: 'en' });

    resolveInsights!(sampleInsightsResponse);
    const [res1, res2] = await Promise.all([call1, call2]);

    expect(mockGeminiService.generateInsights).toHaveBeenCalledTimes(1);
    expect(res1).toEqual(res2);
  });

  it('throws unauthorized error if userId is missing', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrow('Authentication is required');
  });
});


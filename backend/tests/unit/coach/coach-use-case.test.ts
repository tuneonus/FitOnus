import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { GeminiService, UserContextRepository } from '../../../src/modules/coach/application/ports.js';
import type { CoachResponse, UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

describe('ChatWithCoachUseCase', () => {
  let mockUserContextRepo: UserContextRepository;
  let mockGeminiService: GeminiService;
  let useCase: ChatWithCoachUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';

  const mockContext: UserFitnessContext = {
    profile: {
      displayName: 'Karthik',
      sex: 'male',
      age: 29,
      heightCm: 178,
      currentWeightKg: 80,
      targetWeightKg: 75,
      primaryGoal: 'lose',
      experienceLevel: 'intermediate',
      preferredWorkoutPlace: 'gym',
      workoutDaysPerWeek: 4,
      dietType: 'standard',
      dailyCalorieTarget: 2100,
      dailyProteinGrams: 160,
    },
    todayNutrition: {
      caloriesConsumed: 1100,
      proteinGrams: 85,
      carbsGrams: 110,
      fatGrams: 30,
      waterIntakeMl: 1800,
      calorieTarget: 2100,
      proteinTarget: 160,
    },
    recentWorkouts: [
      {
        name: 'Full Body Push',
        durationMinutes: 45,
        volumeKg: 3200,
        totalSets: 14,
        caloriesBurned: 350,
        completedAt: new Date().toISOString(),
      },
    ],
    todayPlannedWorkout: {
      name: 'Legs & Core',
      durationMinutes: 50,
      exercisesCount: 6,
    },
    activeGoals: [
      {
        title: 'Reach 75kg',
        category: 'weight',
        targetValue: 75,
        currentValue: 80,
        unit: 'kg',
      },
    ],
    latestWeightKg: 80,
  };

  const mockResponse: CoachResponse = {
    text: 'Great work so far Karthik! You have 1000 calories left for the day.',
    followUps: ['Can I eat biryani tonight?', 'What should I do for Legs & Core?'],
    sources: ['Profile', "Today's Nutrition"],
  };

  beforeEach(() => {
    mockUserContextRepo = {
      getUserFitnessContext: vi.fn().mockResolvedValue(mockContext),
    };
    mockGeminiService = {
      generateCoachResponse: vi.fn().mockResolvedValue(mockResponse),
      generateInsights: vi.fn(),
    };
    useCase = new ChatWithCoachUseCase(mockUserContextRepo, mockGeminiService);
  });

  it('generates coach response when valid input is provided', async () => {
    const result = await useCase.execute({
      userId,
      message: 'How am I doing today?',
      timezone: 'Asia/Kolkata',
    });

    expect(mockUserContextRepo.getUserFitnessContext).toHaveBeenCalledWith(userId, 'Asia/Kolkata');
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'How am I doing today?',
      mockContext,
      undefined,
    );
    expect(result.text).toBe('Great work so far Karthik! You have 1000 calories left for the day.');
    expect(result.followUps).toHaveLength(2);
  });

  it('rejects empty or whitespace-only messages', async () => {
    await expect(
      useCase.execute({
        userId,
        message: '   ',
      }),
    ).rejects.toThrow(AppError);
  });

  it('rejects unauthenticated requests without userId', async () => {
    await expect(
      useCase.execute({
        userId: '',
        message: 'Hello coach',
      }),
    ).rejects.toThrow(AppError);
  });

  it('passes chat history to gemini service', async () => {
    const history = [
      { role: 'user' as const, text: 'Hello' },
      { role: 'assistant' as const, text: 'Hi Karthik!' },
    ];

    await useCase.execute({
      userId,
      message: 'What should I eat?',
      history,
    });

    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'What should I eat?',
      mockContext,
      history,
    );
  });

  it('propagates service unavailable errors gracefully', async () => {
    mockGeminiService.generateCoachResponse = vi.fn().mockRejectedValue(
      new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'AI coaching service is temporarily unavailable.'),
    );

    await expect(
      useCase.execute({
        userId,
        message: 'Hello coach',
      }),
    ).rejects.toThrow('AI coaching service is temporarily unavailable.');
  });
});


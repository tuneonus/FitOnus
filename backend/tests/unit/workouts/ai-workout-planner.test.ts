import { describe, expect, it, vi } from 'vitest';
import type {
  AiWorkoutPlanResult,
  IAiWorkoutPlanner,
} from '../../../src/modules/workouts/application/ports.js';
import { GenerateAiWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/generate-ai-workout-plan.js';
import { AdaptAiWorkoutPlanUseCase } from '../../../src/modules/workouts/application/use-cases/adapt-ai-workout-plan.js';
import { PythonWorkoutPlannerService } from '../../../src/modules/workouts/infrastructure/python-workout-planner-service.js';

describe('AI Workout Planner Use Cases', () => {
  const samplePlan = {
    planId: 'plan-1111-2222',
    title: '3-Day Hypertrophy Split',
    description: 'Personalized muscle building routine',
    goal: 'muscle_building',
    level: 'intermediate',
    totalDaysPerWeek: 3,
    scheduleDays: [
      {
        sessionId: 'sess-1',
        dayName: 'Day 1 - Push',
        focus: 'Chest and Shoulders',
        estimatedDurationMinutes: 45,
        difficulty: 'intermediate',
        warmup: { exercises: ['Arm circles'], durationMinutes: 5 },
        exercises: [
          {
            exerciseId: 'a1111111-1111-4111-8111-111111111101',
            name: 'Push-Up',
            targetMuscle: 'chest',
            equipment: 'bodyweight',
            targetSets: 3,
            targetReps: '10-12',
            restSeconds: 60,
            targetWeightKg: 0,
            intensity: 'Moderate',
            orderIndex: 0,
            alternatives: [],
          },
        ],
        cooldown: { exercises: ['Chest stretch'], durationMinutes: 5 },
      },
    ],
    recoveryDays: ['Day 2', 'Day 4'],
    rationale: ['Matched user equipment and goals'],
    language: 'en',
  };

  const sampleResponse: AiWorkoutPlanResult = {
    plan: samplePlan,
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      safetyScore: 1.0,
      repaired: false,
      medicalRedFlags: [],
    },
    traceId: 'trace-test-123',
  };

  it('GenerateAiWorkoutPlanUseCase returns structured plan on valid input', async () => {
    const mockAiPlanner: IAiWorkoutPlanner = {
      generatePlan: vi.fn().mockResolvedValue(sampleResponse),
      adaptPlan: vi.fn(),
    };

    const useCase = new GenerateAiWorkoutPlanUseCase(mockAiPlanner);
    const result = await useCase.execute({
      userId: 'usr-123',
      goal: 'muscle_building',
      experienceLevel: 'intermediate',
      availableEquipment: ['bodyweight'],
      daysPerWeek: 3,
      sessionDurationMinutes: 45,
    });

    expect(mockAiPlanner.generatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-123',
        goal: 'muscle_building',
        experienceLevel: 'intermediate',
        daysPerWeek: 3,
      }),
    );
    const plan = result.plan as typeof samplePlan;
    expect(plan.title).toBe('3-Day Hypertrophy Split');
    expect(result.validation.isValid).toBe(true);
    expect(plan.scheduleDays).toHaveLength(1);
  });

  it('AdaptAiWorkoutPlanUseCase returns adapted plan', async () => {
    const adaptedResponse: AiWorkoutPlanResult = {
      ...sampleResponse,
      plan: {
        ...samplePlan,
        title: 'Adapted 3-Day Split (Reduced Time)',
        scheduleDays: [
          {
            ...samplePlan.scheduleDays[0],
            estimatedDurationMinutes: 30,
          },
        ],
      },
    };

    const mockAiPlanner: IAiWorkoutPlanner = {
      generatePlan: vi.fn(),
      adaptPlan: vi.fn().mockResolvedValue(adaptedResponse),
    };

    const useCase = new AdaptAiWorkoutPlanUseCase(mockAiPlanner);
    const result = await useCase.execute({
      userId: 'usr-123',
      currentPlan: samplePlan,
      reducedDurationMinutes: 30,
      difficultyFeedback: 'too_hard',
    });

    expect(mockAiPlanner.adaptPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-123',
        reducedDurationMinutes: 30,
        difficultyFeedback: 'too_hard',
      }),
    );
    const plan = result.plan as typeof samplePlan;
    expect(plan.title).toBe('Adapted 3-Day Split (Reduced Time)');
    expect(plan.scheduleDays[0]?.estimatedDurationMinutes).toBe(30);
  });

  it('PythonWorkoutPlannerService formats internal request and parses snake_case response', async () => {
    const fakePythonClient = {
      postJson: vi.fn().mockResolvedValue({
        plan: {
          plan_id: 'plan-python-1',
          title: 'Python Generated Split',
          description: 'Grounded in FitOnus catalog',
          goal: 'strength',
          level: 'beginner',
          total_days_per_week: 2,
          environment: 'gym',
          schedule_days: [
            {
              session_id: 's1',
              day_name: 'Day 1',
              focus: 'Full Body',
              estimated_duration_minutes: 40,
              difficulty: 'beginner',
              warmup: { exercises: [], duration_minutes: 5 },
              exercises: [
                {
                  exercise_id: 'a1111111-1111-4111-8111-111111111101',
                  name: 'Push-Up',
                  target_muscle: 'chest',
                  equipment: 'bodyweight',
                  target_sets: 3,
                  target_reps: '10',
                  rest_seconds: 60,
                  target_weight_kg: 0,
                  intensity: 'Moderate',
                  order_index: 0,
                  alternatives: [],
                },
              ],
              cooldown: { exercises: [], duration_minutes: 5 },
            },
          ],
          recovery_days: ['Wednesday'],
          rationale: ['Safe starting volume'],
          language: 'en',
        },
        validation: {
          is_valid: true,
          errors: [],
          warnings: [],
          safety_score: 1.0,
          repaired: false,
          medical_red_flags: [],
        },
        trace_id: 'trace-py-1',
      }),
    };

    const service = new PythonWorkoutPlannerService({ client: fakePythonClient as any });
    const result = await service.generatePlan({
      userId: 'usr-py-test',
      goal: 'strength',
      experienceLevel: 'beginner',
      availableEquipment: ['bodyweight'],
      daysPerWeek: 2,
      sessionDurationMinutes: 40,
    });

    expect(fakePythonClient.postJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/internal/v1/ai/workout-planner/generate',
        scope: 'ai:workout:plan',
        userId: 'usr-py-test',
        body: expect.objectContaining({
          user_id: 'usr-py-test',
          goal: 'strength',
          experience_level: 'beginner',
        }),
      }),
    );
    expect((result.plan as any).plan_id).toBe('plan-python-1');
    expect((result.plan as any).title).toBe('Python Generated Split');
    expect(result.validation.isValid).toBe(true);
    expect(result.traceId).toBe('trace-py-1');
  });
});

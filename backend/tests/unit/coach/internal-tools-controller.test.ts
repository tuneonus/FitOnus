import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import { createInternalToolsController, type InternalToolsControllerDeps } from '../../../src/modules/coach/interface/internal-tools.controller.js';
import { createActor } from '../../../src/shared/auth/actor.js';

describe('Internal Tools Controller', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  let mockDeps: InternalToolsControllerDeps;

  beforeEach(() => {
    mockDeps = {
      sessionRepo: {
        listForUser: vi.fn().mockResolvedValue({
          sessions: [
            {
              id: 'sess-1',
              workoutName: 'Upper Body Power',
              durationSeconds: 3600,
              totalVolumeKg: 4500,
              totalSets: 16,
              caloriesBurned: 420,
              completedAt: new Date('2026-11-20T10:00:00.000Z'),
            },
          ],
          total: 1,
        }),
      } as unknown as InternalToolsControllerDeps['sessionRepo'],

      personalRecordRepo: {
        listCurrentBests: vi.fn().mockResolvedValue([
          {
            exerciseId: 'ex-bench',
            recordType: 'max_weight',
            weightKg: 100,
            reps: 5,
            achievedAt: new Date('2026-11-18T10:00:00.000Z'),
          },
        ]),
      } as unknown as InternalToolsControllerDeps['personalRecordRepo'],

      exerciseRepo: {
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === '22222222-2222-4222-8222-222222222222') {
            return Promise.resolve({
              id,
              name: 'Barbell Bench Press',
              description: 'Standard chest press',
              instructions: ['Lie on bench', 'Lower bar', 'Press up'],
              tips: ['Keep feet planted'],
              primaryMuscles: ['chest'],
              secondaryMuscles: ['triceps'],
              equipment: 'barbell',
              category: 'strength',
              difficulty: 'intermediate',
              isCompound: true,
            });
          }
          return Promise.resolve(null);
        }),
        list: vi.fn().mockResolvedValue({
          exercises: [
            {
              id: 'ex-bench',
              name: 'Barbell Bench Press',
              primaryMuscles: ['chest'],
              secondaryMuscles: ['triceps', 'shoulders'],
              equipment: 'barbell',
              category: 'strength',
              difficulty: 'intermediate',
            },
          ],
          total: 1,
        }),
      } as unknown as InternalToolsControllerDeps['exerciseRepo'],

      profileRepo: {
        ensureProfile: vi.fn().mockResolvedValue({
          profile: {
            primaryGoal: 'strength',
            experienceLevel: 'intermediate',
            preferredWorkoutPlace: 'gym',
            workoutDaysPerWeek: 4,
            preferredWorkoutDurationMin: 60,
            availableEquipment: ['barbell', 'dumbbell'],
            dietType: 'none',
            allergies: ['peanuts'],
          },
          name: 'Test Athlete',
        }),
      },

      knowledgeService: {
        searchSimilar: vi.fn().mockResolvedValue([
          {
            id: 'chunk-1',
            documentCategory: 'fitness',
            documentTitle: 'Progressive Overload Guide',
            content: 'Increase weight or repetitions incrementally.',
            similarity: 0.92,
          },
        ]),
      } as unknown as InternalToolsControllerDeps['knowledgeService'],

      mealRepo: {
        listDateRange: vi.fn().mockResolvedValue([
          {
            date: '2026-11-20',
            totalCalories: 2100,
            totalProteinG: 150,
            totalCarbsG: 220,
            totalFatG: 65,
          },
        ]),
      } as unknown as InternalToolsControllerDeps['mealRepo'],

      waterRepo: {
        getTotalDateRange: vi.fn().mockResolvedValue([
          { date: '2026-11-20', totalMl: 2500 },
        ]),
      } as unknown as InternalToolsControllerDeps['waterRepo'],

      targetAdapter: {
        findTargetsByUserId: vi.fn().mockResolvedValue({
          source: 'saved',
          calories: 2200,
          proteinG: 160,
          carbsG: 240,
          fatG: 70,
          waterMl: 3000,
          waterSource: 'saved',
        }),
      } as unknown as InternalToolsControllerDeps['targetAdapter'],

      weightRepo: {
        getUserWeightSummary: vi.fn().mockResolvedValue({
          currentWeightKg: 78.5,
          targetWeightKg: 75.0,
          startingWeightKg: 85.0,
          latestLoggedAt: new Date('2026-11-20T08:00:00.000Z'),
          totalLogsCount: 15,
        }),
        listForUser: vi.fn().mockResolvedValue({
          logs: [
            {
              weightKg: 78.5,
              loggedAt: new Date('2026-11-20T08:00:00.000Z'),
            },
          ],
          total: 1,
        }),
      } as unknown as InternalToolsControllerDeps['weightRepo'],
    };
  });

  function createMockRequest(body: Record<string, unknown>, actorUserId: string = userId): Request {
    return {
      actor: createActor({ userId: actorUserId, sessionId: 'test-session', role: 'member' }),
      validated: { body },
    } as unknown as Request;
  }

  it('getRecentWorkouts queries sessions and PRs strictly for the authenticated actor', async () => {
    const controller = createInternalToolsController(mockDeps);
    const req = createMockRequest({ days: 7 });

    const result = await controller.getRecentWorkouts(req);

    expect(mockDeps.sessionRepo.listForUser).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ limit: 10 }),
    );
    expect(mockDeps.personalRecordRepo.listCurrentBests).toHaveBeenCalledWith(userId);

    expect(result.data.workouts).toHaveLength(1);
    expect(result.data.workouts[0]).toEqual({
      id: 'sess-1',
      name: 'Upper Body Power',
      durationMinutes: 60,
      totalVolumeKg: 4500,
      totalSets: 16,
      caloriesBurned: 420,
      completedAt: '2026-11-20T10:00:00.000Z',
    });
    expect(result.data.personalRecords[0]).toEqual({
      exerciseId: 'ex-bench',
      recordType: 'max_weight',
      weightKg: 100,
      reps: 5,
      achievedAt: '2026-11-18T10:00:00.000Z',
    });
  });

  it('getNutritionSummary groups daily meals and water, attaching user targets', async () => {
    const controller = createInternalToolsController(mockDeps);
    const req = createMockRequest({ days: 7 });

    const result = await controller.getNutritionSummary(req);

    expect(mockDeps.mealRepo.listDateRange).toHaveBeenCalledWith(userId, expect.any(String), expect.any(String));
    expect(mockDeps.waterRepo.getTotalDateRange).toHaveBeenCalledWith(userId, expect.any(String), expect.any(String));
    expect(mockDeps.targetAdapter.findTargetsByUserId).toHaveBeenCalledWith(userId);

    expect(result.data.days[0]).toEqual({
      date: '2026-11-20',
      calories: 2100,
      proteinG: 150,
      carbsG: 220,
      fatG: 65,
      waterMl: 2500,
      mealCount: 1,
    });
    expect(result.data.targets).toEqual({
      calories: 2200,
      proteinG: 160,
      carbsG: 240,
      fatG: 70,
      waterMl: 3000,
    });
  });

  it('getWeightTrend retrieves summary and weight logs for authenticated actor', async () => {
    const controller = createInternalToolsController(mockDeps);
    const req = createMockRequest({ days: 30 });

    const result = await controller.getWeightTrend(req);

    expect(mockDeps.weightRepo.getUserWeightSummary).toHaveBeenCalledWith(userId);
    expect(mockDeps.weightRepo.listForUser).toHaveBeenCalledWith(userId, expect.objectContaining({ limit: 30 }));

    expect(result.data.summary).toEqual({
      currentWeightKg: 78.5,
      targetWeightKg: 75.0,
      startingWeightKg: 85.0,
    });
    expect(result.data.logs[0]).toEqual({
      date: '2026-11-20',
      weightKg: 78.5,
    });
  });

  it('searchExercises queries exercise catalog with filters and bounds limit', async () => {
    const controller = createInternalToolsController(mockDeps);
    const req = createMockRequest({ query: 'bench', muscle: 'chest', limit: 5 });

    const result = await controller.searchExercises(req);

    expect(mockDeps.exerciseRepo.list).toHaveBeenCalledWith({
      search: 'bench',
      muscle: 'chest',
      equipment: undefined,
      offset: 0,
      limit: 5,
    });

    expect(result.data.exercises[0]).toEqual({
      id: 'ex-bench',
      name: 'Barbell Bench Press',
      targetMuscle: 'chest',
      secondaryMuscles: ['triceps', 'shoulders'],
      equipment: 'barbell',
      category: 'strength',
      difficulty: 'intermediate',
    });
    expect(result.data.total).toBe(1);
  });

  it('anti-confused-deputy: ignores any injected userId in body and strictly uses req.actor.userId', async () => {
    const controller = createInternalToolsController(mockDeps);
    // Malicious body attempting to query another user's data
    const maliciousBody = {
      days: 7,
      userId: 'victim-user-999',
      targetUserId: 'victim-user-999',
    };
    const req = createMockRequest(maliciousBody, userId);

    await controller.getRecentWorkouts(req);

    // Assert that the repository was called with the authenticated userId, NOT victim-user-999
    expect(mockDeps.sessionRepo.listForUser).toHaveBeenCalledWith(userId, expect.anything());
    expect(mockDeps.sessionRepo.listForUser).not.toHaveBeenCalledWith('victim-user-999', expect.anything());
  });

  it('getExerciseDetails returns detailed exercise metadata or null if not found', async () => {
    const controller = createInternalToolsController(mockDeps);
    const validReq = createMockRequest({ exerciseId: '22222222-2222-4222-8222-222222222222' });

    const found = await controller.getExerciseDetails(validReq);
    expect(found.data.exercise).not.toBeNull();
    expect(found.data.exercise?.name).toBe('Barbell Bench Press');
    expect(found.data.exercise?.instructions).toHaveLength(3);
    expect(found.data.exercise?.tips).toContain('Keep feet planted');

    const notFoundReq = createMockRequest({ exerciseId: '33333333-3333-4333-8333-333333333333' });
    const notFound = await controller.getExerciseDetails(notFoundReq);
    expect(notFound.data.exercise).toBeNull();
  });

  it('getFitnessProfile returns user profile preferences and metabolic targets', async () => {
    const controller = createInternalToolsController(mockDeps);
    const req = createMockRequest({});

    const result = await controller.getFitnessProfile(req);
    expect(result.data.profile.userId).toBe(userId);
    expect(result.data.profile.primaryGoal).toBe('strength');
    expect(result.data.profile.experienceLevel).toBe('intermediate');
    expect(result.data.profile.availableEquipment).toContain('barbell');
    expect(result.data.profile.targets.calories).toBe(2200);
  });

  it('retrieveFitnessKnowledge searches similar chunks with relevance scoring', async () => {
    const controller = createInternalToolsController(mockDeps);
    const req = createMockRequest({ query: 'progressive overload', category: 'fitness', limit: 2 });

    const result = await controller.retrieveFitnessKnowledge(req);
    expect(result.data.chunks).toHaveLength(1);
    expect(result.data.chunks[0]?.title).toBe('Progressive Overload Guide');
    expect(result.data.chunks[0]?.similarity).toBe(0.92);
  });
});

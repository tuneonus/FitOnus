import { describe, expect, it } from 'vitest';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import {
  applyContextBudget,
  estimateProfileTokens,
} from '../../../src/modules/coach/domain/context-budget.js';

describe('Unified Context Token Budgeting & Waterfall Shedding', () => {
  const mockContext: UserFitnessContext = {
    profile: {
      displayName: 'Arun',
      sex: 'male',
      age: 29,
      heightCm: 175,
      currentWeightKg: 72,
      targetWeightKg: 68,
      primaryGoal: 'Fat loss',
      experienceLevel: 'intermediate',
      preferredWorkoutPlace: 'Gym',
      workoutDaysPerWeek: 4,
      dietType: 'Vegetarian',
      dailyCalorieTarget: 2100,
      dailyProteinGrams: 110,
    },
    todayNutrition: {
      caloriesConsumed: 1250,
      proteinGrams: 62.5,
      carbsGrams: 140,
      fatGrams: 38.4,
      waterIntakeMl: 1750,
      calorieTarget: 2100,
      proteinTarget: 110,
    },
    recentWorkouts: [
      {
        name: 'Push Day',
        durationMinutes: 55,
        volumeKg: 4200,
        totalSets: 18,
        caloriesBurned: 320,
        completedAt: '2026-11-21T18:00:00Z',
      },
    ],
    todayPlannedWorkout: {
      name: 'Leg Day',
      durationMinutes: 60,
      exercisesCount: 6,
    },
    activeGoals: [],
    latestWeightKg: 72,
  };

  it('estimates profile tokens cleanly with defensive fallbacks', () => {
    const tokens = estimateProfileTokens(mockContext);
    expect(tokens).toBeGreaterThan(30);
    expect(estimateProfileTokens(null)).toBe(0);
  });

  it('preserves all context components when total is well within budget envelope', () => {
    const history = [
      { role: 'user' as const, text: 'Hello coach' },
      { role: 'assistant' as const, text: 'Hello Arun!' },
    ];
    const memories = ['[INJURIES]: Left shoulder impingement'];
    const knowledge = [
      {
        documentSlug: 'acsm-bench',
        documentTitle: 'ACSM Bench Press',
        category: 'fitness',
        chunkIndex: 0,
        content: 'Keep shoulder blades retracted.',
        citation: 'ACSM Bench Press (Chunk 0)',
      },
    ];

    const result = applyContextBudget('Can I bench today?', mockContext, history, memories, knowledge);

    expect(result.tokenStats.overflowOccurred).toBe(false);
    expect(result.history).toHaveLength(2);
    expect(result.memories).toHaveLength(1);
    expect(result.knowledge).toHaveLength(1);
    expect(result.tokenStats.shedItemsCount).toBe(0);
  });

  it('executes deterministic waterfall shedding when prompt exceeds budget envelope', () => {
    // Generate massive history that forces shedding
    const massiveHistory = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `Dialogue turn ${i}: ` + 'X'.repeat(300),
    }));

    const memories = [
      '[INJURIES]: Left shoulder tendonitis',
      '[FOOD]: Prefers almond milk over dairy',
      '[WORKOUT]: Morning workout preferred',
    ];

    const knowledge = [
      {
        documentSlug: 'doc-1',
        documentTitle: 'Title 1',
        category: 'fitness',
        chunkIndex: 0,
        content: 'Long chunk 1: ' + 'Y'.repeat(400),
        citation: 'Title 1',
      },
      {
        documentSlug: 'doc-2',
        documentTitle: 'Title 2',
        category: 'fitness',
        chunkIndex: 1,
        content: 'Long chunk 2: ' + 'Z'.repeat(400),
        citation: 'Title 2',
      },
    ];

    // Restrict maxPromptTokens to a tight envelope to trigger waterfall
    const result = applyContextBudget(
      'What should I do today?',
      mockContext,
      massiveHistory,
      memories,
      knowledge,
      { maxPromptTokens: 800 },
    );

    expect(result.tokenStats.overflowOccurred).toBe(true);
    expect(result.tokenStats.shedItemsCount).toBeGreaterThan(0);
    // History should have been pruned down
    expect(result.history.length).toBeLessThan(massiveHistory.length);
    // CRITICAL: Safety injury memory MUST be retained!
    expect(result.memories.some((m) => m.includes('shoulder tendonitis'))).toBe(true);
  });
});

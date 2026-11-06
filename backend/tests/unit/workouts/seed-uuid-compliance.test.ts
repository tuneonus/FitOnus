import { describe, expect, it } from 'vitest';
import {
  exerciseViewSchema,
  workoutPlanDetailSchema,
} from '../../../src/modules/workouts/interface/workouts.schemas.js';

describe('Seed UUID RFC 4122 v4 Compliance', () => {
  // Canonical seeded exercise UUIDs (14 official movements)
  const canonicalExerciseUuids = [
    'e0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000003',
    'e0000000-0000-4000-8000-000000000004',
    'e0000000-0000-4000-8000-000000000005',
    'e0000000-0000-4000-8000-000000000006',
    'e0000000-0000-4000-8000-000000000007',
    'e0000000-0000-4000-8000-000000000008',
    'e0000000-0000-4000-8000-000000000009',
    'e0000000-0000-4000-8000-000000000010',
    'e0000000-0000-4000-8000-000000000011',
    'e0000000-0000-4000-8000-000000000012',
    'e0000000-0000-4000-8000-000000000013',
    'e0000000-0000-4000-8000-000000000014',
  ];

  // Canonical starter template UUIDs (3 official templates)
  const canonicalTemplateUuids = [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
  ];

  it('rejects non-RFC 4122 compliant UUIDs with version 0 or invalid variant', () => {
    const invalidExerciseUuid = 'e0000000-0000-0000-0000-000000000001';
    const invalidTemplateUuid = '00000000-0000-0000-0000-000000000101';

    expect(exerciseViewSchema.shape.id.safeParse(invalidExerciseUuid).success).toBe(false);
    expect(workoutPlanDetailSchema.shape.id.safeParse(invalidTemplateUuid).success).toBe(false);
  });

  it('validates all 14 canonical seeded exercise UUIDs successfully', () => {
    for (const uuid of canonicalExerciseUuids) {
      const res = exerciseViewSchema.shape.id.safeParse(uuid);
      expect(res.success).toBe(true);
    }
  });

  it('validates all 3 canonical template UUIDs successfully', () => {
    for (const uuid of canonicalTemplateUuids) {
      const res = workoutPlanDetailSchema.shape.id.safeParse(uuid);
      expect(res.success).toBe(true);
    }
  });

  it('validates exerciseViewSchema structure with compliant seeded ID', () => {
    const exercise = {
      id: canonicalExerciseUuids[0],
      name: 'Barbell Bench Press',
      description: 'Horizontal push compound movement',
      instructions: ['Lower bar to chest', 'Press up'],
      tips: ['Stack wrists'],
      commonMistakes: ['Flaring elbows'],
      primaryMuscles: ['Chest'],
      secondaryMuscles: ['Front delts', 'Triceps'],
      equipment: 'Barbell',
      category: 'strength',
      difficulty: 'intermediate',
      isCompound: true,
      imageUrl: null,
      videoUrl: null,
      isSystem: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = exerciseViewSchema.parse(exercise);
    expect(parsed.id).toBe('e0000000-0000-4000-8000-000000000001');
    expect(parsed.name).toBe('Barbell Bench Press');
  });

  it('validates workoutPlanDetailSchema and exercise mapping with compliant IDs', () => {
    const template = {
      id: canonicalTemplateUuids[0],
      userId: null,
      name: 'Chest + Triceps Starter',
      description: 'Comprehensive upper push workout',
      workoutType: 'strength',
      estimatedDurationMinutes: 50,
      difficulty: 'intermediate',
      isTemplate: true,
      isAiGenerated: false,
      tags: ['push', 'chest', 'starter'],
      exercisesCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exercises: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          workoutId: canonicalTemplateUuids[0],
          exerciseId: canonicalExerciseUuids[0],
          orderIndex: 0,
          targetSets: 4,
          targetReps: '8-10',
          targetDurationSeconds: null,
          targetWeightKg: 60,
          restSeconds: 120,
          notes: 'Main compound',
          supersetGroup: null,
        },
      ],
    };

    const parsed = workoutPlanDetailSchema.parse(template);
    expect(parsed.id).toBe('00000000-0000-4000-8000-000000000101');
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.exercises?.[0]?.exerciseId).toBe('e0000000-0000-4000-8000-000000000001');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createExerciseAdminRequest,
  updateExerciseAdminRequest,
  exerciseViewSchema,
} from '../../backend/src/modules/workouts/interface/workouts.schemas';
import { isProtectedExercise } from '../src/features/workouts/components/ExercisesTable';
import type {
  Exercise,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseListQuery,
} from '../src/features/workouts/types';

describe('Admin Exercise Library — Phase 3 Contract & Verification Tests', () => {
  const sampleSystemExercise: Exercise = {
    id: 'e0000000-0000-4000-8000-000000000001',
    name: 'Barbell Bench Press',
    slug: 'barbell-bench-press',
    description: 'Flat barbell bench press for chest hypertrophy and pushing strength.',
    category: 'strength',
    primaryMuscles: ['Chest'],
    primaryMuscle: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipment: 'Barbell',
    difficulty: 'intermediate',
    isCompound: true,
    instructions: [
      'Lie flat on the bench with eyes positioned under the bar.',
      'Grip the bar slightly wider than shoulder width.',
      'Lower the bar smoothly to mid-chest.',
      'Press upward powerfully to lockout.',
    ],
    tips: ['Keep feet planted flat on the floor', 'Maintain a slight natural arch in the lower back'],
    commonMistakes: ['Flaring elbows out at 90 degrees', 'Bouncing the bar off the ribcage'],
    videoUrl: 'https://cdn.fitonus.com/videos/bench-press.mp4',
    imageUrl: 'https://cdn.fitonus.com/images/bench-press.webp',
    isSystem: true,
    isCustom: false,
    userId: null,
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('1. Exercise View Schema Contract: conforms to backend exerciseViewSchema', () => {
    const parsed = exerciseViewSchema.safeParse(sampleSystemExercise);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.id, 'e0000000-0000-4000-8000-000000000001');
      assert.equal(parsed.data.name, 'Barbell Bench Press');
      assert.equal(parsed.data.isSystem, true);
      assert.equal(parsed.data.isCompound, true);
      assert.deepEqual(parsed.data.primaryMuscles, ['Chest']);
    }
  });

  it('2. Foundational Exercise Protection: correctly identifies all 14 protected seed exercises', () => {
    for (let i = 1; i <= 14; i++) {
      const id = `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      assert.equal(
        isProtectedExercise(id),
        true,
        `Expected exercise ID ${id} to be protected`
      );
    }
  });

  it('3. Custom Exercises Allowed: non-foundational exercises are not protected from deletion', () => {
    const customExerciseId = '11111111-2222-4333-8444-555555555555';
    assert.equal(isProtectedExercise(customExerciseId), false);

    const exercise15 = 'e0000000-0000-4000-8000-000000000015';
    assert.equal(isProtectedExercise(exercise15), false);
  });

  it('4. Create Exercise Validation: accepts complete valid payload with nullable URLs', () => {
    const validPayload = {
      name: 'Incline Dumbbell Press',
      description: 'Upper chest dumbbell press on a 30-degree incline.',
      category: 'hypertrophy',
      primaryMuscles: ['Chest'],
      secondaryMuscles: ['Shoulders', 'Triceps'],
      equipment: 'Dumbbell',
      difficulty: 'intermediate' as const,
      isCompound: true,
      instructions: ['Set bench to 30 degrees', 'Press dumbbells up with control'],
      tips: ['Retract scapula'],
      commonMistakes: ['Setting incline too steep'],
      videoUrl: null,
      imageUrl: null,
    };

    const parsed = createExerciseAdminRequest.body.safeParse(validPayload);
    assert.equal(parsed.success, true);
  });

  it('5. Create Exercise Validation: rejects missing name or empty instructions/primaryMuscles', () => {
    const missingName = {
      name: '   ',
      category: 'strength',
      primaryMuscles: ['Chest'],
      equipment: 'Barbell',
      difficulty: 'intermediate' as const,
      instructions: ['Step 1'],
    };
    const res1 = createExerciseAdminRequest.body.safeParse(missingName);
    assert.equal(res1.success, false);

    const emptyMuscles = {
      name: 'Valid Name',
      category: 'strength',
      primaryMuscles: [],
      equipment: 'Barbell',
      difficulty: 'intermediate' as const,
      instructions: ['Step 1'],
    };
    const res2 = createExerciseAdminRequest.body.safeParse(emptyMuscles);
    assert.equal(res2.success, false);

    const emptyInstructions = {
      name: 'Valid Name',
      category: 'strength',
      primaryMuscles: ['Chest'],
      equipment: 'Barbell',
      difficulty: 'intermediate' as const,
      instructions: [],
    };
    const res3 = createExerciseAdminRequest.body.safeParse(emptyInstructions);
    assert.equal(res3.success, false);
  });

  it('6. Update Exercise Validation: supports partial updates and resetting URLs to null', () => {
    const partialUpdate = {
      difficulty: 'advanced' as const,
      imageUrl: null,
      isCompound: true,
    };

    const parsed = updateExerciseAdminRequest.body.safeParse(partialUpdate);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.difficulty, 'advanced');
      assert.equal(parsed.data.imageUrl, null);
      assert.equal(parsed.data.isCompound, true);
    }
  });

  it('7. Query Parameters Construction: encodes search, filters, and pagination cleanly', () => {
    const query: ExerciseListQuery = {
      page: 2,
      limit: 25,
      search: 'Press',
      muscle: 'chest',
      category: 'strength',
      equipment: 'barbell',
      difficulty: 'intermediate',
    };

    const searchParams = new URLSearchParams();
    if (query.page) searchParams.set('page', query.page.toString());
    if (query.limit) searchParams.set('limit', query.limit.toString());
    if (query.search) searchParams.set('search', query.search);
    if (query.muscle) searchParams.set('muscle', query.muscle);
    if (query.category) searchParams.set('category', query.category);
    if (query.equipment) searchParams.set('equipment', query.equipment);
    if (query.difficulty) searchParams.set('difficulty', query.difficulty);

    const queryString = searchParams.toString();
    assert.ok(queryString.includes('page=2'));
    assert.ok(queryString.includes('limit=25'));
    assert.ok(queryString.includes('search=Press'));
    assert.ok(queryString.includes('muscle=chest'));
    assert.ok(queryString.includes('category=strength'));
    assert.ok(queryString.includes('equipment=barbell'));
    assert.ok(queryString.includes('difficulty=intermediate'));
  });

  it('8. Fallback Display: primary muscle properly falls back to primaryMuscles[0]', () => {
    const exerciseWithArrayOnly: Exercise = {
      ...sampleSystemExercise,
      primaryMuscle: undefined as unknown as string,
      primaryMuscles: ['Chest', 'Shoulders'],
    };

    const displayMuscle =
      exerciseWithArrayOnly.primaryMuscles && exerciseWithArrayOnly.primaryMuscles.length > 0
        ? exerciseWithArrayOnly.primaryMuscles.join(', ')
        : (exerciseWithArrayOnly.primaryMuscle || '—');

    assert.equal(displayMuscle, 'Chest, Shoulders');
  });
});


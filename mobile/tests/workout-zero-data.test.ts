import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useWorkoutStore } from '../src/features/workouts/store/workoutStore';
import { generateWorkoutPlan } from '../src/features/workouts/services/workoutPlanGenerator';
import { WorkoutService } from '../src/features/workouts/services/workout-service';
import { exerciseById } from '../src/features/workouts/data/workoutsMock';

describe('Workout zero-data and admin-managed catalog behavior', () => {
  beforeEach(() => {
    useWorkoutStore.setState({
      catalog: [],
      plannedSession: null,
      history: [],
      active: [],
      currentIndex: 0,
      elapsedSec: 0,
      paused: false,
    });
  });

  it('1. Initializes with empty catalog and null planned session (no fake chest workout)', () => {
    const state = useWorkoutStore.getState();
    assert.deepEqual(state.catalog, []);
    assert.equal(state.plannedSession, null);
  });

  it('2. Missing exercise ID returns safe fallback without fabricating Barbell Bench Press', () => {
    const state = useWorkoutStore.getState();
    const fallback = state.getExerciseById('missing-uuid-1234');
    assert.equal(fallback.id, 'missing-uuid-1234');
    assert.equal(fallback.name, 'Exercise');
    assert.notEqual(fallback.name, 'Barbell Bench Press');

    const mockHelperFallback = exerciseById('non-existent-id');
    assert.equal(mockHelperFallback.name, 'Exercise');
    assert.notEqual(mockHelperFallback.name, 'Barbell Bench Press');
  });

  it('3. An empty backend API response clears cached catalog to truthful zero', async () => {
    // Simulate pre-existing catalog
    useWorkoutStore.setState({
      catalog: [{ id: 'old-1', name: 'Old Exercise', muscle: 'Chest', equipment: 'Barbell' }],
    });
    assert.equal(useWorkoutStore.getState().catalog.length, 1);

    // Mock WorkoutService.getExercises to return []
    const originalGetExercises = WorkoutService.getExercises;
    try {
      WorkoutService.getExercises = async () => [];
      await useWorkoutStore.getState().loadExercises();

      assert.deepEqual(useWorkoutStore.getState().catalog, []);
    } finally {
      WorkoutService.getExercises = originalGetExercises;
    }
  });

  it('4. Admin-created exercises from API are loaded and retrievable by ID', async () => {
    const adminExercise = {
      id: 'admin-ex-001',
      name: 'Romanian Deadlift',
      muscle: 'Hamstrings',
      equipment: 'Barbell',
      level: 'Intermediate' as const,
      instructions: ['Hinge at the hips.'],
      cues: ['Keep back flat.'],
    };

    const originalGetExercises = WorkoutService.getExercises;
    try {
      WorkoutService.getExercises = async () => [adminExercise as any];
      await useWorkoutStore.getState().loadExercises();

      const state = useWorkoutStore.getState();
      assert.equal(state.catalog.length, 1);
      assert.equal(state.catalog[0]?.name, 'Romanian Deadlift');

      const retrieved = state.getExerciseById('admin-ex-001');
      assert.equal(retrieved.name, 'Romanian Deadlift');
      assert.equal(retrieved.muscle, 'Hamstrings');
    } finally {
      WorkoutService.getExercises = originalGetExercises;
    }
  });

  it('5. AI Workout Plan Generator throws error instead of generating fake workout when catalog is empty', async () => {
    const originalGetExercises = WorkoutService.getExercises;
    try {
      WorkoutService.getExercises = async () => [];

      await assert.rejects(
        async () => {
          await generateWorkoutPlan({
            goal: 'Strength',
            durationMin: 45,
            equipment: ['Barbell'],
            level: 'Intermediate',
          });
        },
        {
          name: 'Error',
          message: /No exercises available in catalog/,
        },
      );
    } finally {
      WorkoutService.getExercises = originalGetExercises;
    }
  });

  it('6. AI Workout Plan Generator succeeds when real admin exercises exist', async () => {
    const adminExercises = [
      { id: 'ex-1', name: 'Barbell Squat', muscle: 'Legs', equipment: 'Barbell', level: 'Intermediate' },
      { id: 'ex-2', name: 'Overhead Press', muscle: 'Shoulders', equipment: 'Barbell', level: 'Intermediate' },
      { id: 'ex-3', name: 'Deadlift', muscle: 'Back', equipment: 'Barbell', level: 'Intermediate' },
      { id: 'ex-4', name: 'Bent-Over Row', muscle: 'Back', equipment: 'Barbell', level: 'Intermediate' },
    ];

    const originalGetExercises = WorkoutService.getExercises;
    try {
      WorkoutService.getExercises = async () => adminExercises as any;

      const result = await generateWorkoutPlan({
        goal: 'Strength',
        durationMin: 30,
        equipment: ['Barbell'],
        level: 'Intermediate',
      });

      assert.ok(result.session);
      assert.ok(result.session.exercises.length > 0);
      assert.ok(result.rationale.length > 0);
      // Ensure all exercises in the generated session are from the admin catalog
      for (const ex of result.session.exercises) {
        assert.ok(adminExercises.some((ae) => ae.id === ex.exerciseId));
      }
    } finally {
      WorkoutService.getExercises = originalGetExercises;
    }
  });
});


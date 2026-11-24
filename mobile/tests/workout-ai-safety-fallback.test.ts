import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorkoutPlan } from '../src/features/workouts/services/workoutPlanGenerator';
import { WorkoutService } from '../src/features/workouts/services/workout-service';

describe('WorkoutPlanGenerator Safety & Red-Flag Offline Enforcement', () => {
  it('1. Medical red flags reject generation immediately with clinical escalation', async () => {
    await assert.rejects(
      async () => {
        await generateWorkoutPlan({
          goal: 'Strength',
          durationMin: 45,
          equipment: ['bodyweight'],
          level: 'Beginner',
          physicalLimitations: ['chest pain and tightness during workouts'],
        });
      },
      /Medical red flag detected.*consult a physician/i,
    );

    await assert.rejects(
      async () => {
        await generateWorkoutPlan({
          goal: 'Full Body',
          durationMin: 30,
          equipment: ['bodyweight'],
          level: 'Beginner',
          physicalLimitations: ['dizziness and fainting episodes'],
        });
      },
      /Medical red flag detected.*consult a physician/i,
    );

    await assert.rejects(
      async () => {
        await generateWorkoutPlan({
          goal: 'Muscle Gain',
          durationMin: 45,
          equipment: ['dumbbells'],
          level: 'Intermediate',
          physicalLimitations: ['fractured arm in cast'],
        });
      },
      /Medical red flag detected.*consult a physician/i,
    );
  });

  it('2. Fallback filters out contraindicated exercises for reported limitations', async () => {
    const originalGetExercises = WorkoutService.getExercises;
    try {
      WorkoutService.getExercises = async () => [
        { id: 'ex-squat', name: 'Barbell Back Squat', equipment: 'barbell', muscle: 'quads' },
        { id: 'ex-lunge', name: 'Jumping Lunge', equipment: 'bodyweight', muscle: 'quads' },
        { id: 'ex-bridge', name: 'Glute Bridge', equipment: 'bodyweight', muscle: 'glutes' },
        { id: 'ex-plank', name: 'Plank', equipment: 'bodyweight', muscle: 'core' },
      ];

      // Request with knee pain should exclude Barbell Back Squat and Jumping Lunge
      const result = await generateWorkoutPlan({
        goal: 'Full Body',
        durationMin: 30,
        equipment: ['bodyweight'],
        level: 'Intermediate',
        physicalLimitations: ['patellar tendinitis in knee'],
      });

      const exerciseIds = result.session.exercises.map((e) => e.exerciseId);
      assert.ok(!exerciseIds.includes('ex-squat'), 'Barbell Back Squat should be excluded for knee pain');
      assert.ok(!exerciseIds.includes('ex-lunge'), 'Jumping Lunge should be excluded for knee pain');
      assert.ok(exerciseIds.includes('ex-bridge'), 'Glute Bridge should be allowed');
    } finally {
      WorkoutService.getExercises = originalGetExercises;
    }
  });

  it('3. Fallback enforces volume ceiling for beginners', async () => {
    const originalGetExercises = WorkoutService.getExercises;
    try {
      WorkoutService.getExercises = async () => [
        { id: 'ex-1', name: 'Exercise 1', equipment: 'bodyweight', muscle: 'chest' },
        { id: 'ex-2', name: 'Exercise 2', equipment: 'bodyweight', muscle: 'back' },
        { id: 'ex-3', name: 'Exercise 3', equipment: 'bodyweight', muscle: 'legs' },
        { id: 'ex-4', name: 'Exercise 4', equipment: 'bodyweight', muscle: 'shoulders' },
        { id: 'ex-5', name: 'Exercise 5', equipment: 'bodyweight', muscle: 'core' },
        { id: 'ex-6', name: 'Exercise 6', equipment: 'bodyweight', muscle: 'arms' },
      ];

      const result = await generateWorkoutPlan({
        goal: 'Fat Loss',
        durationMin: 60,
        equipment: ['bodyweight'],
        level: 'Beginner',
      });

      const totalSets = result.session.exercises.reduce((acc, curr) => acc + curr.sets, 0);
      assert.ok(totalSets <= 18, `Beginner session sets (${totalSets}) must not exceed safety cap of 18`);
    } finally {
      WorkoutService.getExercises = originalGetExercises;
    }
  });
});

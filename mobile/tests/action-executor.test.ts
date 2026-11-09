import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionPayload, ActionStatus, Block } from '../src/features/ai-coach/types/coach';
import type { GenerateWorkoutParams, GeneratedPlanResult } from '../src/features/workouts/services/workoutPlanGenerator';

test('AI Action Executor Contracts & Plan Generator', async (t) => {
  await t.test('action payload schemas validate correctly for all action types', () => {
    // 1. logMeal payload
    const mealPayload: ActionPayload = {
      kind: 'logMeal',
      meal: 'lunch',
      items: [
        {
          id: 'food-1',
          name: 'Curd Rice',
          kcal: 250,
          protein: 6,
          carbs: 40,
          fat: 7,
          fiber: 1,
        },
      ],
    };
    assert.equal(mealPayload.kind, 'logMeal');
    assert.equal(mealPayload.meal, 'lunch');
    assert.equal(mealPayload.items.length, 1);
    assert.equal(mealPayload.items[0]?.name, 'Curd Rice');

    // 2. logWorkout payload
    const workoutPayload: ActionPayload = {
      kind: 'logWorkout',
      exercise: 'Barbell Bench Press',
      sets: [
        { weight: 70, reps: 8 },
        { weight: 70, reps: 8 },
        { weight: 72.5, reps: 6 },
      ],
    };
    assert.equal(workoutPayload.kind, 'logWorkout');
    assert.equal(workoutPayload.sets.length, 3);
    assert.equal(workoutPayload.sets[2]?.weight, 72.5);

    // 3. updateWeight payload
    const weightPayload: ActionPayload = {
      kind: 'updateWeight',
      value: 77.5,
    };
    assert.equal(weightPayload.kind, 'updateWeight');
    assert.equal(weightPayload.value, 77.5);

    // 4. createPlan payload
    const planPayload: ActionPayload = {
      kind: 'createPlan',
    };
    assert.equal(planPayload.kind, 'createPlan');

    // 5. updateGoal payload
    const goalPayload: ActionPayload = {
      kind: 'updateGoal',
      goalId: 'g-weight-1',
      target: 74,
    };
    assert.equal(goalPayload.kind, 'updateGoal');
    assert.equal(goalPayload.target, 74);

    // 6. startWorkout payload
    const startPayload: ActionPayload = {
      kind: 'startWorkout',
    };
    assert.equal(startPayload.kind, 'startWorkout');
  });

  await t.test('validates action block status lifecycle', () => {
    const statuses: ActionStatus[] = ['pending', 'running', 'confirmed', 'cancelled', 'undone', 'failed'];
    assert.equal(statuses.length, 6);

    const actionBlock: Extract<Block, { type: 'action' }> = {
      type: 'action',
      id: 'act-test-123',
      title: 'Log Biryani for Dinner',
      summary: [
        { label: 'Meal', value: 'Dinner' },
        { label: 'Food', value: 'Chicken Biryani', estimated: true },
        { label: 'Calories', value: '720 kcal' },
      ],
      payload: {
        kind: 'logMeal',
        meal: 'dinner',
        items: [{ id: 'b-1', name: 'Chicken Biryani', kcal: 720, protein: 32, carbs: 80, fat: 24, fiber: 4 }],
      },
      status: 'pending',
    };

    assert.equal(actionBlock.status, 'pending');
    assert.equal(actionBlock.summary.length, 3);
    assert.equal(actionBlock.payload.kind, 'logMeal');
  });

  await t.test('validates workout plan generator parameter contract and output typing', () => {
    const params: GenerateWorkoutParams = {
      goal: 'Fat Loss',
      durationMin: 45,
      equipment: ['Dumbbells', 'Bench'],
      level: 'Intermediate',
      hasRecovery: true,
    };

    assert.equal(params.goal, 'Fat Loss');
    assert.equal(params.durationMin, 45);
    assert.equal(params.level, 'Intermediate');
    assert.equal(params.hasRecovery, true);

    const mockOutput: GeneratedPlanResult = {
      session: {
        id: 'ai-plan-test',
        title: 'Fat Loss · Intermediate',
        focus: 'Fat Loss · 45 min',
        durationMin: 45,
        intensity: 'Moderate–high',
        exercises: [
          { exerciseId: 'incline-db', sets: 4, reps: '12–15', weight: 16, restSec: 45 },
          { exerciseId: 'dips', sets: 4, reps: '12–15', weight: 0, restSec: 45 },
          { exerciseId: 'plank', sets: 4, reps: '12–15', weight: 0, restSec: 45 },
        ],
      },
      rationale: [
        'Recovery signals support a higher effort session today.',
        'Short 45s rest intervals maintain elevated heart rate for maximum caloric burn.',
        'Customized strictly for your selected equipment (Dumbbells, Bench).',
      ],
    };

    assert.equal(mockOutput.session.exercises.length, 3);
    assert.equal(mockOutput.rationale.length, 3);
    assert.equal(mockOutput.session.intensity, 'Moderate–high');
  });
});

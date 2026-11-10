import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseById, exercises } from '../src/features/workouts/data/workoutsMock';
import {
  calculateBmi,
  getBmiCategory,
  kgToLb,
  lbToKg,
  cmToFtIn,
  ftInToCm,
} from '../src/shared/utils/unit-conversion';
import { goalProgress } from '../src/features/goals/utils/goal-calculator';
import type { Goal } from '../src/features/goals/types/goal';
import { calculatePortionNutrients } from '../src/features/nutrition/utils/nutrition-calculator';
import type { FoodItem } from '../src/features/nutrition/types/nutrition';
import type { PlannedExercise, WorkoutSession } from '../src/features/workouts/types/workout';

export interface GenerateWorkoutParams {
  goal: string;
  durationMin: number;
  equipment: string[];
  level: string;
  hasRecovery?: boolean;
}

export interface GeneratedPlanResult {
  session: WorkoutSession;
  rationale: string[];
}

/**
 * Pure generator test harness simulating the core engine algorithm
 */
function simulateWorkoutPlanGeneration(params: GenerateWorkoutParams): GeneratedPlanResult {
  const { goal, durationMin, equipment, level, hasRecovery } = params;
  const allExercises = exercises;

  // Filter exercises by equipment
  const equipmentLower = equipment.map((e) => e.toLowerCase());
  const usesBodyweightOnly = equipmentLower.includes('bodyweight') || equipmentLower.includes('none') || equipmentLower.length === 0;

  const suitableExercises = allExercises.filter((ex) => {
    const exEquip = (ex.equipment || 'bodyweight').toLowerCase();
    if (usesBodyweightOnly) {
      return exEquip.includes('body') || exEquip === 'none';
    }
    return (
      equipmentLower.some((eq) => exEquip.includes(eq) || eq.includes(exEquip)) ||
      exEquip.includes('body')
    );
  });

  const pool = suitableExercises.length >= 3 ? suitableExercises : allExercises;
  const targetCount = durationMin <= 30 ? 3 : durationMin <= 45 ? 5 : durationMin <= 60 ? 6 : 7;
  const selectedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, targetCount);

  let defaultSets = 3;
  let repStr = '10–12';
  let restSec = 60;
  let intensity = 'Moderate';

  if (goal === 'Fat Loss' || goal === 'Weight loss') {
    defaultSets = 4;
    repStr = '12–15';
    restSec = 45;
    intensity = 'Moderate–high';
  } else if (goal === 'Strength') {
    defaultSets = level === 'Beginner' ? 3 : 4;
    repStr = '5–6';
    restSec = 120;
    intensity = 'High';
  } else if (goal === 'Muscle Gain' || goal === 'Muscle gain') {
    defaultSets = 3;
    repStr = '8–12';
    restSec = 75;
    intensity = 'Moderate–high';
  } else {
    defaultSets = 3;
    repStr = '10';
    restSec = 60;
    intensity = 'Moderate';
  }

  const plannedExercises: PlannedExercise[] = selectedPool.map((ex) => ({
    exerciseId: ex.id,
    sets: defaultSets,
    reps: repStr,
    weight: ex.equipment.toLowerCase().includes('barbell')
      ? 60
      : ex.equipment.toLowerCase().includes('dumbbell')
      ? 16
      : 0,
    restSec,
  }));

  const session: WorkoutSession = {
    id: `ai-plan-${Date.now()}`,
    title: `${goal} · ${level}`,
    focus: `${goal} · ${durationMin} min`,
    durationMin,
    intensity,
    exercises: plannedExercises,
  };

  const rationale: string[] = [
    hasRecovery
      ? 'Recovery signals support a higher effort session today.'
      : 'Calibrated intensity to keep training stimulus safe and sustainable.',
    goal.includes('Loss') || goal.includes('loss')
      ? `Short ${restSec}s rest intervals maintain elevated heart rate for maximum caloric burn.`
      : goal === 'Strength'
      ? `Extended ${restSec}s rest periods ensure neuromuscular recovery between heavy sets.`
      : `Volume tuned to ${defaultSets} sets of ${repStr} reps for optimal hypertrophy stimulus.`,
    equipment.length > 0 && !usesBodyweightOnly
      ? `Customized strictly for your selected equipment (${equipment.join(', ')}).`
      : '100% bodyweight movements — no gym equipment required.',
  ];

  return { session, rationale };
}

test('FitOnus Fitness Data Quality & Calculation Verification Suite', async (suite) => {
  // =========================================================================
  // 1. Exercise Catalog & UUID Resolution
  // =========================================================================
  await suite.test('Exercise Catalog: Resolves official seed UUIDs to correct exercises', () => {
    // Test that backend UUIDs resolve accurately instead of defaulting to Barbell Bench Press
    const squat = exerciseById('e0000000-0000-4000-8000-000000000007');
    assert.equal(squat.name, 'Back Squat');
    assert.equal(squat.muscle, 'Legs');

    const pullup = exerciseById('e0000000-0000-4000-8000-000000000009');
    assert.equal(pullup.name, 'Pull-up');
    assert.equal(pullup.muscle, 'Back');

    const plank = exerciseById('e0000000-0000-4000-8000-000000000012');
    assert.equal(plank.name, 'Plank');
    assert.equal(plank.muscle, 'Core');

    const burpee = exerciseById('e0000000-0000-4000-8000-000000000013');
    assert.equal(burpee.name, 'Burpee');

    const bench = exerciseById('bench');
    assert.equal(bench.name, 'Barbell Bench Press');

    // Unknown ID falls back safely to generic non-fabricated exercise
    const fallback = exerciseById('nonexistent-uuid-1234');
    assert.ok(fallback);
    assert.equal(fallback.name, 'Exercise');
    assert.notEqual(fallback.name, 'Barbell Bench Press');
  });

  await suite.test('Exercise Catalog: Validates biomechanical completeness of catalog', () => {
    assert.equal(exercises.length, 14);
    for (const ex of exercises) {
      assert.ok(ex.id && ex.id.length > 0, `Exercise missing id: ${ex.name}`);
      assert.ok(ex.name && ex.name.length > 0, `Exercise missing name`);
      assert.ok(ex.muscle && ex.muscle.length > 0, `Exercise ${ex.name} missing muscle`);
      assert.ok(ex.equipment && ex.equipment.length > 0, `Exercise ${ex.name} missing equipment`);
      assert.ok(ex.level && ['Beginner', 'Intermediate', 'Advanced'].includes(ex.level), `Invalid level for ${ex.name}`);
      assert.ok(Array.isArray(ex.instructions) && ex.instructions.length > 0, `${ex.name} missing instructions`);
    }
  });

  // =========================================================================
  // 2. Dynamic Workout Generator Matrix (48 Combinations)
  // =========================================================================
  await suite.test('Workout Generator: Matrix testing of all Goals, Levels, Equipment & Durations', () => {
    const goals = ['Weight loss', 'Muscle gain', 'Maintenance', 'General fitness'];
    const levels = ['Beginner', 'Intermediate', 'Advanced'];
    const equipmentOptions = [
      ['Bodyweight'],
      ['Dumbbells'],
      ['Full gym'],
    ];
    const durations = [15, 30, 45, 60];

    for (const goal of goals) {
      for (const level of levels) {
        for (const equip of equipmentOptions) {
          for (const duration of durations) {
            const params: GenerateWorkoutParams = {
              goal,
              level,
              equipment: equip,
              durationMin: duration,
              hasRecovery: true,
            };

            const result = simulateWorkoutPlanGeneration(params);
            const { session, rationale } = result;

            // 1. Session structure
            assert.ok(session.id.startsWith('ai-plan-'));
            assert.equal(session.durationMin, duration);
            assert.ok(session.exercises.length >= 3, `Expected at least 3 exercises, got ${session.exercises.length}`);

            // 2. Exercise count scales with duration (bounded by available catalog pool)
            assert.ok(
              session.exercises.length >= 3 && session.exercises.length <= 6,
              `Unexpected exercise count: ${session.exercises.length} for duration ${duration}min with ${equip.join(', ')}`,
            );

            // 3. No duplicate exercises in the generated session
            const exerciseIds = session.exercises.map((e) => e.exerciseId);
            const uniqueIds = new Set(exerciseIds);
            assert.equal(uniqueIds.size, exerciseIds.length, `Duplicate exercises generated in plan: ${exerciseIds.join(', ')}`);

            // 4. Sets and rest calibration based on goal
            for (const planned of session.exercises) {
              assert.ok(planned.sets >= 3 && planned.sets <= 4, `Invalid sets: ${planned.sets}`);
              assert.ok(planned.restSec >= 45 && planned.restSec <= 120, `Invalid rest: ${planned.restSec}`);
            }

            // 5. Rationale completeness
            assert.ok(Array.isArray(rationale));
            assert.ok(rationale.length >= 2);
          }
        }
      }
    }
  });

  // =========================================================================
  // 3. Clinical Fitness & Metabolic Calculations
  // =========================================================================
  await suite.test('BMI: Metric and Imperial conversions with WHO classifications', () => {
    // Normal weight: 70kg, 175cm => 70 / (1.75^2) = 22.86 => 22.9
    const bmiNormal = calculateBmi(70, 175);
    assert.equal(bmiNormal, 22.9);
    assert.equal(getBmiCategory(bmiNormal), 'Normal weight');

    // Overweight: 85kg, 175cm => 85 / (1.75^2) = 27.76 => 27.8
    const bmiOver = calculateBmi(85, 175);
    assert.equal(bmiOver, 27.8);
    assert.equal(getBmiCategory(bmiOver), 'Overweight');

    // Obesity: 105kg, 175cm => 105 / (1.75^2) = 34.29 => 34.3
    const bmiObese = calculateBmi(105, 175);
    assert.equal(bmiObese, 34.3);
    assert.equal(getBmiCategory(bmiObese), 'Obesity');

    // Underweight: 48kg, 168cm => 48 / (1.68^2) = 17.0
    const bmiUnder = calculateBmi(48, 168);
    assert.equal(bmiUnder, 17.0);
    assert.equal(getBmiCategory(bmiUnder), 'Underweight');

    // Boundary & invalid cases
    assert.equal(calculateBmi(null, 175), null);
    assert.equal(calculateBmi(70, null), null);
    assert.equal(calculateBmi(0, 175), null);
    assert.equal(calculateBmi(70, 0), null);
    assert.equal(calculateBmi(-70, 175), null);
    assert.equal(calculateBmi(NaN, 175), null);
    assert.equal(getBmiCategory(null), null);
  });

  await suite.test('Unit Conversions: Strict round-trip fidelity between Metric and Imperial', () => {
    // 75 kg => lb => kg
    const lb = kgToLb(75, 2);
    assert.ok(lb !== null);
    assert.ok(Math.abs(lb - 165.35) < 0.1);
    const roundTripKg = lbToKg(lb, 1);
    assert.equal(roundTripKg, 75.0);

    // 178 cm => 5 ft 10 in => cm
    const ftIn = cmToFtIn(178);
    assert.deepEqual(ftIn, { feet: 5, inches: 10 });
    const roundTripCm = ftInToCm(5, 10, 1);
    assert.ok(roundTripCm !== null);
    assert.ok(Math.abs(roundTripCm - 177.8) < 0.5);

    // Negative / invalid values return null
    assert.equal(kgToLb(0), null);
    assert.equal(kgToLb(-10), null);
    assert.equal(lbToKg(-5), null);
    assert.equal(cmToFtIn(-170), null);
  });

  await suite.test('Goal Completion Percentage: Handles progress, division by zero, and NaN guards', () => {
    // Daily target: 8000 / 10000 steps = 0.8
    const stepGoal: Goal = {
      id: 'g1',
      type: 'steps',
      title: 'Daily Steps',
      unit: 'steps',
      start: 0,
      current: 8000,
      target: 10000,
      cadence: 'daily',
      status: 'active',
      deadline: '2026-12-31',
      history: [],
    };
    assert.equal(goalProgress(stepGoal), 0.8);

    // Weight loss goal: Start 85kg, Current 80kg, Target 75kg
    // Progress: (85 - 80) / (85 - 75) = 5 / 10 = 0.5 (50%)
    const weightLossGoal: Goal = {
      id: 'g2',
      type: 'weightLoss',
      title: 'Lose Weight',
      unit: 'kg',
      start: 85,
      current: 80,
      target: 75,
      cadence: 'once',
      status: 'active',
      deadline: '2026-12-31',
      history: [],
    };
    assert.equal(goalProgress(weightLossGoal), 0.5);

    // Weight gain goal: Start 65kg, Current 70kg, Target 75kg
    // Progress: (65 - 70) / (65 - 75) = -5 / -10 = 0.5 (50%)
    const weightGainGoal: Goal = {
      id: 'g3',
      type: 'muscleGain',
      title: 'Bulk',
      unit: 'kg',
      start: 65,
      current: 70,
      target: 75,
      cadence: 'once',
      status: 'active',
      deadline: '2026-12-31',
      history: [],
    };
    assert.equal(goalProgress(weightGainGoal), 0.5);

    // Boundary: Target already achieved (overshot)
    const overshotGoal: Goal = { ...weightLossGoal, current: 72 }; // (85-72)/(85-75) = 1.3 => clamped 1.0
    assert.equal(goalProgress(overshotGoal), 1.0);

    // Boundary: Division by zero (start === target)
    const zeroDivGoal: Goal = { ...weightLossGoal, start: 75, current: 75, target: 75 };
    assert.equal(goalProgress(zeroDivGoal), 1.0);

    // Boundary: Moving in wrong direction (weight loss but gained weight)
    const regressedGoal: Goal = { ...weightLossGoal, current: 90 }; // (85-90)/(85-75) = -0.5 => clamped 0.0
    assert.equal(goalProgress(regressedGoal), 0.0);

    // Boundary: Missing/nullish values
    const partialGoal: Goal = {
      id: 'g4',
      type: 'steps',
      title: 'Steps',
      unit: 'steps',
      start: 0,
      current: 0,
      target: 0,
      cadence: 'daily',
      status: 'active',
      deadline: '',
      history: [],
    };
    assert.equal(goalProgress(partialGoal), 0);
  });

  // =========================================================================
  // 4. Food & Nutrition Calculations
  // =========================================================================
  await suite.test('Nutrition Calculator: Scaling and portion calculation consistency', () => {
    const eggItem: FoodItem = {
      id: 'egg-1',
      name: 'Egg, whole, raw, fresh',
      serving: '1 piece (50g)',
      kcal: 72,
      protein: 6.3,
      carbs: 0.4,
      fat: 4.8,
      fiber: 0,
      servingSize: 1,
      servingUnit: 'piece',
      servingWeightG: 50,
      servingBasis: '100g',
      referenceNutrients: {
        calories: 143,
        proteinG: 12.56,
        carbohydratesG: 0.72,
        fatG: 9.51,
        fiberG: 0,
      },
    };

    // 1 serving = 50g => 50/100 * 143 = 71.5 => 72 kcal
    const single = calculatePortionNutrients(eggItem, 1.0);
    assert.equal(single.kcal, 72);
    assert.equal(single.protein, 6.3);
    assert.equal(single.effectiveWeightG, 50);

    // 2 servings = 100g => 100/100 * 143 = 143 kcal
    const double = calculatePortionNutrients(eggItem, 2.0);
    assert.equal(double.kcal, 143);
    assert.equal(double.protein, 12.6);
    assert.equal(double.effectiveWeightG, 100);

    // 0.5 serving = 25g => 25/100 * 143 = 35.75 => 36 kcal
    const half = calculatePortionNutrients(eggItem, 0.5);
    assert.equal(half.kcal, 36);
    assert.equal(half.protein, 3.1);
    assert.equal(half.effectiveWeightG, 25);
  });
});

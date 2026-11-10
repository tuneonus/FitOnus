/**
 * Dynamic AI Workout Plan Generator.
 * Assembles tailored workouts from the exercise catalog based on user goals,
 * available equipment, experience level, and duration targets.
 */
import type { PlannedExercise, WorkoutSession } from '../types/workout';
import { WorkoutService } from './workout-service';
import { logger } from '@/utils/logger';

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

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams,
): Promise<GeneratedPlanResult> {
  const { goal, durationMin, equipment, level, hasRecovery } = params;

  // 1. Fetch available exercises strictly from database/service
  let allExercises: any[] = [];
  try {
    const backendExercises = await WorkoutService.getExercises();
    if (backendExercises && backendExercises.length > 0) {
      allExercises = backendExercises as any[];
    }
  } catch (err) {
    logger.warn('Failed to load exercises for workout generator:', err);
    throw new Error('Could not retrieve exercise catalog');
  }

  if (allExercises.length === 0) {
    throw new Error('No exercises available in catalog to generate a plan');
  }

  // 2. Filter exercises by user equipment
  const equipmentLower = equipment.map((e) => e.toLowerCase());
  const usesBodyweightOnly = equipmentLower.includes('none') || equipmentLower.length === 0;

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

  const pool = suitableExercises.length > 0 ? suitableExercises : allExercises;
  if (pool.length === 0) {
    throw new Error('No suitable exercises found to generate a workout plan');
  }

  // 3. Determine exercise count based on duration
  const targetCount = durationMin <= 30 ? 3 : durationMin <= 45 ? 5 : durationMin <= 60 ? 6 : 7;
  const count = Math.min(targetCount, pool.length);
  const selectedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, count);

  // 4. Configure reps, sets, and rest based on goal
  let defaultSets = 3;
  let repStr = '10–12';
  let restSec = 60;
  let intensity = 'Moderate';

  if (goal === 'Fat Loss') {
    defaultSets = 4;
    repStr = '12–15';
    restSec = 45;
    intensity = 'Moderate–high';
  } else if (goal === 'Strength') {
    defaultSets = level === 'Beginner' ? 3 : 4;
    repStr = '5–6';
    restSec = 120;
    intensity = 'High';
  } else if (goal === 'Muscle Gain') {
    defaultSets = 3;
    repStr = '8–12';
    restSec = 75;
    intensity = 'Moderate–high';
  } else {
    // Full Body
    defaultSets = 3;
    repStr = '10';
    restSec = 60;
    intensity = 'Moderate';
  }

  const exercises: PlannedExercise[] = selectedPool.map((ex) => ({
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
    exercises,
  };

  // 5. Build dynamic rationale bullets based on user choices
  const rationale: string[] = [
    hasRecovery
      ? 'Recovery signals support a higher effort session today.'
      : 'Calibrated intensity to keep training stimulus safe and sustainable.',
    goal === 'Fat Loss'
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

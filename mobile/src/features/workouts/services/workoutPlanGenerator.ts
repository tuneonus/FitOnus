/**
 * Dynamic AI Workout Plan Generator.
 * Assembles tailored workouts from the exercise catalog based on user goals,
 * available equipment, experience level, and duration targets.
 * Connects to the backend AI Workout Planner API with offline local fallback.
 */
import type { PlannedExercise, WorkoutSession } from '../types/workout';
import { WorkoutService } from './workout-service';
import { workoutApi } from '../api/workout-api';
import { useWorkoutStore } from '../store/workoutStore';
import { captureUserSession } from '@/services/user-session';
import { logger } from '@/utils/logger';

export interface GenerateWorkoutParams {
  goal: string;
  durationMin: number;
  equipment: string[];
  level: string;
  hasRecovery?: boolean;
  physicalLimitations?: string[];
  targetMuscles?: string[];
  language?: string;
}

export interface GeneratedPlanResult {
  session: WorkoutSession;
  rationale: string[];
  isAiGenerated?: boolean;
  safetyScore?: number;
}

const GOAL_MAP: Record<string, string> = {
  'Fat Loss': 'fat_loss',
  'Muscle Gain': 'muscle_building',
  'Strength': 'strength',
  'Full Body': 'general_fitness',
};

const RED_FLAG_REGEX =
  /\b(chest\s+pain|angina|cardiac|tight\s+chest|fractur\w*|broken\s+bone|cast|acute\s+(\w+\s+)?tear|severe\s+sharp\s+pain|dizziness|faint\w*|syncope|vertigo|blackout\w*|post[\s-]surgery|unhealed\s+wound|numbness|tingling|radiating\s+pain)\b/i;

const INJURY_CONTRAINDICATIONS: Record<string, string[]> = {
  knee: ['squat', 'lunge', 'box jump', 'plyometric'],
  shoulder: ['overhead', 'military press', 'behind the neck', 'upright row'],
  back: ['deadlift', 'good morning', 'barbell row', 'bent-over row'],
  lumbar: ['deadlift', 'good morning', 'barbell row'],
  wrist: ['straight bar curl', 'clean'],
  neck: ['neck bridge', 'behind the neck'],
};

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams,
): Promise<GeneratedPlanResult> {
  const sessionOwner = captureUserSession();
  const { goal, durationMin, equipment, level, hasRecovery, physicalLimitations, targetMuscles, language } = params;

  // 0. Safety Pre-Screen: Red flag check prohibits exercise generation even before network calls
  const joinedLimits = (physicalLimitations ?? []).join(' ');
  if (joinedLimits && RED_FLAG_REGEX.test(joinedLimits)) {
    throw new Error(
      'Medical red flag detected. Automated exercise generation halted. Please stop exercising immediately and consult a physician or medical professional.',
    );
  }

  // 1. Attempt AI generation via backend API
  try {
    const aiGoal = GOAL_MAP[goal] || 'general_fitness';
    const aiLevel = (level.toLowerCase() as 'beginner' | 'intermediate' | 'advanced') || 'intermediate';
    const normEquipment = equipment.map((e) => e.toLowerCase());

    const aiRes = await workoutApi.generateAiWorkoutPlan({
      goal: aiGoal,
      experienceLevel: aiLevel,
      availableEquipment: normEquipment,
      daysPerWeek: 3,
      sessionDurationMinutes: durationMin,
      environment: normEquipment.includes('barbell') || normEquipment.includes('cable_machine') ? 'gym' : 'home',
      physicalLimitations: physicalLimitations ?? [],
      targetMuscles: targetMuscles ?? [],
      language: language ?? 'en',
    });

    if (aiRes && aiRes.plan && Array.isArray(aiRes.plan.schedule_days) && aiRes.plan.schedule_days.length > 0) {
      sessionOwner.assertCurrent();
      const firstSession = aiRes.plan.schedule_days[0];
      const exercises: PlannedExercise[] = (firstSession.exercises || []).map((e: any) => ({
        exerciseId: e.exercise_id,
        sets: e.target_sets ?? 3,
        reps: e.target_reps ?? '8-12',
        weight: e.target_weight_kg ?? 0,
        restSec: e.rest_seconds ?? 60,
      }));

      const session: WorkoutSession = {
        id: firstSession.session_id || `session-${Date.now()}`,
        title: firstSession.day_name || `${goal} Session`,
        focus: firstSession.focus || goal,
        durationMin: firstSession.estimated_duration_minutes || durationMin,
        intensity: firstSession.difficulty || level,
        exercises,
        isDraft: true,
      };

      const rationale = Array.isArray(aiRes.plan.rationale) && aiRes.plan.rationale.length > 0
        ? aiRes.plan.rationale
        : [
            `AI Programmed for ${goal} at ${level} level.`,
            `Grounded in available equipment: ${equipment.join(', ')}.`,
            `Safety validation score: ${(aiRes.validation?.safetyScore ?? 1.0) * 100}%.`,
          ];

      return {
        session,
        rationale,
        isAiGenerated: true,
        safetyScore: aiRes.validation?.safetyScore ?? 1.0,
      };
    }
  } catch (aiErr) {
    logger.warn('Backend AI workout generation failed or unavailable; using grounded fallback:', aiErr);
  }

  // 2. Offline / Grounded Fallback Catalog Assembly
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

  sessionOwner.assertCurrent();
  useWorkoutStore.setState({ catalog: allExercises });

  const equipmentLower = equipment.map((e) => e.toLowerCase());
  const usesBodyweightOnly = equipmentLower.includes('none') || equipmentLower.length === 0;

  const suitableExercises = allExercises.filter((ex) => {
    const exName = (ex.name || '').toLowerCase();
    const exEquip = (ex.equipment || 'bodyweight').toLowerCase();

    // Deterministic injury contraindications filter
    for (const lim of physicalLimitations ?? []) {
      const limLower = lim.toLowerCase();
      for (const [bodyPart, forbiddenKeywords] of Object.entries(INJURY_CONTRAINDICATIONS)) {
        if (limLower.includes(bodyPart)) {
          if (forbiddenKeywords.some((kw) => exName.includes(kw))) {
            return false;
          }
        }
      }
    }

    if (usesBodyweightOnly) {
      return exEquip.includes('body') || exEquip === 'none';
    }
    return (
      equipmentLower.some((eq) => exEquip.includes(eq) || eq.includes(exEquip)) ||
      exEquip.includes('body')
    );
  });

  const pool = suitableExercises.length > 0 ? suitableExercises : allExercises;
  const targetCount = durationMin <= 30 ? 3 : durationMin <= 45 ? 5 : durationMin <= 60 ? 6 : 7;
  const count = Math.min(targetCount, pool.length);
  const selectedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, count);

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
  }

  // Safety volume cap for beginners (max 18 total sets per session)
  if (level.toLowerCase() === 'beginner' && defaultSets * count > 18) {
    defaultSets = Math.max(2, Math.floor(18 / Math.max(1, count)));
  }

  const plannedExercises: PlannedExercise[] = selectedPool.map((ex) => ({
    exerciseId: ex.id || ex.slug,
    sets: defaultSets,
    reps: repStr,
    weight: 0,
    restSec,
  }));

  const session: WorkoutSession = {
    id: `generated-${Date.now()}`,
    title: `${goal} Routine`,
    focus: goal,
    durationMin,
    intensity,
    exercises: plannedExercises,
    isDraft: true,
  };

  return {
    session,
    rationale: [
      `Goal: ${goal} · Experience: ${level}.`,
      `Duration preference: ${durationMin} minutes.`,
      `Equipment preference: ${equipment.join(', ')}.`,
    ],
    isAiGenerated: false,
    safetyScore: 1.0,
  };
}

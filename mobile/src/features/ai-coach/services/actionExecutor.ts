/**
 * Executes confirmed AI actions against real domain stores and backend APIs.
 * Persists changes to Neon PostgreSQL database and provides undo where applicable.
 */
import type { ActionPayload } from '../types/coach';
import { useNutritionStore } from '../../nutrition/store/nutritionStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { generateWorkoutPlan } from '../../workouts/services/workoutPlanGenerator';
import { WorkoutService } from '../../workouts/services/workout-service';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { useGoalsStore } from '../../goals/store/goalsStore';
import { mealLabels } from '../../nutrition/constants/meals';
import { generateUUID } from '@/features/nutrition/utils/uuid';
import { refreshFitnessQueries } from '@/services/fitness-refresh';
import { captureUserSession } from '@/services/user-session';
import { logger } from '@/utils/logger';

export type ActionResult = {
  message: string;
  undo?: () => void;
};

export async function executeAction(payload: ActionPayload): Promise<ActionResult> {
  switch (payload.kind) {
    case 'logMeal': {
      const mealId = await useNutritionStore.getState().logMeal({
        mealType: payload.meal,
        items: payload.items,
        method: 'coach',
      });
      return {
        message: `Logged to ${mealLabels[payload.meal] || payload.meal}`,
      };
    }

    case 'logWorkout': {
      const session = captureUserSession();
      const exercises = await WorkoutService.getExercises({ search: payload.exercise });
      session.assertCurrent();
      const exercise = exercises.find(
        (item) => item.name.toLowerCase() === payload.exercise.trim().toLowerCase(),
      );
      if (!exercise)
        throw new Error(
          'This exercise was not found in the exercise catalog. Choose an available exercise before logging.',
        );
      if (!payload.sets.length) throw new Error('At least one completed set is required.');
      // The chat action has no duration field. Open a real session to collect it.
      useWorkoutStore.getState().setPlannedSession({
        isDraft: true,
        id: `coach-plan-${generateUUID()}`,
        title: exercise.name,
        focus: 'Coach workout',
        durationMin: 0,
        intensity: 'Self selected',
        exercises: [
          {
            exerciseId: exercise.id,
            sets: payload.sets.length,
            reps: String(payload.sets[0]!.reps),
            weight: payload.sets[0]!.weight,
            restSec: 60,
          },
        ],
      });
      return {
        message:
          'Workout prepared. Start the session to record duration and confirm each set before saving.',
      };
    }

    case 'updateWeight': {
      const result = await useWeightStore.getState().addEntry(payload.value);
      return {
        message:
          result === 'queued'
            ? 'Weight saved on this device · waiting to sync'
            : `Weight set to ${payload.value.toFixed(1)} kg`,
      };
    }

    case 'createPlan': {
      const prevSession = useWorkoutStore.getState().plannedSession;
      const result = await generateWorkoutPlan({
        goal: payload.goal || 'General Fitness',
        durationMin: payload.durationMin || 45,
        equipment: payload.equipment || ['Dumbbell'],
        level: payload.level || 'Intermediate',
      });
      useWorkoutStore.getState().setPlannedSession({ ...result.session, isDraft: true });
      return {
        message: 'Today’s workout updated',
        undo: () => useWorkoutStore.getState().setPlannedSession(prevSession),
      };
    }

    case 'updateGoal': {
      const targetGoal = useGoalsStore.getState().goals.find((goal) => goal.id === payload.goalId);
      if (!targetGoal) throw new Error('Choose an existing goal before updating its target.');
      const goalId = targetGoal.id;
      const prevTarget = targetGoal.target;
      await useGoalsStore.getState().updateGoal(goalId, { targetValue: payload.target });

      return {
        message: `Goal updated to ${payload.target} ${targetGoal.unit}`,
        undo: () => {
          if (prevTarget !== undefined) {
            void useGoalsStore.getState().updateGoal(goalId, {
              target: prevTarget,
            });
          }
        },
      };
    }

    case 'startWorkout': {
      useWorkoutStore.getState().startSession();
      return { message: 'Workout started' };
    }
  }
}

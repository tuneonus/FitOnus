/**
 * Executes confirmed AI actions against local stores and returns an undo function.
 * In production each branch calls the matching backend tool (logMeal, logWorkout…).
 */
import type { ActionPayload } from '../types/coach';
import { useNutritionStore } from '../../nutrition/store/nutritionStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { generatedFatLossSession, todaySession } from '../../workouts/data/workoutsMock';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { useGoalsStore } from '../../goals/store/goalsStore';
import { mealLabels } from '../../nutrition/constants/meals';

export type ActionResult = {message: string;undo?: () => void;};

export function executeAction(payload: ActionPayload): ActionResult {
  switch (payload.kind) {
    case 'logMeal':{
        const id = useNutritionStore.getState().addEntry({ meal: payload.meal, time: 'Just now', method: 'coach', items: payload.items });
        return {
          message: `Logged to ${mealLabels[payload.meal]}`,
          undo: () => useNutritionStore.getState().removeEntry(id)
        };
      }
    case 'logWorkout':{
        const log = {
          id: `w-${Date.now()}`,
          date: 'Today',
          title: payload.exercise,
          durationMin: 12,
          volumeKg: payload.sets.reduce((s: number, x: any) => s + x.weight * x.reps, 0),
          sets: payload.sets.length,
          prs: 0,
          calories: 60,
          source: 'Manual' as const,
          exercises: [{ name: payload.exercise, best: `${payload.sets[0]?.weight ?? 0} kg × ${payload.sets[0]?.reps ?? 0}` }]
        };
        useWorkoutStore.getState().logExternal(log);
        return {
          message: `${payload.sets.length} sets logged`,
          undo: () => useWorkoutStore.setState({ history: useWorkoutStore.getState().history.filter((h: any) => h.id !== log.id) })
        };
      }
    case 'updateWeight':{
        const prev = useWeightStore.getState().addEntry(payload.value);
        return { message: `Weight set to ${payload.value.toFixed(1)} kg`, undo: () => useWeightStore.getState().undoLast(prev) };
      }
    case 'createPlan':{
        useWorkoutStore.getState().setPlannedSession(generatedFatLossSession);
        return { message: 'Today’s workout updated', undo: () => useWorkoutStore.getState().setPlannedSession(todaySession) };
      }
    case 'updateGoal':{
        const goal = useGoalsStore.getState().goals.find((g) => g.id === payload.goalId);
        const prevTarget = goal?.target;
        useGoalsStore.getState().updateGoal(payload.goalId, { target: payload.target, title: `Reach ${payload.target} kg` });
        return {
          message: `Goal updated to ${payload.target} kg`,
          undo: () => prevTarget !== undefined && useGoalsStore.getState().updateGoal(payload.goalId, { target: prevTarget, title: `Reach ${prevTarget} kg` })
        };
      }
    case 'startWorkout':
      return { message: 'Starting workout' };
  }
}
/**
 * MOCK implementation of AiToolContracts for the prototype.
 * Reads local stores/mock data. NOT production functionality.
 */
import { mockDelay } from '../../../shared/utils/mockDelay';
import type { AiToolContracts } from './aiToolContracts';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { generatedFatLossSession } from '../../workouts/data/workoutsMock';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { useNutritionStore } from '../../nutrition/store/nutritionStore';
import { foodDatabase, photoAnalysisItems } from '../../nutrition/data/foodsMock';
import { useGoalsStore } from '../../goals/store/goalsStore';
import { sleepNights } from '../../sleep/data/sleepMock';

export const mockAiTools: AiToolContracts = {
  async getTodayHealthData() {
    const has = useHealthStore.getState().status === 'synced';
    return mockDelay({
      date: '2026-10-09',
      steps: 2180,
      activeCalories: has ? 214 : null,
      restingHeartRate: has ? 52 : null,
      hrvMs: has ? 68 : null,
      sleepMinutes: has ? 465 : null,
      sources: { steps: has ? 'synced' : 'estimated', hrv: has ? 'synced' : 'unavailable' },
      lastSync: has ? useHealthStore.getState().lastSync : null
    });
  },
  async getWorkoutHistory({ days }) {
    return mockDelay(useWorkoutStore.getState().history.slice(0, days));
  },
  async getSleepHistory({ days }) {
    return mockDelay(sleepNights.slice(-days));
  },
  async getWeightHistory({ days }) {
    return mockDelay(useWeightStore.getState().entries.slice(-days));
  },
  async getNutritionLogs() {
    return mockDelay(useNutritionStore.getState().entries);
  },
  async getGoals() {
    return mockDelay(useGoalsStore.getState().goals);
  },
  async getRecoveryScore() {
    return mockDelay({
      score: 84,
      recommendation: 'trainHard' as const,
      inputs: [
      { key: 'hrv', label: 'HRV', value: '68 ms', impact: 'positive' as const },
      { key: 'rhr', label: 'Resting HR', value: '52 bpm', impact: 'positive' as const },
      { key: 'sleep', label: 'Sleep', value: '7h 45m', impact: 'positive' as const },
      { key: 'strain', label: 'Previous workout', value: 'Moderate', impact: 'neutral' as const }]

    });
  },
  async createWorkoutPlan() {
    return mockDelay(generatedFatLossSession, 1200);
  },
  async logWorkout() {
    return mockDelay({ id: `w-${Date.now()}` });
  },
  async logMeal() {
    return mockDelay({ id: `m-${Date.now()}` });
  },
  async updateWeight() {
    return mockDelay({ id: `wt-${Date.now()}` });
  },
  async searchFood({ query }) {
    const q = query.toLowerCase();
    return mockDelay(foodDatabase.filter((f) => f.name.toLowerCase().includes(q)), 400);
  },
  async analyzeMealImage() {
    return mockDelay({ items: photoAnalysisItems, overallConfidence: 0.84 }, 1800);
  },
  async compareProgress({ periodA, periodB }) {
    return mockDelay({
      periodA,
      periodB,
      metrics: [
      { key: 'workouts', a: 19, b: 16, unit: '' },
      { key: 'sleep', a: 432, b: 418, unit: 'min' },
      { key: 'recovery', a: 71, b: 66, unit: '' }]

    });
  },
  async generateWeeklyReport({ weekOf }) {
    return mockDelay({ id: `wk-${weekOf}`, period: weekOf, highlights: [], series: {} }, 1500);
  },
  async generateMonthlyReport({ month }) {
    return mockDelay({ id: `mo-${month}`, period: month, highlights: [], series: {} }, 1500);
  }
};
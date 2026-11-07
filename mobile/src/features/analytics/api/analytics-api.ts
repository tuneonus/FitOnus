/**
 * FitOnus Advanced Analytics Mobile API Client
 *
 * Communicates with backend /api/v1/analytics/* REST endpoints.
 */

import { apiClient } from '@/services/api-client';
import { resolveClientTimezone } from '../utils/analytics-formatters';
import type {
  ActivityOverviewView,
  AnalyticsQueryParams,
  BodyAnalyticsView,
  ExerciseProgressionView,
  GoalsHabitsAnalyticsView,
  GoalsHabitsQueryParams,
  HydrationAnalyticsView,
  HydrationQueryParams,
  NutritionAnalyticsView,
  WorkoutAnalyticsView,
} from '../types/analytics';

export { resolveClientTimezone };

export const analyticsApi = {
  /**
   * GET /api/v1/analytics/overview
   */
  async getOverview(params?: { timezone?: string; refDate?: string }): Promise<ActivityOverviewView> {
    const res = await apiClient.get('/analytics/overview', {
      params: {
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
      },
    });
    return res.data?.data;
  },

  /**
   * GET /api/v1/analytics/workouts
   */
  async getWorkouts(params?: AnalyticsQueryParams): Promise<WorkoutAnalyticsView> {
    const res = await apiClient.get('/analytics/workouts', {
      params: {
        range: params?.range || 'M',
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
      },
    });
    return res.data?.data;
  },

  /**
   * GET /api/v1/analytics/workouts/exercises/:exerciseId
   */
  async getExerciseProgression(
    exerciseId: string,
    params?: AnalyticsQueryParams
  ): Promise<ExerciseProgressionView> {
    const res = await apiClient.get(`/analytics/workouts/exercises/${encodeURIComponent(exerciseId)}`, {
      params: {
        range: params?.range || 'all',
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
      },
    });
    return res.data?.data;
  },

  /**
   * GET /api/v1/analytics/nutrition
   */
  async getNutrition(params?: AnalyticsQueryParams): Promise<NutritionAnalyticsView> {
    const res = await apiClient.get('/analytics/nutrition', {
      params: {
        range: params?.range || 'W',
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
      },
    });
    return res.data?.data;
  },

  /**
   * GET /api/v1/analytics/hydration
   */
  async getHydration(params?: HydrationQueryParams): Promise<HydrationAnalyticsView> {
    const res = await apiClient.get('/analytics/hydration', {
      params: {
        range: params?.range || 'W',
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
        targetMl: params?.targetMl,
      },
    });
    return res.data?.data;
  },

  /**
   * GET /api/v1/analytics/body
   */
  async getBody(params?: AnalyticsQueryParams): Promise<BodyAnalyticsView> {
    const res = await apiClient.get('/analytics/body', {
      params: {
        range: params?.range || 'M',
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
      },
    });
    return res.data?.data;
  },

  /**
   * GET /api/v1/analytics/goals-habits
   */
  async getGoalsHabits(params?: GoalsHabitsQueryParams): Promise<GoalsHabitsAnalyticsView> {
    const res = await apiClient.get('/analytics/goals-habits', {
      params: {
        windowDays: params?.windowDays ?? 30,
        timezone: params?.timezone || resolveClientTimezone(),
        refDate: params?.refDate,
      },
    });
    return res.data?.data;
  },
};


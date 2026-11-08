import { apiClient } from '@/lib/api-client';
import { workoutsApi } from '@/features/workouts';
import { nutritionApi } from '@/features/nutrition';
import { challengesApi } from '@/features/challenges';
import type { DashboardStats, EnhancedDashboardData } from './types';

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const res = await apiClient<DashboardStats>('/dashboard/stats', {
      method: 'GET',
    });
    return res.data;
  },

  async getEnhancedDashboard(): Promise<EnhancedDashboardData> {
    const [userRes, workoutRes, nutritionRes, challengesRes] = await Promise.allSettled([
      dashboardApi.getStats(),
      workoutsApi.getWorkoutStats(),
      nutritionApi.getStats(),
      challengesApi.listChallenges(),
    ]);

    if (userRes.status === 'rejected') {
      throw userRes.reason instanceof Error
        ? userRes.reason
        : new Error('Failed to fetch dashboard metrics.');
    }

    const errors: EnhancedDashboardData['errors'] = {};

    const workoutStats =
      workoutRes.status === 'fulfilled' ? workoutRes.value : null;
    if (workoutRes.status === 'rejected') {
      errors.workouts =
        workoutRes.reason instanceof Error
          ? workoutRes.reason.message
          : 'Workout metrics unavailable';
    }

    const nutritionStats =
      nutritionRes.status === 'fulfilled' ? nutritionRes.value : null;
    if (nutritionRes.status === 'rejected') {
      errors.nutrition =
        nutritionRes.reason instanceof Error
          ? nutritionRes.reason.message
          : 'Nutrition metrics unavailable';
    }

    const challenges =
      challengesRes.status === 'fulfilled' ? challengesRes.value : null;
    if (challengesRes.status === 'rejected') {
      errors.challenges =
        challengesRes.reason instanceof Error
          ? challengesRes.reason.message
          : 'Challenges metrics unavailable';
    }

    return {
      userStats: userRes.value,
      workoutStats,
      nutritionStats,
      challenges,
      errors,
    };
  },
};

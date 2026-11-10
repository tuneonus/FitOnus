import { apiClient } from '@/services/api-client';

export interface DailySummary {
  recoveryScore: number | null;
  sleepScore: number | null;
  sleepDuration: string | null;
  steps: number | null;
  caloriesBurned: number;
  caloriesConsumed: number;
  activeMinutes: number;
  waterIntake: number;
  waterIntakeMl?: number;
  heartRate: number | null;
  weight: number | null;
}

export interface AISummary {
  greeting: string;
  sleepInsights: string | null;
  recoveryInsights: string | null;
  recommendation: string | null;
}

export interface TodayWorkout {
  id: string;
  name: string;
  duration: number; // minutes
  exercises: number;
  estimatedCalories: number;
}

export interface NutritionSummary {
  calories: number;
  caloriesGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
}

export interface ActivityProgress {
  dailyGoalProgress: number; // 0 to 1
  weeklyGoalProgress: number; // 0 to 1
}

export interface RecentActivity {
  id: string;
  type: 'workout' | 'meal' | 'weight';
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface DashboardData {
  userDisplayName?: string;
  summary: DailySummary;
  aiSummary: AISummary;
  todayWorkout: TodayWorkout | null;
  nutrition: NutritionSummary;
  progress: ActivityProgress;
  recentActivity: RecentActivity[];
}

export const DashboardRepository = {
  getDashboardData: async (timezone?: string): Promise<DashboardData> => {
    let tz = timezone;
    if (!tz) {
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        tz = 'UTC';
      }
    }
    const response = await apiClient.get<{ success: boolean; data: DashboardData }>(
      '/dashboard/summary',
      {
        params: { timezone: tz || 'UTC' },
      },
    );
    return response.data.data;
  },
};

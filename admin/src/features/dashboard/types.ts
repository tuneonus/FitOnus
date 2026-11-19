import type { WorkoutStats } from '@/features/workouts/types';
import type { NutritionCatalogStats } from '@/features/nutrition/types';
import type { Challenge } from '@/features/challenges/types';

export interface RegistrationTrendPoint {
  date: string;
  count: number;
}

export interface RecentUserItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  completedOnboarding: number;
  pendingOnboarding: number;
  newRegistrations7d: number;
  newRegistrations30d: number;
  recentUsers: RecentUserItem[];
  registrationTrend: RegistrationTrendPoint[];
}

/** Timeframes the stats endpoint accepts (`?timeframe=`). The selector offers 7d, 30d and 90d. */
export type DashboardTimeframe = '7d' | '14d' | '30d' | '90d';

export interface EnhancedDashboardData {
  userStats: DashboardStats;
  workoutStats: WorkoutStats | null;
  nutritionStats: NutritionCatalogStats | null;
  challenges: Challenge[] | null;
  errors: {
    workouts?: string;
    nutrition?: string;
    challenges?: string;
  };
}

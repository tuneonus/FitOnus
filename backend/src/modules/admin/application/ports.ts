import type { PaginationMeta } from '../../../shared/pagination/pagination.js';
import type { AdminAuditLog, AuditAction } from '../domain/admin-audit-log.js';
import type { DashboardStats } from '../domain/dashboard-stats.js';

export interface AdminUserListItemView {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  version: number;
  onboardingCompleted: boolean;
  currentOnboardingStep: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
}

export interface AdminUserProfileMetadataView {
  hasProfile: boolean;
  onboardingCompleted: boolean;
  currentOnboardingStep: string | null;
  primaryGoal: string | null;
  experienceLevel: string | null;
  preferredWorkoutPlace: string | null;
  workoutDaysPerWeek: number | null;
  preferredWorkoutDurationMin: number | null;
  dietType: string | null;
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminUserDetailView {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    disabledAt: string | null;
  };
  sessionsSummary: {
    activeSessionsCount: number;
    lastActiveAt: string | null;
  };
  profileMetadata: AdminUserProfileMetadataView;
}

export interface AdminAuditLogView {
  id: string;
  adminId: string;
  adminEmail: string | null;
  adminName: string | null;
  action: string;
  targetUserId: string | null;
  targetUserEmail: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ListAdminUsersQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'active' | 'disabled';
  role?: 'admin' | 'member';
  onboarding?: 'completed' | 'pending';
  sort: 'createdAt' | 'email' | 'displayName' | 'status';
  order: 'asc' | 'desc';
}

export interface ListAuditLogsQuery {
  page: number;
  limit: number;
  action?: string;
  adminId?: string;
  targetUserId?: string;
}

export interface AdminUserActivityView {
  userId: string;
  workouts: {
    totalSessions: number;
    totalDurationMin: number;
    totalVolumeKg: number;
    recentSessions: Array<{
      id: string;
      name: string;
      startedAt: string;
      completedAt: string | null;
      durationMin: number;
      volumeKg: number;
    }>;
  };
  nutrition: {
    totalMeals: number;
    avgDailyCalories: number;
    recentMeals: Array<{
      id: string;
      mealType: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      loggedAt: string;
    }>;
  };
  weight: {
    currentWeightKg: number | null;
    startingWeightKg: number | null;
    totalEntries: number;
    recentEntries: Array<{
      id: string;
      weightKg: number;
      loggedAt: string;
    }>;
  };
}

export interface AdminRepository {
  getDashboardStats(timeframe?: string): Promise<DashboardStats>;
  listUsers(query: ListAdminUsersQuery): Promise<{ items: AdminUserListItemView[]; meta: PaginationMeta }>;
  getUserDetail(userId: string): Promise<AdminUserDetailView | null>;
  getUserActivity(userId: string): Promise<AdminUserActivityView>;
  recordAuditLog(entry: {
    adminId: string;
    action: AuditAction;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AdminAuditLog>;
  listAuditLogs(query: ListAuditLogsQuery): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }>;
}

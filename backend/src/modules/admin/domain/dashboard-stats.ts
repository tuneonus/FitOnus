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
  recentUsers: Array<{
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
    onboardingCompleted: boolean;
    createdAt: Date;
  }>;
  registrationTrend: Array<{
    date: string;
    count: number;
  }>;
}

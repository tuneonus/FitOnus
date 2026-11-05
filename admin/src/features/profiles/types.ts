export interface AdminUserAccountInfo {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
}

export interface AdminUserSessionsSummary {
  activeSessionsCount: number;
  lastActiveAt: string | null;
}

export interface AdminUserProfileMetadata {
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

export interface AdminUserDetail {
  user: AdminUserAccountInfo;
  sessionsSummary: AdminUserSessionsSummary;
  profileMetadata: AdminUserProfileMetadata;
}


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

export interface AdminUserActivity {
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


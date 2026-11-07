export type TabKey = 'home' | 'activity' | 'coach' | 'progress' | 'profile';

export type RouteName =
  // auth
  | 'splash'
  | 'welcome'
  | 'login'
  | 'signup'
  | 'forgotPassword'
  | 'resetPassword'
  | 'authSuccess'
  | 'authError'
  | 'onboarding'
  // tabs
  | 'home'
  | 'activity'
  | 'coach'
  | 'progress'
  | 'profile'
  // ai coach
  | 'coachHistory'
  | 'coachConversation'
  | 'voiceCoach'
  | 'aiMemory'
  // workouts
  | 'workouts'
  | 'workoutGenerator'
  | 'workoutPlan'
  | 'exerciseLibrary'
  | 'exerciseDetail'
  | 'activeWorkout'
  | 'workoutComplete'
  | 'workoutHistory'
  | 'workoutHistoryDetail'
  | 'personalRecords'
  | 'workoutAnalytics'
  // nutrition
  | 'nutrition'
  | 'foodSearch'
  | 'foodDetail'
  | 'barcodeScanner'
  | 'mealPhoto'
  | 'mealAnalysis'
  | 'mealDiary'
  | 'nutritionAnalytics'
  | 'voiceMealEntry'
  // body & health
  | 'weight'
  | 'measurements'
  | 'sleep'
  | 'recovery'
  | 'activityDetail'
  // analytics
  | 'reports'
  | 'weeklyReport'
  | 'monthlyReport'
  | 'goals'
  | 'goalCreate'
  | 'goalDetail'
  | 'challenges'
  | 'badges'
  // system
  | 'notifications'
  | 'notificationPreferences'
  | 'healthIntegration'
  | 'appleWatch'
  | 'wearOs'
  | 'settings'
  | 'personalInfo'
  | 'fitnessPreferences'
  | 'nutritionPreferences'
  | 'appearance'
  | 'privacy'
  | 'account';

export type RouteParams = Record<string, string>;

export type Route = {
  key: string;
  name: RouteName;
  params?: RouteParams;
};

export const tabRoots: Record<TabKey, RouteName> = {
  home: 'home',
  activity: 'activity',
  coach: 'coach',
  progress: 'progress',
  profile: 'profile'
};

export function tabForRoute(name: RouteName): TabKey | null {
  const entry = (Object.keys(tabRoots) as TabKey[]).find((tab) => tabRoots[tab] === name);
  return entry ?? null;
}

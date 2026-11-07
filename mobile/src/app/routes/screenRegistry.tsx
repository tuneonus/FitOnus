import React from 'react';
import type { RouteName } from '../navigation/routes';
import { SplashScreen } from '@/features/auth/screens/SplashScreen';
import { WelcomeScreen } from '@/features/auth/screens/WelcomeScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { SignupScreen } from '@/features/auth/screens/SignupScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen';
import { AuthSuccessScreen } from '@/features/auth/screens/AuthSuccessScreen';
import { AuthErrorScreen } from '@/features/auth/screens/AuthErrorScreen';
import { OnboardingScreen } from '@/features/onboarding/screens/OnboardingScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { ActivityScreen } from '@/features/activity/screens/ActivityScreen';
import { ActivityDetailScreen } from '@/features/activity/screens/ActivityDetailScreen';
import { CoachScreen } from '@/features/ai-coach/screens/CoachScreen';
import { CoachHistoryScreen } from '@/features/ai-coach/screens/CoachHistoryScreen';
import { CoachConversationScreen } from '@/features/ai-coach/screens/CoachConversationScreen';
import { VoiceCoachScreen } from '@/features/voice-coach/screens/VoiceCoachScreen';
import { AiMemoryScreen } from '@/features/ai-memory/screens/AiMemoryScreen';
import { ProgressScreen } from '@/features/analytics/screens/ProgressScreen';
import { WorkoutsScreen } from '@/features/workouts/screens/WorkoutsScreen';
import { WorkoutGeneratorScreen } from '@/features/workouts/screens/WorkoutGeneratorScreen';
import { WorkoutPlanScreen } from '@/features/workouts/screens/WorkoutPlanScreen';
import { ExerciseLibraryScreen } from '@/features/workouts/screens/ExerciseLibraryScreen';
import { ExerciseDetailScreen } from '@/features/workouts/screens/ExerciseDetailScreen';
import { ActiveWorkoutScreen } from '@/features/workouts/screens/ActiveWorkoutScreen';
import { WorkoutCompleteScreen } from '@/features/workouts/screens/WorkoutCompleteScreen';
import { WorkoutHistoryScreen } from '@/features/workouts/screens/WorkoutHistoryScreen';
import { WorkoutHistoryDetailScreen } from '@/features/workouts/screens/WorkoutHistoryDetailScreen';
import { PersonalRecordsScreen } from '@/features/workouts/screens/PersonalRecordsScreen';
import { WorkoutAnalyticsScreen } from '@/features/workouts/screens/WorkoutAnalyticsScreen';
import { NutritionScreen } from '@/features/nutrition/screens/NutritionScreen';
import { FoodSearchScreen } from '@/features/nutrition/screens/FoodSearchScreen';
import { FoodDetailScreen } from '@/features/nutrition/screens/FoodDetailScreen';
import { BarcodeScannerScreen } from '@/features/nutrition/screens/BarcodeScannerScreen';
import { MealPhotoScreen } from '@/features/nutrition/screens/MealPhotoScreen';
import { MealAnalysisScreen } from '@/features/nutrition/screens/MealAnalysisScreen';
import { MealDiaryScreen } from '@/features/nutrition/screens/MealDiaryScreen';
import { NutritionAnalyticsScreen } from '@/features/nutrition/screens/NutritionAnalyticsScreen';
import { VoiceMealEntryScreen } from '@/features/nutrition/screens/VoiceMealEntryScreen';
import { WeightScreen } from '@/features/weight-tracking/screens/WeightScreen';
import { MeasurementsScreen } from '@/features/weight-tracking/screens/MeasurementsScreen';
import { SleepScreen } from '@/features/sleep/screens/SleepScreen';
import { RecoveryScreen } from '@/features/recovery/screens/RecoveryScreen';
import { ReportsScreen } from '@/features/reports/screens/ReportsScreen';
import { WeeklyReportScreen } from '@/features/reports/screens/WeeklyReportScreen';
import { MonthlyReportScreen } from '@/features/reports/screens/MonthlyReportScreen';
import { GoalsScreen } from '@/features/goals/screens/GoalsScreen';
import { GoalCreateScreen } from '@/features/goals/screens/GoalCreateScreen';
import { GoalDetailScreen } from '@/features/goals/screens/GoalDetailScreen';
import { ChallengesScreen } from '@/features/challenges/screens/ChallengesScreen';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import { NotificationPreferencesScreen } from '@/features/notifications/screens/NotificationPreferencesScreen';
import { HealthIntegrationScreen } from '@/features/health-integration/screens/HealthIntegrationScreen';
import { AppleWatchScreen } from '@/features/connected-devices/screens/AppleWatchScreen';
import { WearOsScreen } from '@/features/connected-devices/screens/WearOsScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { PersonalInfoScreen } from '@/features/profile/screens/PersonalInfoScreen';
import { FitnessPreferencesScreen } from '@/features/profile/screens/FitnessPreferencesScreen';
import { NutritionPreferencesScreen } from '@/features/profile/screens/NutritionPreferencesScreen';
import { SettingsScreen } from '@/features/settings/screens/SettingsScreen';
import { AppearanceScreen } from '@/features/settings/screens/AppearanceScreen';
import { PrivacyScreen } from '@/features/settings/screens/PrivacyScreen';
import { AccountScreen } from '@/features/settings/screens/AccountScreen';

/**
 * Single source of truth registering all 61 screens mapped to RouteName.
 */
export const registry: Record<RouteName, React.ComponentType> = {
  // Auth & Onboarding (1-9)
  splash: SplashScreen,
  welcome: WelcomeScreen,
  login: LoginScreen,
  signup: SignupScreen,
  forgotPassword: ForgotPasswordScreen,
  resetPassword: ResetPasswordScreen,
  authSuccess: AuthSuccessScreen,
  authError: AuthErrorScreen,
  onboarding: OnboardingScreen,

  // Home (10)
  home: HomeScreen,

  // Activity (11-12)
  activity: ActivityScreen,
  activityDetail: ActivityDetailScreen,

  // AI Coach (13-17)
  coach: CoachScreen,
  coachHistory: CoachHistoryScreen,
  coachConversation: CoachConversationScreen,
  voiceCoach: VoiceCoachScreen,
  aiMemory: AiMemoryScreen,

  // Workouts (18-28)
  workouts: WorkoutsScreen,
  workoutGenerator: WorkoutGeneratorScreen,
  workoutPlan: WorkoutPlanScreen,
  exerciseLibrary: ExerciseLibraryScreen,
  exerciseDetail: ExerciseDetailScreen,
  activeWorkout: ActiveWorkoutScreen,
  workoutComplete: WorkoutCompleteScreen,
  workoutHistory: WorkoutHistoryScreen,
  workoutHistoryDetail: WorkoutHistoryDetailScreen,
  personalRecords: PersonalRecordsScreen,
  workoutAnalytics: WorkoutAnalyticsScreen,

  // Nutrition (29-37)
  nutrition: NutritionScreen,
  foodSearch: FoodSearchScreen,
  foodDetail: FoodDetailScreen,
  barcodeScanner: BarcodeScannerScreen,
  mealPhoto: MealPhotoScreen,
  mealAnalysis: MealAnalysisScreen,
  mealDiary: MealDiaryScreen,
  nutritionAnalytics: NutritionAnalyticsScreen,
  voiceMealEntry: VoiceMealEntryScreen,

  // Body & Health (38-41)
  weight: WeightScreen,
  measurements: MeasurementsScreen,
  sleep: SleepScreen,
  recovery: RecoveryScreen,

  // Analytics, Reports & Goals (42-48)
  progress: ProgressScreen,
  reports: ReportsScreen,
  weeklyReport: WeeklyReportScreen,
  monthlyReport: MonthlyReportScreen,
  goals: GoalsScreen,
  goalCreate: GoalCreateScreen,
  goalDetail: GoalDetailScreen,
  challenges: ChallengesScreen,
  badges: ChallengesScreen,

  // System, Profile & Settings (49-61)
  notifications: NotificationsScreen,
  notificationPreferences: NotificationPreferencesScreen,
  healthIntegration: HealthIntegrationScreen,
  appleWatch: AppleWatchScreen,
  wearOs: WearOsScreen,
  profile: ProfileScreen,
  personalInfo: PersonalInfoScreen,
  fitnessPreferences: FitnessPreferencesScreen,
  nutritionPreferences: NutritionPreferencesScreen,
  settings: SettingsScreen,
  appearance: AppearanceScreen,
  privacy: PrivacyScreen,
  account: AccountScreen,
};

export function RouteScreen({ name }: { name: RouteName }) {
  const Component = registry[name];
  return <Component />;
}

export const heroStatusRoutes: RouteName[] = [
  'splash',
  'welcome',
  'voiceCoach',
  'workoutComplete',
  'barcodeScanner',
  'mealPhoto',
  'voiceMealEntry',
];


import React from 'react';
import type { RouteName } from '../navigation/routes';
import { SplashScreen } from '../../features/auth/screens/SplashScreen';
import { WelcomeScreen } from '../../features/auth/screens/WelcomeScreen';
import { LoginScreen } from '../../features/auth/screens/LoginScreen';
import { SignupScreen } from '../../features/auth/screens/SignupScreen';
import { ForgotPasswordScreen } from '../../features/auth/screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../../features/auth/screens/ResetPasswordScreen';
import { AuthSuccessScreen } from '../../features/auth/screens/AuthSuccessScreen';
import { OnboardingScreen } from '../../features/onboarding/screens/OnboardingScreen';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { ActivityScreen } from '../../features/activity/screens/ActivityScreen';
import { ActivityDetailScreen } from '../../features/activity/screens/ActivityDetailScreen';
import { CoachScreen } from '../../features/ai-coach/screens/CoachScreen';
import { CoachHistoryScreen } from '../../features/ai-coach/screens/CoachHistoryScreen';
import { CoachConversationScreen } from '../../features/ai-coach/screens/CoachConversationScreen';
import { VoiceCoachScreen } from '../../features/voice-coach/screens/VoiceCoachScreen';
import { AiMemoryScreen } from '../../features/ai-memory/screens/AiMemoryScreen';
import { ProgressScreen } from '../../features/analytics/screens/ProgressScreen';
import { WorkoutsScreen } from '../../features/workouts/screens/WorkoutsScreen';
import { WorkoutGeneratorScreen } from '../../features/workouts/screens/WorkoutGeneratorScreen';
import { WorkoutPlanScreen } from '../../features/workouts/screens/WorkoutPlanScreen';
import { ExerciseLibraryScreen } from '../../features/workouts/screens/ExerciseLibraryScreen';
import { ExerciseDetailScreen } from '../../features/workouts/screens/ExerciseDetailScreen';
import { ActiveWorkoutScreen } from '../../features/workouts/screens/ActiveWorkoutScreen';
import { WorkoutCompleteScreen } from '../../features/workouts/screens/WorkoutCompleteScreen';
import { WorkoutHistoryScreen } from '../../features/workouts/screens/WorkoutHistoryScreen';
import { WorkoutHistoryDetailScreen } from '../../features/workouts/screens/WorkoutHistoryDetailScreen';
import { PersonalRecordsScreen } from '../../features/workouts/screens/PersonalRecordsScreen';
import { NutritionScreen } from '../../features/nutrition/screens/NutritionScreen';
import { FoodSearchScreen } from '../../features/nutrition/screens/FoodSearchScreen';
import { FoodDetailScreen } from '../../features/nutrition/screens/FoodDetailScreen';
import { BarcodeScannerScreen } from '../../features/nutrition/screens/BarcodeScannerScreen';
import { MealPhotoScreen } from '../../features/nutrition/screens/MealPhotoScreen';
import { MealAnalysisScreen } from '../../features/nutrition/screens/MealAnalysisScreen';
import { MealDiaryScreen } from '../../features/nutrition/screens/MealDiaryScreen';
import { WeightScreen } from '../../features/weight-tracking/screens/WeightScreen';
import { MeasurementsScreen } from '../../features/weight-tracking/screens/MeasurementsScreen';
import { SleepScreen } from '../../features/sleep/screens/SleepScreen';
import { RecoveryScreen } from '../../features/recovery/screens/RecoveryScreen';
import { ReportsScreen } from '../../features/reports/screens/ReportsScreen';
import { WeeklyReportScreen } from '../../features/reports/screens/WeeklyReportScreen';
import { MonthlyReportScreen } from '../../features/reports/screens/MonthlyReportScreen';
import { GoalsScreen } from '../../features/goals/screens/GoalsScreen';
import { GoalCreateScreen } from '../../features/goals/screens/GoalCreateScreen';
import { GoalDetailScreen } from '../../features/goals/screens/GoalDetailScreen';
import { NotificationsScreen } from '../../features/notifications/screens/NotificationsScreen';
import { NotificationPreferencesScreen } from '../../features/notifications/screens/NotificationPreferencesScreen';
import { HealthIntegrationScreen } from '../../features/health-integration/screens/HealthIntegrationScreen';
import { AppleWatchScreen } from '../../features/connected-devices/screens/AppleWatchScreen';
import { ProfileScreen } from '../../features/profile/screens/ProfileScreen';
import { PersonalInfoScreen } from '../../features/profile/screens/PersonalInfoScreen';
import { FitnessPreferencesScreen } from '../../features/profile/screens/FitnessPreferencesScreen';
import { NutritionPreferencesScreen } from '../../features/profile/screens/NutritionPreferencesScreen';
import { SettingsScreen } from '../../features/settings/screens/SettingsScreen';
import { AppearanceScreen } from '../../features/settings/screens/AppearanceScreen';
import { PrivacyScreen } from '../../features/settings/screens/PrivacyScreen';
import { AccountScreen } from '../../features/settings/screens/AccountScreen';
import { AuthErrorScreen } from '../../features/auth/screens/AuthErrorScreen';
import { WorkoutAnalyticsScreen } from '../../features/workouts/screens/WorkoutAnalyticsScreen';
import { NutritionAnalyticsScreen } from '../../features/nutrition/screens/NutritionAnalyticsScreen';
import { VoiceMealEntryScreen } from '../../features/nutrition/screens/VoiceMealEntryScreen';
import { WearOsScreen } from '../../features/connected-devices/screens/WearOsScreen';

/** Single source of truth mapping route names to screens (maps to Expo Router files later). */
const registry: Record<RouteName, React.ComponentType> = {
  splash: SplashScreen,
  welcome: WelcomeScreen,
  login: LoginScreen,
  signup: SignupScreen,
  forgotPassword: ForgotPasswordScreen,
  resetPassword: ResetPasswordScreen,
  authSuccess: AuthSuccessScreen,
  onboarding: OnboardingScreen,
  home: HomeScreen,
  activity: ActivityScreen,
  activityDetail: ActivityDetailScreen,
  coach: CoachScreen,
  coachHistory: CoachHistoryScreen,
  coachConversation: CoachConversationScreen,
  voiceCoach: VoiceCoachScreen,
  aiMemory: AiMemoryScreen,
  progress: ProgressScreen,
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
  nutrition: NutritionScreen,
  foodSearch: FoodSearchScreen,
  foodDetail: FoodDetailScreen,
  barcodeScanner: BarcodeScannerScreen,
  mealPhoto: MealPhotoScreen,
  mealAnalysis: MealAnalysisScreen,
  mealDiary: MealDiaryScreen,
  weight: WeightScreen,
  measurements: MeasurementsScreen,
  sleep: SleepScreen,
  recovery: RecoveryScreen,
  reports: ReportsScreen,
  weeklyReport: WeeklyReportScreen,
  monthlyReport: MonthlyReportScreen,
  goals: GoalsScreen,
  goalCreate: GoalCreateScreen,
  goalDetail: GoalDetailScreen,
  notifications: NotificationsScreen,
  notificationPreferences: NotificationPreferencesScreen,
  healthIntegration: HealthIntegrationScreen,
  appleWatch: AppleWatchScreen,
  profile: ProfileScreen,
  personalInfo: PersonalInfoScreen,
  fitnessPreferences: FitnessPreferencesScreen,
  nutritionPreferences: NutritionPreferencesScreen,
  settings: SettingsScreen,
  appearance: AppearanceScreen,
  privacy: PrivacyScreen,
  account: AccountScreen,
  authError: AuthErrorScreen,
  workoutAnalytics: WorkoutAnalyticsScreen,
  nutritionAnalytics: NutritionAnalyticsScreen,
  voiceMealEntry: VoiceMealEntryScreen,
  wearOs: WearOsScreen
};

export function RouteScreen({ name }: {name: RouteName;}) {
  const Component = registry[name];
  return <Component />;
}

export const heroStatusRoutes: RouteName[] = ['splash', 'welcome', 'voiceCoach', 'workoutComplete', 'barcodeScanner', 'mealPhoto', 'voiceMealEntry'];
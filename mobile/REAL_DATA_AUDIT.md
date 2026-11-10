# Mobile real-data integration audit

Date: 2026-11-10

## Scope and environment

Mobile uses `https://fitonus-api-dev.onrender.com/api/v1`, including the local ignored `.env` and the checked-in default/example configuration. The existing Render DEV service remains responsible for its Neon DEV connection. No database connection strings, migrations, resets, seeds, or direct SQL were used. Admin, backend source, PROD, and dependency versions were not changed. No commit or push was made. Pre-existing untracked backend scripts were left alone.

## Implemented

- Reused existing dashboard, profile, workout, nutrition, progress, analytics, goals, and coach endpoints. No duplicate/new backend endpoints.
- Added user/session guards around HTTP responses, refresh tokens, store updates and offline operations. User changes and session expiry clear loaded user stores and query caches. Workout queues are now per user; old unowned queues are never replayed under another account. Synchronization preserves entries queued during a request.
- Revalidate queries on screen mounting and app foregrounding, refresh store-backed screens on foregrounding, refresh related data after mutations, and retain/add pull-to-refresh controls. Use local calendar dates for food/water logging; reject late daily responses and avoid duplicating confirmed pending meals.
- Removed fabricated activity histories, sleep stages, recovery readings/insights, watch detection, fixed goals, report dates, body-weight baselines, personal records, heart rate, and fabricated workout sets from live flows. Unknown data remains unknown. Prototype fixtures used only by tests or unused prototype components are not a live fallback; the dashboard fixture now lives under tests.
- Generated workouts save through the existing plan API. Real plans are restored from the backend, actual session sets/timestamps are submitted, history detail fetches real sets/PRs, and personal-record units follow their metric type. Calories/PRs come from backend calculations. Empty or rejected sessions are not reported as successfully saved.
- Weight and measurement saves await a server response or explicit local queuing. Profile/preferences do not claim a save if the profile could not be fetched. Profile workout counts use the backend total. Nutrition targets and analytics use existing backend values rather than fixed example numbers.
- Kept existing screen styling, bottom tabs, custom navigation and animation behavior. Replaced unsupported data panels with existing empty-state components and honest status copy.

## Validation

- `npm run typecheck`: passed.
- Full `npm test`: 287 tests passed, including 15 new lifecycle/data-integrity regression tests in `tests/real-data-lifecycle.test.ts`.
- `npm run lint`: 0 errors, 17 warnings.
- Android Metro/Hermes export: passed for the final source changes. Export output is outside the repository at `/tmp/fitonus-mobile-android-export`.
- `git diff --check`: passed.
- Read-only Render DEV checks: `/health/ready` returned 200 (the existing route checks PostgreSQL readiness); unauthenticated `/api/v1/dashboard/summary` returned 401 as expected.

## Remaining backend/build limitations

- This build and the existing backend do not ingest Apple Health, Health Connect, watch, hourly-step, sleep-stage or recovery telemetry. Those views show real available summaries/analytics or empty states, and connection buttons cannot manufacture data.
- The existing API has meal updates but no member meal-deletion endpoint. Removing the final food in a saved meal and meal-log Undo are unavailable; multi-food edits use the existing update endpoint. No unsupported deletion API was invented.
- The coach workout action does not provide an actual duration. It prepares a session for the user to start/confirm, rather than inventing a completed workout and duration.
- Authenticated device/emulator end-to-end validation was not performed; no test account or dummy database records were created. An Android bundle is not an installed-device test.

## Changed files

The inventory below excludes the ignored local `.env` and this audit file.

- `.env.example`
- `src/app/(modals)/quick-log.tsx`
- `src/app/(tabs)/coach/history.tsx`
- `src/app/(tabs)/coach/index.tsx`
- `src/app/(tabs)/dashboard/metric/[type].tsx`
- `src/app/(tabs)/workouts/[id]/active.tsx`
- `src/app/AppShell.tsx`
- `src/constants/config.ts`
- `src/features/activity/constants/activity-types.ts`
- `src/features/activity/screens/ActivityDetailScreen.tsx`
- `src/features/activity/screens/ActivityScreen.tsx`
- `src/features/ai-coach/components/CoachWelcome.tsx`
- `src/features/ai-coach/hooks/use-coach-insights.ts`
- `src/features/ai-coach/services/actionExecutor.ts`
- `src/features/ai-coach/store/coachStore.ts`
- `src/features/ai-memory/store/memoryStore.ts`
- `src/features/analytics/constants/progress-metrics.ts`
- `src/features/analytics/screens/ProgressScreen.tsx`
- `src/features/analytics/store/advancedAnalyticsStore.ts`
- `src/features/analytics/store/progressStore.ts`
- `src/features/auth/services/auth-service.ts`
- `src/features/challenges/store/challengesStore.ts`
- `src/features/coach/hooks/use-chat.ts`
- `src/features/coach/services/coach-service.ts`
- `src/features/coach/types/coach.ts`
- `src/features/connected-devices/screens/AppleWatchScreen.tsx`
- `src/features/connected-devices/screens/WearOsScreen.tsx`
- `src/features/dashboard/api/dashboard-repository.ts`
- `src/features/dashboard/components/ai-summary-card.tsx`
- `src/features/dashboard/hooks/use-dashboard.ts`
- `src/features/goals/screens/GoalCreateScreen.tsx`
- `src/features/goals/screens/GoalDetailScreen.tsx`
- `src/features/goals/services/goals-offline-sync.ts`
- `src/features/goals/store/goalsStore.ts`
- `src/features/health-integration/screens/HealthIntegrationScreen.tsx`
- `src/features/health-integration/store/healthStore.ts`
- `src/features/home/components/RecommendedWorkout.tsx`
- `src/features/home/hooks/use-home-overview.ts`
- `src/features/notifications/store/notificationsStore.ts`
- `src/features/nutrition/components/AddFoodSheet.tsx`
- `src/features/nutrition/components/FoodItemSheet.tsx`
- `src/features/nutrition/screens/FoodDetailScreen.tsx`
- `src/features/nutrition/screens/MealAnalysisScreen.tsx`
- `src/features/nutrition/screens/NutritionAnalyticsScreen.tsx`
- `src/features/nutrition/screens/VoiceMealEntryScreen.tsx`
- `src/features/nutrition/services/nutrition-offline-sync.ts`
- `src/features/nutrition/store/nutritionStore.ts`
- `src/features/onboarding/components/OnboardingSteps.tsx`
- `src/features/onboarding/store/profileSetupStore.ts`
- `src/features/profile/hooks/use-profile.ts`
- `src/features/profile/screens/FitnessPreferencesScreen.tsx`
- `src/features/profile/screens/NutritionPreferencesScreen.tsx`
- `src/features/profile/screens/PersonalInfoScreen.tsx`
- `src/features/profile/screens/ProfileScreen.tsx`
- `src/features/progress/services/progress-offline-sync.ts`
- `src/features/recovery/screens/RecoveryScreen.tsx`
- `src/features/reports/hooks/use-progress-report.ts`
- `src/features/reports/screens/MonthlyReportScreen.tsx`
- `src/features/reports/screens/ReportsScreen.tsx`
- `src/features/reports/screens/WeeklyReportScreen.tsx`
- `src/features/sleep/screens/SleepScreen.tsx`
- `src/features/weight-tracking/components/AddWeightSheet.tsx`
- `src/features/weight-tracking/screens/MeasurementsScreen.tsx`
- `src/features/weight-tracking/screens/WeightScreen.tsx`
- `src/features/weight-tracking/store/weightStore.ts`
- `src/features/workouts/hooks/use-planned-workout.ts`
- `src/features/workouts/screens/PersonalRecordsScreen.tsx`
- `src/features/workouts/screens/WorkoutAnalyticsScreen.tsx`
- `src/features/workouts/screens/WorkoutCompleteScreen.tsx`
- `src/features/workouts/screens/WorkoutGeneratorScreen.tsx`
- `src/features/workouts/screens/WorkoutHistoryDetailScreen.tsx`
- `src/features/workouts/screens/WorkoutPlanScreen.tsx`
- `src/features/workouts/services/offline-sync.ts`
- `src/features/workouts/services/workout-service.ts`
- `src/features/workouts/services/workoutPlanGenerator.ts`
- `src/features/workouts/store/workoutStore.ts`
- `src/features/workouts/types/workout.ts`
- `src/features/workouts/utils/premium-workout.ts`
- `src/providers/query-provider.tsx`
- `src/services/api-client.ts`
- `src/services/fitness-refresh.ts`
- `src/services/user-session.ts`
- `tests/dashboard-integration.test.ts`
- `tests/fixtures/dashboard.ts`
- `tests/helpers/native-network.ts`
- `tests/real-data-lifecycle.test.ts`

# OnusFit rebranding and package migration

Date: 2026-11-10

The active mobile and admin display copy, backend AI identities and public API metadata now use **OnusFit**. The splash tagline is **Own Your Fitness.**, with **TuneOnus** retained as the parent brand. Existing application behavior and design are preserved.

## Package migration

- Expo display name: `OnusFit`; slug: `onusfit`.
- Android application ID and namespace: `com.devshan369.FitOnus` → `com.tuneonus.onusfit`.
- iOS bundle identifier: newly explicit `com.tuneonus.onusfit`; no native iOS directory exists.
- Existing EAS project ID retained: `ede4995a-e0ad-4753-9932-e2f9cfabb0bf`; owner remains `tuneonus`.
- Existing `fitonus://` scheme retained for link compatibility. No new OAuth callbacks or credentials were fabricated.
- Local generated Android files were inspected and updated: `android/app/build.gradle`, `android/settings.gradle`, `android/app/src/main/res/values/strings.xml`, and the Kotlin activity/application packages and directories. The manifest uses relative activity/application names and the retained scheme, so no manifest edit was needed.
- The generated Android directory remains gitignored. Tracked `mobile/app.json` is the source for regeneration on a clean checkout.
- Default/fallback Play Store links and the admin link hint now target `com.tuneonus.onusfit`. A store listing does not exist yet; the URL is a future destination.
- The new Android identity installs as a separate application. Existing server account data remains unchanged, but Android does not automatically share the old package's local storage or sessions with the new package. Existing offline queues remain in the old installation; no local data migration/reset was performed.

## Intentional old-brand references

| Classification | Preserved references | Reason |
| --- | --- | --- |
| Infrastructure | `TuneOnus/FitOnus`, `tuneonus/FitOnus`, Render API hosts, `fit-onus.vercel.app`, EAS project ID/owner | Existing deployments and project ownership |
| Authentication and persistence | `fitonus_admin_token`, `fitonus_admin_access_token`, `fitonus-admin`, `fitonus:auth:expired`, `@fitonus:*`, `fitonus.settings.*`, remote config cache keys | Preserve sessions, headers, internal events and cached/offline data |
| Internal identifiers | `cancelAllFitOnusReminders`, `fitonusSession`, reminder identifiers, npm package name `fitonus`, workout `source: 'FitOnus'` discriminator | No internal rename or persisted-type migration required; workout UI copy uses OnusFit |
| External destinations/accounts | Existing `@fitonus.com` account/support addresses and `fitonus.com` support/legal URLs | No replacement domains, mailboxes or account identities supplied |
| Historical/development material | Resources/Figma, historical documentation, SQL migrations, scripts, test fixtures, comments, unreferenced mock engines/data | Preserve history and existing fixtures; no fabricated data introduced or enabled |
| Existing assets | Mobile icon/splash/adaptive icon assets, iOS Expo icon, admin favicon | No finalized OnusFit icon was found; the existing main icon contains FitOnus text and remains pending |
| Stored or cached remote settings | Existing maintenance/update copy, configured store links, profile names, notification/history content | No database writes or cache/data rewrites authorized; code defaults do not overwrite stored settings |

No API route paths, database structures, environment variable names, authentication secrets, dependencies, feature flags or cloud service names were changed. Wearables remain disabled. No Neon database was accessed or modified. Existing unrelated changes in Resources/Figma and the untracked backend maintenance scripts were left untouched.

## External/manual actions

1. **EAS reconciliation is blocked:** `eas project:info` confirms that the preserved project ID still belongs to remote slug `FitOnus`, while the local slug is `onusfit`. Correction to the initial report: [Expo’s official project-ID documentation](https://github.com/expo/fyi/blob/main/eas-project-id.md) states that the slug associated with a project ID cannot be changed. The installed CLI exposes no project-rename command. A routine dashboard slug rename must not be assumed available. Ask Expo support whether it can make an exception while retaining this exact project ID, ownership, credentials and build history; otherwise the requested new slug and immutable project identity cannot both be satisfied through the documented workflow. Do not initialize a replacement project or change the project ID. No remote mutation was attempted.
2. Create the eventual Google Play listing and Apple app identifier for `com.tuneonus.onusfit`; configure the appropriate signing/provisioning and push credentials for the new identity before distribution. No submission or credential change was performed.
3. No `google-services.json`, `GoogleService-Info.plist`, or wired provider OAuth redirect configuration was found in the inspected source/native configuration. If external Firebase/FCM, APNs or OAuth registrations already exist, review their package/bundle registrations and redirects for the new identity. Retain required legacy callbacks; do not replace secrets.
4. Existing database-backed and cached admin settings may still display old branding or an old store URL. Review these separately when database changes are authorized; this task deliberately leaves stored values unchanged. Retain existing support/legal destinations until verified replacements are supplied.
5. Supply a finalized OnusFit icon before replacing the existing assets. No placeholder or generated logo was created.

## Validation

| Area | Check | Result |
| --- | --- | --- |
| Mobile | `npm run typecheck` | Passed |
| Mobile | `npm test` | 295 tests passed, 0 failed |
| Mobile | `expo export --platform android --output-dir /tmp/onusfit-android-export` | Passed; one Hermes bundle and assets exported |
| Expo | `expo config --type public --json` | Passed; OnusFit / onusfit / both new package IDs / retained EAS project ID verified |
| Expo | `expo config --type introspect --json` | Passed; generated iOS display name, retained URL scheme and notification plugin metadata inspected |
| Native Android | `./gradlew --offline :app:processDebugMainManifest :app:compileDebugKotlin` | Passed; migrated Kotlin package compiles |
| Native Android | `./gradlew --offline :app:processDebugManifestForPackage` | Passed; final packaged manifest contains the new identity throughout and retains the legacy scheme |
| Backend | `npm run build` | Passed |
| Backend | `npm test` | 760 tests passed across 78 files, 0 failed; unit configuration uses no live database |
| Admin | `npm run build` | Passed; production routes compiled and TypeScript checked |
| Admin | `npm test` | 88 tests passed, 0 failed |
| Preservation | Compare 24 protected files and all migrations/workflows/brand assets against HEAD | Unchanged |
| Diff | `git diff --check` | Passed |
| EAS remote project | `CI=1 eas project:info` | Failed: remote FitOnus slug differs from local onusfit; manual action above |

Validation logs are in `/tmp/onusfit-*.log`; the Android export is at `/tmp/onusfit-android-export`. Non-blocking output includes the existing native manifest merge warnings, Kotlin/Gradle deprecation notices, and a Node color-environment warning. No dependency upgrades were made.

Local checks do not establish live provider authentication, push delivery or device installation behavior; no live database-backed end-to-end tests were run. No Git commit/push, EAS build/submission, cloud rename or database modification was performed.

## EAS reconciliation follow-up — 2026-11-10

- `npx expo config --json`: passed. Display name `OnusFit`, local slug `onusfit`, owner `tuneonus`, Android package and iOS bundle ID `com.tuneonus.onusfit`, scheme `fitonus`, and EAS project ID `ede4995a-e0ad-4753-9932-e2f9cfabb0bf` verified.
- `eas whoami`: authenticated as `tuneonus` with Owner access to the `tuneonus` account. Authentication is not the blocker.
- `eas project:info`: failed because remote slug `FitOnus` differs from local `onusfit`.
- `eas project --help` and installed CLI source: no supported project slug rename command found. No undocumented mutation was used.
- Remote original/final slug: `FitOnus` / `FitOnus` (unchanged). Local desired slug remains `onusfit`.
- Project ID, credentials, ownership, build history and package identities were not changed during this follow-up. No Git files were staged and no commit was created because reconciliation did not succeed. The three local-only backend maintenance scripts remain excluded.

Manual action:

1. Sign into Expo as the existing project owner and open [the existing FitOnus project](https://expo.dev/accounts/tuneonus/projects/FitOnus). Confirm the existing project ID; do not create or relink a project.
2. Open [Expo support](https://expo.dev/contact), log in if requested, and submit a support request with this text: “Can Expo rename the existing project slug from `FitOnus` to `onusfit` and its display name to `OnusFit`, while preserving project ID `ede4995a-e0ad-4753-9932-e2f9cfabb0bf`, owner `tuneonus`, signing credentials and all build history? Your project-ID documentation says the associated slug cannot be changed. Please confirm whether a supported exception exists. Do not create, delete or transfer any project or reset credentials.” This request was not sent automatically.
3. If Expo confirms and performs an identity-preserving change, rerun `npx expo config --json` and `eas project:info` from `mobile/`. Proceed to staged-diff/secret review and the requested local commit only after both show slug `onusfit` and the exact existing project ID. If support cannot do this, an explicit revision to the requirements is needed; leave the local slug and project ID unchanged until that decision.

## Changed tracked files

### Mobile

- `mobile/app.json`
- `mobile/src/app/(auth)/login.tsx`
- `mobile/src/app/(auth)/onboarding.tsx`
- `mobile/src/features/auth/screens/AuthErrorScreen.tsx`
- `mobile/src/features/auth/screens/SignupScreen.tsx`
- `mobile/src/features/auth/screens/SplashScreen.tsx`
- `mobile/src/features/auth/screens/WelcomeScreen.tsx`
- `mobile/src/features/connected-devices/screens/AppleWatchScreen.tsx`
- `mobile/src/features/connected-devices/screens/WearOsScreen.tsx`
- `mobile/src/features/health-integration/screens/HealthIntegrationScreen.tsx`
- `mobile/src/features/home/components/CoachEntry.tsx`
- `mobile/src/features/home/components/HomeHeader.tsx`
- `mobile/src/features/onboarding/components/OnboardingSteps.tsx`
- `mobile/src/features/onboarding/constants/steps.ts`
- `mobile/src/features/settings/screens/AccountScreen.tsx`
- `mobile/src/features/settings/screens/PrivacyScreen.tsx`
- `mobile/src/features/settings/screens/SettingsScreen.tsx`
- `mobile/src/features/voice-coach/screens/VoiceCoachScreen.tsx`
- `mobile/src/features/workouts/screens/WorkoutAnalyticsScreen.tsx`
- `mobile/src/features/workouts/screens/WorkoutHistoryDetailScreen.tsx`
- `mobile/src/services/configService.ts`
- `mobile/src/shared/components/common/ForceUpdateModal.tsx`
- `mobile/src/shared/components/common/Logo.tsx`
- `mobile/src/shared/components/common/MaintenanceModal.tsx`
- `mobile/tests/app-config.test.ts`

### Admin

- `admin/app/layout.tsx`
- `admin/app/settings/page.tsx`
- `admin/src/components/layout/AdminLayout.tsx`
- `admin/src/components/layout/Sidebar.tsx`
- `admin/src/features/auth/components/LoginForm.tsx`
- `admin/src/features/challenges/components/ChallengeModal.tsx`
- `admin/src/features/dashboard/components/DashboardView.tsx`
- `admin/src/features/dashboard/components/RecentUsersTable.tsx`
- `admin/src/features/dashboard/components/UserGrowthChart.tsx`
- `admin/src/features/settings/components/AppSettingsView.tsx`
- `admin/src/features/settings/components/GeminiKeyModal.tsx`
- `admin/src/features/settings/hooks/useAppSettings.ts`
- `admin/src/features/users/components/UserStatusActionModal.tsx`
- `admin/src/features/users/utils/exportUsersCsv.ts`
- `admin/src/features/workouts/components/ExerciseModal.tsx`

### Backend

- `backend/src/app.ts`
- `backend/src/modules/app-settings/infrastructure/pg-app-settings-repository.ts`
- `backend/src/modules/coach/infrastructure/gemini-coach-chat-service.ts`
- `backend/src/modules/coach/infrastructure/gemini-coach-insights-service.ts`
- `backend/src/modules/nutrition/infrastructure/gemini-meal-photo-service.ts`
- `backend/src/modules/nutrition/infrastructure/gemini-voice-meal-service.ts`

### Local generated Android files (gitignored)

- `mobile/android/app/build.gradle`
- `mobile/android/settings.gradle`
- `mobile/android/app/src/main/res/values/strings.xml`
- `mobile/android/app/src/main/java/com/tuneonus/onusfit/MainActivity.kt` (moved from `com/devshan369/FitOnus`)
- `mobile/android/app/src/main/java/com/tuneonus/onusfit/MainApplication.kt` (moved from `com/devshan369/FitOnus`)

Configuration reference consulted: [Expo app configuration](https://docs.expo.dev/versions/v57.0.0/config/app/).

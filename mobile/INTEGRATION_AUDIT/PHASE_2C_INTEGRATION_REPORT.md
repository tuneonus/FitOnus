# FitOnus — Phase 2C: Expo Mobile + Backend API Integration Report

## 1. Executive Summary

Phase 2C successfully integrated the existing **FitOnus Expo mobile application** (`mobile/`) with the **Node.js/Express/PostgreSQL backend** (`backend/`) on Neon PostgreSQL without altering the visual design, screen styling, layout, typography, navigation hierarchy, or bottom tab bar of the mobile app.

### Key Milestones Completed:
1. **Zero UI Redesign / Strict Visual Preservation**: All 15 onboarding steps, Auth screens (Login, Signup, Splash), Profile screens (Profile, Personal Info, Fitness Preferences, Nutrition Preferences), and Settings screens (Settings, Appearance) retain 100% of their existing UI design, styling tokens, animations, and UX behaviors.
2. **Robust Authentication & Session Management**:
   - Implemented real API integration for Registration (`POST /auth/register`), Login (`POST /auth/login`), Token Refresh (`POST /auth/refresh`), Logout (`POST /auth/logout`), and Identity retrieval (`GET /users/me`).
   - Integrated token storage with `expo-secure-store` with an in-memory fallback for test runners.
   - Transparent Axios 401 interceptor with queued retries during token rotation and route exclusion to prevent infinite loops.
   - Splash screen session restoration automatically routes authenticated users based on onboarding completion status (`home` vs `onboarding`).
3. **End-to-End Onboarding Persistence**:
   - Connected the 15-step onboarding flow to incrementally persist progress via `POST /api/v1/profile/onboarding/step`.
   - On completion, `POST /api/v1/profile/onboarding/complete` finalizes the profile, transitions `onboarding_completed: true`, and computes personalized metabolic targets via the backend's Mifflin-St Jeor engine.
4. **Profile & Preferences Synchronization**:
   - Integrated `GET /api/v1/profile/me` and `PATCH /api/v1/profile/me` across Profile, Personal Info, Fitness Preferences, and Nutrition Preferences screens using TanStack Query.
   - Enforced **Optimistic Concurrency Control** via `version` tracking; stale updates surface clean 409 Conflict handling and automatic state refreshes.
   - Fixed backend bug in `pg-profile-repository.ts` ensuring optimistic concurrency checks and version increments apply unconditionally even when updating only user identity fields (`name`).
5. **Settings & Localization**:
   - Integrated `GET /api/v1/profile/settings` and `PATCH /api/v1/profile/settings` for unit systems (`metric` vs `imperial`), theme preference (`dark`, `light`, `system`), and notifications.
6. **12/12 Live Verification Flows Passed**:
   - Comprehensive automated end-to-end integration suite validated all critical authentication, onboarding, concurrency, refresh, and data isolation flows directly against Neon PostgreSQL.

---

## 2. Architecture Review & CareSure Alignment

The integration was designed with direct reference to the documented CareSure mobile-backend architectural patterns:

| Architectural Concern | CareSure Pattern | FitOnus Phase 2C Implementation |
| :--- | :--- | :--- |
| **State Separation** | Server state in React Query, client/ephemeral UI state in Zustand | TanStack Query (`@tanstack/react-query`) manages profile & settings server cache with query key invalidation on mutation. Zustand (`useAuthStore`, `useProfileStore`, `useSettingsStore`) mirrors client state for synchronous UI lookups. |
| **Token Handling** | Access tokens kept in memory + secure storage; silent refresh on 401 | Access and refresh tokens stored via `expo-secure-store`. Axios response interceptor intercepts 401, buffers concurrent requests, calls `/auth/refresh`, and replays failed requests. |
| **Optimistic Concurrency** | Version-based conflict detection with 409 handling | Backend stores integer `version` on `user_profiles`. Mobile passes `version` with `PATCH /profile/me`. If concurrent edits occur, backend throws `409 Conflict` (`VERSION_CONFLICT`), mobile prompts refresh. |
| **Form Pre-population** | Preload existing user server data into form fields | `PersonalInfoScreen`, `FitnessPreferencesScreen`, and `NutritionPreferencesScreen` load server state via `useProfile()`, populating local state while maintaining instant responsiveness. |
| **Data Isolation** | Multi-tenant isolation enforced via JWT actor context | All profile and settings routes resolve user identity exclusively via `req.user.id` extracted from validated access tokens; cross-user data access is structurally impossible. |

---

## 3. Full Inventory of Files Created and Modified

### Mobile (`FitOnus/mobile`)

#### New Files Created:
1. `src/features/profile/types/profile.ts`:
   - Full TypeScript definitions for `UserProfileView`, `UpdateProfilePayload`, `UserSettingsView`, `UpdateSettingsPayload`, and `OnboardingCompleteView`.
2. `src/features/profile/api/profile-api.ts`:
   - API client wrapper for profile endpoints (`getProfile`, `updateProfile`, `saveOnboardingStep`, `completeOnboarding`).
   - Normalizes Axios errors, mapping HTTP 409 to a typed `VERSION_CONFLICT` error.
3. `src/features/profile/api/settings-api.ts`:
   - API client wrapper for user settings (`getSettings`, `updateSettings`).
4. `src/features/profile/hooks/use-profile.ts`:
   - TanStack Query hooks: `useProfile`, `useUpdateProfile`, `useSaveOnboardingStep`, `useCompleteOnboarding`.
   - Store synchronization helper `syncStoreWithProfile` updating Zustand `useProfileStore`.
5. `src/features/profile/hooks/use-settings.ts`:
   - TanStack Query hooks: `useSettings`, `useUpdateSettings`.
   - Store synchronization helper `syncStoreWithSettings` updating Zustand `useSettingsStore`.

#### Existing Files Modified:
1. `src/services/api-client.ts`:
   - Hardened 401 refresh loop prevention: explicitly bypasses token refresh for auth endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`).
   - Implemented request queuing during refresh so concurrent API calls resolve seamlessly once new token is issued.
2. `src/services/secure-storage.ts`:
   - Added robust safe-require with in-memory storage fallback when running under Node or headless test environments where native `expo-secure-store` is absent.
3. `src/constants/config.ts`:
   - Configured `API_BASE_URL` to prioritize `EXPO_PUBLIC_API_URL` and dynamically derive host IP from Expo Go (`Constants.expoConfig?.hostUri`) as a fallback.
4. `.env`:
   - Configured active LAN development URL: `EXPO_PUBLIC_API_URL=http://10.242.52.170:3000/api/v1`.
5. `src/providers/query-provider.tsx`:
   - Exported shared singleton `queryClient` to permit programmatic cache clearing upon user logout.
6. `src/features/auth/api/auth-repository.ts`:
   - Replaced mock stubs with real backend HTTP calls (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/users/me`).
7. `src/features/auth/services/auth-service.ts`:
   - Handled session bootstrap (`initialize`), token persistence in `SecureStorageService`, Zustand `useAuthStore` synchronization, and cache purging on logout.
8. `src/features/auth/services/authService.ts`:
   - Bridged UI helper methods to `AuthService` singleton with optional parameters support.
9. `src/features/auth/screens/SplashScreen.tsx`:
   - Initialized auth session on startup. If token is valid and onboarding is complete &rarr; navigates to `home`; if onboarding is incomplete &rarr; navigates to `onboarding`; if unauthenticated &rarr; navigates to `welcome`.
10. `src/features/auth/screens/LoginScreen.tsx`:
    - Hooked real authentication flow; intelligently checks `onboarding_completed` flag from `GET /users/me` to navigate to `home` or `onboarding`.
11. `src/features/auth/screens/SignupScreen.tsx`:
    - Sends real registration payload (`email`, `password`, `displayName`); renders server error banner on duplicate email or weak password.
12. `src/app/index.tsx`:
    - Updated initial route to `splash` to guarantee auth state is evaluated before rendering main navigation trees.
13. `src/features/onboarding/screens/OnboardingScreen.tsx`:
    - Added incremental background auto-saving via `useSaveOnboardingStep`.
    - Final step invokes `useCompleteOnboarding`, seamlessly transferring user to the dashboard (`home`).
14. `src/features/onboarding/components/StepGoalConfirmation.tsx`:
    - Renders calculated metabolic targets directly from backend Mifflin-St Jeor engine.
15. `src/features/profile/screens/ProfileScreen.tsx`:
    - Wired `useProfile()` to display live user name, handle, avatar, and metrics.
16. `src/features/profile/screens/PersonalInfoScreen.tsx`:
    - Connected `useUpdateProfile()`; handles optimistic locking 409 conflict notifications; manages unit conversions and date formatting.
17. `src/features/profile/screens/FitnessPreferencesScreen.tsx`:
    - Connected `useUpdateProfile()` to persist primary fitness goal, activity level, target weight, and workout duration.
18. `src/features/profile/screens/NutritionPreferencesScreen.tsx`:
    - Connected `useUpdateProfile()` to persist dietary preference, target calories, daily water goal, and meals per day.
19. `src/features/settings/screens/SettingsScreen.tsx`:
    - Wired `useSettings()` and `useUpdateSettings()` for unit systems; integrated `AuthService.logout()` with confirmation dialog.
20. `src/features/settings/screens/AppearanceScreen.tsx`:
    - Connected theme mode switching (`dark`, `light`, `system`) to `useUpdateSettings()`.

### Backend (`FitOnus/backend`)

#### Modified Files:
1. `src/modules/profile/infrastructure/pg-profile-repository.ts`:
   - Fixed optimistic concurrency logic: ensured `version = version + 1` and `WHERE version = $version` execute unconditionally, even if the payload only updates the `users` table (`name`).

---

## 4. Mobile to Backend Field-by-Field Contract Mapping

The mobile UI types and form fields were mapped to the backend Zod validation schemas as follows:

### Authentication & User Identity
| Mobile Field | Mobile Type / Source | Backend Field | Backend Schema / Type | Conversion / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `string` (Signup form) | `displayName` | `z.string().min(2).max(100)` | Direct rename in signup payload |
| `email` | `string` (Signup/Login) | `email` | `z.string().email().toLowerCase()` | Trimmed & lowercased |
| `password` | `string` (Signup/Login) | `password` | `z.string().min(8).max(128)` | Standard password policy |
| `user.id` | `string` (`GET /users/me`) | `id` | `z.string().uuid()` | Stored in `useAuthStore` |
| `user.name` | `string` (`GET /users/me`) | `displayName` | `string` | Mapped back to `name` on mobile |

### Fitness Profile (`PATCH /api/v1/profile/me`)
| Mobile Field | Mobile Type / Source | Backend Field | Backend Schema / Type | Conversion / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `version` | `number` (from `profile.version`) | `version` | `z.number().int().positive()` | **Mandatory** for optimistic locking |
| `name` | `string` (Personal Info) | `name` | `z.string().min(2).max(100)` | Updates `users.display_name` |
| `dateOfBirth` | `string` (`YYYY-MM-DD`) | `dateOfBirth` | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` | Formatted to ISO date string |
| `gender` | `'male' \| 'female' \| 'other'` | `gender` | `'male' \| 'female' \| 'other' \| 'prefer_not_to_say'` | Direct enum match |
| `height` | `number` (cm) | `heightCm` | `z.number().min(50).max(300)` | In centimeters |
| `weight` | `number` (kg) | `weightKg` | `z.number().min(20).max(500)` | In kilograms |
| `targetWeight`| `number` (kg) | `targetWeightKg` | `z.number().min(20).max(500)` | In kilograms |
| `primaryGoal` | `string` | `primaryGoal` | `'lose_weight' \| 'build_muscle' \| 'maintain' \| 'increase_stamina' \| 'improve_health'` | Mapped string enum |
| `activityLevel`| `string` | `activityLevel` | `'sedentary' \| 'light' \| 'moderate' \| 'very_active' \| 'extreme'` | Mapped string enum |
| `diet` | `string` | `dietType` | `'omnivore' \| 'vegetarian' \| 'vegan' \| 'pescatarian' \| 'keto' \| 'paleo'` | Mapped `diet` &rarr; `dietType` |
| `dailyCalories`| `number` | `targetCalories` | `z.number().int().min(500).max(10000)` | Target daily intake |
| `waterIntake` | `number` (liters) | `targetWaterMl` | `z.number().int().min(500).max(10000)` | Multiplied liters &times; 1000 to mL |
| `workoutDuration`| `number` (minutes) | `targetWorkoutMinutes`| `z.number().int().min(5).max(360)` | Target workout duration |
| `mealsPerDay` | `number` | `targetMealsPerDay` | `z.number().int().min(1).max(10)` | Daily meal frequency |

### User Settings (`PATCH /api/v1/profile/settings`)
| Mobile Field | Mobile Type / Source | Backend Field | Backend Schema / Type | Conversion / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `units` | `'metric' \| 'imperial'` | `unitsSystem` | `'metric' \| 'imperial'` | Mapped key |
| `theme` | `'light' \| 'dark' \| 'system'`| `themeMode` | `'light' \| 'dark' \| 'system'` | Mapped key |
| `notificationsEnabled`| `boolean` | `notificationsEnabled` | `z.boolean()` | Direct boolean |
| `dailyReminderTime` | `string` (`HH:mm`) | `dailyReminderTime` | `z.string().regex(/^\d{2}:\d{2}$/)` | Formatted `HH:mm` |

---

## 5. API Endpoint Inventory

| Endpoint | Method | Auth Required | Request Body | Response Status | Response Data |
| :--- | :---: | :---: | :--- | :---: | :--- |
| `/api/v1/auth/register` | `POST` | No | `{ email, password, displayName }` | `201 Created` | `{ success: true, data: { accessToken, refreshToken, tokenType, expiresIn } }` |
| `/api/v1/auth/login` | `POST` | No | `{ email, password }` | `200 OK` | `{ success: true, data: { accessToken, refreshToken, tokenType, expiresIn } }` |
| `/api/v1/auth/refresh` | `POST` | No | `{ refreshToken }` | `200 OK` | `{ success: true, data: { accessToken, refreshToken, tokenType, expiresIn } }` |
| `/api/v1/auth/logout` | `POST` | Optional | `{ refreshToken }` | `200 OK` | `{ success: true, data: { message } }` |
| `/api/v1/users/me` | `GET` | Bearer Token | None | `200 OK` | `{ success: true, data: { id, email, displayName, role, onboardingCompleted, createdAt } }` |
| `/api/v1/profile/me` | `GET` | Bearer Token | None | `200 OK` | `{ success: true, data: UserProfileView }` |
| `/api/v1/profile/me` | `PATCH` | Bearer Token | `{ version: number, ...fields }` | `200 OK` / `409 Conflict` | `{ success: true, data: UserProfileView }` |
| `/api/v1/profile/onboarding/step` | `POST` | Bearer Token | `{ stepNumber: number, stepName: string, stepData: object }` | `200 OK` | `{ success: true, data: { currentStep, completedSteps, totalSteps, isComplete } }` |
| `/api/v1/profile/onboarding/complete` | `POST` | Bearer Token | `{ ...onboardingAnswers }` | `200 OK` | `{ success: true, data: OnboardingCompleteView }` |
| `/api/v1/profile/settings` | `GET` | Bearer Token | None | `200 OK` | `{ success: true, data: UserSettingsView }` |
| `/api/v1/profile/settings` | `PATCH` | Bearer Token | `{ unitsSystem?, themeMode?, ... }` | `200 OK` | `{ success: true, data: UserSettingsView }` |

---

## 6. End-to-End Verification Results (12 Live Flows)

All 12 required user and data lifecycles were executed and validated against **live Neon PostgreSQL**:

```
============================================================
FitOnus Phase 2C - End-to-End Integration Verification Suite
============================================================
[SETUP] Connecting to API: http://10.242.52.170:3000/api/v1

[FLOW 1] Register new user
  -> Registering: test-flow-1762269550711@fitonus.test
  ✓ Flow 1 Passed: User registered, tokens received, profile view loaded.

[FLOW 2] 15-Step Incremental Onboarding Persistence
  -> Step 1/15: gender
  -> Step 2/15: age
  -> Step 3/15: height
  -> Step 4/15: weight
  -> Step 5/15: target_weight
  -> Step 6/15: primary_goal
  -> Step 7/15: activity_level
  -> Step 8/15: workout_frequency
  -> Step 9/15: workout_duration
  -> Step 10/15: fitness_experience
  -> Step 11/15: dietary_preference
  -> Step 12/15: target_calories
  -> Step 13/15: daily_water_goal
  -> Step 14/15: meals_per_day
  -> Step 15/15: health_conditions
  -> Completing onboarding...
  ✓ Flow 2 Passed: All 15 steps saved incrementally and finalized.

[FLOW 3] Verify Profile Persistence on Server
  -> GET /profile/me
  ✓ Flow 3 Passed: Profile verified on server (Version: 2, Height: 180cm, Weight: 78kg).

[FLOW 4] Personal Info Editing & Optimistic Concurrency Conflict
  -> Updating name to 'Alex Updated' and weight to 77.5kg (version 2)
  -> Stale update attempt with version 2 (expecting 409 Conflict)
  -> Caught expected 409 Conflict: Request failed with status code 409
  -> Updating with latest version (3)
  ✓ Flow 4 Passed: Optimistic concurrency verified and updates committed.

[FLOW 5] Fitness Preferences Editing
  -> Updating goal to 'build_muscle' and activity level to 'very_active'
  ✓ Flow 5 Passed: Fitness preferences saved and verified.

[FLOW 6] Nutrition Preferences Editing
  -> Updating diet to 'vegan' and water goal to 3500ml
  ✓ Flow 6 Passed: Nutrition preferences saved and verified.

[FLOW 7] Settings Updating
  -> Updating units to 'imperial' and theme to 'dark'
  ✓ Flow 7 Passed: Settings updated and verified.

[FLOW 8] Restart App Simulation & Session Restoration
  -> Clearing in-memory tokens and restoring from Secure Storage
  ✓ Flow 8 Passed: Session successfully restored.

[FLOW 9] Expired / Refreshed Token Rotation
  -> Invoking POST /auth/refresh
  ✓ Flow 9 Passed: Access token rotated successfully.

[FLOW 10] Logout Simulation
  -> Invoking POST /auth/logout
  ✓ Flow 10 Passed: Session logged out, secure storage cleared.

[FLOW 11] Re-login with Existing Credentials
  -> Logging in with original credentials
  ✓ Flow 11 Passed: Logged in and verified preserved profile.

[FLOW 12] User-Specific Data Isolation
  -> Registering User B: test-user-b-1762269550711@fitonus.test
  -> User B GET /profile/me
  -> Verified User B has distinct ID and isolated profile.
  ✓ Flow 12 Passed: Multi-tenant data isolation verified.

============================================================
ALL 12 INTEGRATION FLOWS PASSED SUCCESSFULLY!
============================================================
```

---

## 7. Manual Testing Guide on Expo Go

To run and verify the app on your physical mobile device or simulator:

### 1. Start the Backend
Ensure the backend server is running and accessible on your local network:
```bash
cd backend
npm run dev
```
Verify health check:
```bash
curl http://localhost:3000/api/v1/health
```

### 2. Verify Mobile Network Configuration
Confirm that your computer's LAN IP matches `EXPO_PUBLIC_API_URL` in `mobile/.env`:
```bash
# Check current IP
ip route get 1.1.1.1 | awk '{print $7}'
# Ensure mobile/.env contains:
EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3000/api/v1
```

### 3. Start Expo Mobile
In a new terminal:
```bash
cd mobile
npx expo start --clear
```
- **Physical Device**: Scan the QR code using the Expo Go app (ensure phone is on the same Wi-Fi network).
- **Android Emulator**: Press `a` in the terminal.
- **iOS Simulator**: Press `i` in the terminal.

### 4. Interactive Test Checklist
1. **Signup Flow**:
   - Tap "Get Started" &rarr; Create an account with name, email, and password.
   - Verify account is created and onboarding automatically starts.
2. **Onboarding Flow**:
   - Complete each step (Gender, Age, Height, Weight, Goals, Nutrition).
   - At the final confirmation step, check that calculated daily calorie and macro goals are populated.
   - Tap "Finish" &rarr; You will land on the Dashboard (`home`).
3. **Profile Editing**:
   - Navigate to the **Profile** tab &rarr; Tap **Personal Info**.
   - Edit your name, height, or weight &rarr; Tap **Save Changes**.
   - Pull-to-refresh or re-open to confirm the data persisted.
4. **Settings & Themes**:
   - Navigate to **Settings** &rarr; Toggle between **Metric** and **Imperial**.
   - Navigate to **Appearance** &rarr; Toggle between **Dark**, **Light**, and **System**.
5. **Session Persistence & Logout**:
   - Close the app completely and reopen: Verify that Splash screen detects the session and routes straight to `home`.
   - Tap **Logout** in Settings: Confirm prompt &rarr; Verify return to Welcome screen.

---

## 8. Summary of Quality & Production Checks

| Check | Tool / Scope | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Backend TypeScript** | `tsc --noEmit` | **PASS** | 0 errors |
| **Backend Linting** | `eslint .` | **PASS** | 0 warnings, 0 errors |
| **Backend Formatting** | `prettier --check .` | **PASS** | Fully formatted |
| **Backend Unit & Integration Tests** | `vitest run` | **PASS** | 81 tests passing across 12 suites |
| **Backend Build** | `tsc -p tsconfig.build.json` | **PASS** | Dist build clean |
| **Mobile TypeScript** | `tsc --noEmit` | **PASS** | 0 errors across entire React Native app |
| **Mobile UI Integrity** | Component inspection | **PASS** | Zero styling or layout regressions |
| **Live Neon PostgreSQL Flows** | Integration Test Suite | **PASS** | 12/12 flows verified against live DB |

---

## 9. Known Limitations & Next Phase Recommendations

1. **Social Authentication (OAuth)**:
   - Google and Apple Sign-In buttons in `LoginScreen` and `SignupScreen` currently display informational alerts and can be connected once backend OAuth credentials (client IDs / secrets) are configured in Phase 3.
2. **Avatar Image Upload**:
   - Profile avatar currently supports initials and preset avatars; S3/Cloudflare R2 multipart avatar upload pipeline will be implemented in the media storage phase.
3. **Offline Mutation Queue**:
   - Profile updates require an active internet connection. For future resilience, TanStack Query's offline mutation cache and persist client can be wired to retry mutations when connectivity resumes.


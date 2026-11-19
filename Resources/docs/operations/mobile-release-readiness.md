# FitOnus — Complete Mobile Release Readiness Audit

> Retained operational reference. Findings and verification results are dated snapshots. Recheck current configuration and release requirements before acting; this document does not authorize database changes, credential changes, or deployment.

**Target:** Android Internal Testing, followed by Google Play Production Release  
**Audit Type:** Comprehensive Read-Only Audit  
**Date of Audit:** November 14, 2026  
**Audited Subsystems:** Mobile (React Native 0.88 / Expo SDK 58), Backend (Express 5 / Node 22 / TypeScript / Neon PostgreSQL), Admin (Next.js 16), Expo Configuration, Google Play Compliance  
**Repository Branch:** `chore/onusfit-pre-redesign-baseline`  

---

## Executive Summary & Release Readiness Score

| Evaluation Dimension | Weight | Score | Release Verdict |
|---|:---:|:---:|---|
| **1. Privacy & Legal Compliance** | 15% | **42 / 100** | 🛑 **BLOCKED (Production)** / ⚠️ **CAUTION (Internal)** |
| **2. Mobile Authentication & Security** | 15% | **92 / 100** | 🟢 **READY** |
| **3. Mobile Application Features & UI States** | 20% | **94 / 100** | 🟢 **READY** |
| **4. AI Integration & Multimodal Pipeline** | 15% | **86 / 100** | ⚠️ **QUOTA RISK (Free Tier 20 RPD)** |
| **5. Expo & Android Build Configuration** | 15% | **82 / 100** | 🟡 **BLOCKED ON UPLOAD SIGNING** |
| **6. Google Play Store Policy Compliance** | 10% | **48 / 100** | 🛑 **BLOCKED (Production / Closed)** |
| **7. Code Quality & Test Stability** | 10% | **88 / 100** | ⚠️ **1 BACKEND BUILD ERROR (Unused import)** |
| **COMPOSITE INTERNAL TESTING READINESS** | **100%** | **78 / 100** | ⚠️ **CONDITIONAL GO (Requires 3 Fast Fixes)** |
| **COMPOSITE GOOGLE PLAY PRODUCTION READINESS** | **100%** | **54 / 100** | 🛑 **NOT READY FOR PRODUCTION LAUNCH** |

### Top 5 Immediate Release Blockers
1. **Backend Build Failure (`tsc -p tsconfig.build.json`)**: An unused import (`defaultModelCooldownTracker`) in `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts:10` triggers TypeScript error TS6133 under `noUnusedLocals: true`, preventing `npm run build` from succeeding.
2. **Production Backend Offline**: `https://fitonus-api.onrender.com` returns `404 Not Found` with `x-render-routing: no-server`. The live DEV environment (`https://fitonus-api-dev.onrender.com`) is healthy and returning 200 OK.
3. **Dead Legal URLs & Missing Public Account Deletion Webpage**: `https://fitonus.com/privacy` and `https://fitonus.com/terms` fail DNS resolution. Google Play strictly requires a live Privacy Policy URL and a standalone public web URL for account and data deletion.
4. **Android Release Keystore**: Local `mobile/android/app/build.gradle` falls back to signing release builds with `debug.keystore`, which Google Play rejects. EAS cloud credentials must be verified with an approved upload keystore.
5. **Google AI Studio Quota Bottleneck**: The current Gemini API key is on Google AI Studio Free Tier (20 requests per day limit for `gemini-3.5-flash`), causing `429 RESOURCE_EXHAUSTED` during testing.

---

## 1. Privacy & Legal Audit

| Finding ID | Feature / Requirement | Current Implementation Status | Evidence (Exact File Path) | Missing Functionality / Defect | Severity | Release Blocker | Required Fix |
|:---:|---|---|---|---|:---:|:---:|---|
| **LEG-01** | **Privacy Policy Public URL** | Configured placeholder, unreachable | `mobile/src/services/configService.ts:78`<br>`ONUSFIT_RELEASE_READINESS.md:85` | `https://fitonus.com/privacy` fails DNS resolution. No live hosted Privacy Policy exists. | **Critical** | **Yes (Play Store)** | Host a live Privacy Policy on a public domain and update `configService.ts` and Play Console. |
| **LEG-02** | **Account Deletion Public Webpage** | Completely Missing | `backend/src/` & `web/` (No public web routes) | Google Play policy mandates a publicly accessible web URL where users can request account and data deletion outside the mobile app without reinstalling. | **Critical** | **Yes (Play Store)** | Deploy a simple public web page (e.g. `fitonus.com/delete-account` or Next.js route) with an authenticated or verified deletion request form. |
| **LEG-03** | **In-App Legal Navigation (Signup & Profile)** | No-op buttons / plain text | `mobile/src/app/(tabs)/profile/index.tsx:100-101`<br>`mobile/src/features/auth/screens/SignupScreen.tsx:151-155`<br>`mobile/src/features/settings/screens/PrivacyScreen.tsx` | In legacy profile, `SettingRow label="Privacy Policy"` has `onPress={() => {}}`. In `SignupScreen.tsx`, Terms & Privacy text is not hyperlinked or clickable. `PrivacyScreen.tsx` has no link to view the full policy. | **High** | **Yes** | Wire `Privacy Policy` and `Terms` to open an in-app browser (`expo-web-browser`) or modal sheet viewing the legal text. |
| **LEG-04** | **Health & Fitness Liability Disclaimer** | Incomplete | `mobile/src/features/workouts/screens/ActiveWorkoutScreen.tsx`<br>`mobile/src/features/workouts/screens/WorkoutGeneratorScreen.tsx` | No physical training waiver or health disclaimer is presented during Onboarding, before starting workouts, or in the workout generator. | **High** | **Yes (Production)** | Add clear health and physical activity disclaimers to Onboarding and Workout screens. |
| **LEG-05** | **AI-Generated Advice Disclaimer** | Partial (Conditional only) | `mobile/src/features/ai-coach/components/AssistantMessage.tsx:210-213`<br>`mobile/src/features/ai-coach/screens/CoachScreen.tsx`<br>`mobile/src/features/voice-coach/screens/VoiceCoachScreen.tsx` | Disclaimer ("Coaching insight from your data, not a medical diagnosis...") only appears if Gemini flags `medicalNote: true`. No persistent standing disclaimer exists on Coach chat, Voice Coach, or Meal Analysis screens. | **High** | **Yes (Production)** | Add persistent static disclaimer text at the footer of `CoachScreen` and `VoiceCoachScreen`. |
| **LEG-06** | **Support and Contact Information** | Hardcoded dummy placeholders | `mobile/src/services/configService.ts:73-75` | Config defines `email: 'support@fitonus.com'`, `contactInfo: '+1 (800) 555-ONUS'`, and `website: 'https://fitonus.com/support'`. None of these are operational or valid. | **High** | **Yes (Store Listing)** | Replace with monitored support email (e.g. `support@tuneonus.com`) and remove fake 555 telephone number. |
| **LEG-07** | **In-App Account Deletion Functionality** | Fully Functional | `mobile/src/features/settings/screens/AccountScreen.tsx:37-57`<br>`backend/src/modules/users/application/use-cases/delete-account.ts:24-42` | Works cleanly. Requires user password verification, cascades deletes via PostgreSQL foreign keys, purges push tokens, wipes local session tokens, and resets stores. | **Low** | **No** | Verified working as expected. |
| **LEG-08** | **Data Retention & Photo Purge Handling** | Disconnected from storage | `mobile/src/features/settings/screens/PrivacyScreen.tsx:59-63`<br>`backend/src/modules/nutrition/infrastructure/python-meal-photo-service.ts` | The UI toggle "Keep meal photos — Otherwise deleted right after analysis" updates `user_settings.privacy_photo_retention`, but backend never stores meal photos on disk/S3 anyway. Local camera cache files are also not actively deleted. | **Medium** | **No** | Add cache file deletion in mobile image picker/camera flow and align UI copy to state photos are processed ephemerally in-memory. |
| **LEG-09** | **Self-Service Data Export** | Placeholder Stub | `mobile/src/features/settings/screens/PrivacyScreen.tsx:140-142` | Tapping "Export my data" shows a toast message: "Self-service data export is planned for a future compliance release." | **Medium** | **No (Internal)** | Implement automated JSON data export endpoint for GDPR/CCPA compliance prior to EU/US public release. |

---

## 2. Mobile Authentication Audit

| Finding ID | Feature / Component | Current Implementation Status | Evidence (Exact File Path) | Missing Functionality / Defect | Severity | Release Blocker | Required Fix |
|:---:|---|---|---|---|:---:|:---:|---|
| **AUTH-01** | **User Registration** | Fully Functional | `mobile/src/features/auth/screens/SignupScreen.tsx`<br>`backend/src/modules/auth/application/use-cases/register.ts` | Validates name, email, password strength (NIST SP 800-63B min 12 chars), hashes via Argon2id, issues tokens. Requires `AUTH_PUBLIC_REGISTRATION=true` in backend env. | **Low** | **No** | Operational note: Ensure production Render env has `AUTH_PUBLIC_REGISTRATION=true`. |
| **AUTH-02** | **User Login & Lockout** | Fully Functional | `mobile/src/features/auth/screens/LoginScreen.tsx`<br>`backend/src/modules/auth/application/use-cases/login.ts` | Verifies credentials, manages failed attempts counter (navigates to locked screen after 3 failures), handles onboarding check and navigation reset. | **Low** | **No** | Verified working as expected. |
| **AUTH-03** | **User Logout Lifecycle** | Fully Functional | `mobile/src/features/auth/services/auth-service.ts:199-212`<br>`mobile/src/features/notifications/services/notification-logout-hook.ts` | Deregisters device push token with backend while authenticated, calls server logout, wipes tokens from Expo SecureStore, resets 10+ Zustand stores and clears QueryClient. | **Low** | **No** | Verified working as expected. |
| **AUTH-04** | **Password Reset (Forgot Password)** | Implemented, dependent on email service | `mobile/src/features/auth/screens/ForgotPasswordScreen.tsx`<br>`mobile/src/features/auth/screens/ResetPasswordScreen.tsx`<br>`backend/src/modules/auth/application/use-cases/request-password-reset.ts` | 6-digit OTP reset flow. Backend requires Resend email provider (`EMAIL_PROVIDER=resend`). Endpoints return 503 if provider is disabled. | **Medium** | **No (Internal)** | Verify Resend API key and domain DNS records for `tuneonus.com` in production deployment. |
| **AUTH-05** | **Session Persistence** | Fully Functional | `mobile/src/features/auth/services/auth-service.ts:97-152`<br>`mobile/src/services/secure-storage.ts` | Tokens saved in Expo SecureStore (`auth.access_token`, `auth.refresh_token`). Initialized at app boot (`AuthService.initialize()`). Falls back to in-memory store in headless tests. | **Low** | **No** | Verified working as expected. |
| **AUTH-06** | **Token Refresh (Single-Flight Mutex)** | Fully Functional | `mobile/src/services/api-client.ts:65-105` | Single-flight promise queue prevents race conditions and replay revocation of rotating refresh tokens. Re-reads rotated token and retries failed request seamlessly. | **Low** | **No** | Verified working as expected. |
| **AUTH-07** | **Authentication Error Handling** | Fully Functional | `mobile/src/services/error-normalizer.ts`<br>`mobile/src/features/auth/services/auth-service.ts:55-94` | Maps 400/401/403/422/429/500 errors to human-friendly messages without exposing database traces or internal stack dumps. | **Low** | **No** | Verified working as expected. |
| **AUTH-08** | **Production API Host Configuration** | Broken in Production | `mobile/eas.json:29`<br>`mobile/src/constants/config.ts:8`<br>`mobile/.env:2` | Production URL `https://fitonus-api.onrender.com` returns 404 (no server). Local `.env` points to LAN IP `http://10.145.97.170:3000`. DEV URL `https://fitonus-api-dev.onrender.com` is working. | **Critical** | **Yes** | Use `internal-testing` profile targeting DEV API for internal test builds; restore/deploy production Render service before store release. |

---

## 3. Mobile Application Features Audit

| Finding ID | Screen / Feature | Implementation Status | Evidence (Exact File Path) | Missing Functionality / Defect | Severity | Release Blocker | Required Fix |
|:---:|---|---|---|---|:---:|:---:|---|
| **FEAT-01** | **Onboarding Wizard** | Fully Functional | `mobile/src/features/onboarding/screens/OnboardingScreen.tsx` | 13-step profile builder (biometrics, goals, fitness preferences, diet). Optimistic step updates saved to backend, sets `onboardingCompleted: true` on finish. | **Low** | **No** | Verified working. |
| **FEAT-02** | **Dashboard (Home Screen)** | Fully Functional | `mobile/src/features/home/screens/HomeScreen.tsx` | Real backend data via TanStack Query, daily nutrition, hydration, daily movement, recommended workouts, offline banner, pull-to-refresh, skeleton loaders. | **Low** | **No** | Verified working. |
| **FEAT-03** | **Workout Management** | Fully Functional | `mobile/src/features/workouts/screens/WorkoutsScreen.tsx`<br>`WorkoutPlanScreen.tsx`<br>`ActiveWorkoutScreen.tsx` | Real backend integration (`/workouts/plans`, `/workouts/sessions`), active workout tracker with rest timer and set logger, offline sync queue, zero-data safety. | **Low** | **No** | Verified working. |
| **FEAT-04** | **Exercise Catalog & Details** | Fully Functional | `mobile/src/features/workouts/screens/ExerciseLibraryScreen.tsx`<br>`ExerciseDetailScreen.tsx` | Fetches admin-curated catalog from `/workouts/exercises`, search, muscle filtering, equipment filtering, detail cards with cues and instructions. | **Low** | **No** | Verified working. |
| **FEAT-05** | **Nutrition & Meal Diary** | Fully Functional | `mobile/src/features/nutrition/screens/NutritionScreen.tsx`<br>`MealDiaryScreen.tsx`<br>`FoodSearchScreen.tsx` | Daily calorie and macro tracking, meal diary by date, food search against backend catalog and custom foods, manual entry calculator, offline logging queue. | **Low** | **No** | Verified working. |
| **FEAT-06** | **Barcode Scanner** | Fully Functional | `mobile/src/features/nutrition/screens/BarcodeScannerScreen.tsx` | Uses `expo-camera` (`CameraView`), flashlight toggle, animated viewfinder, backend barcode lookup (`nutritionApi.getFoodByBarcode`), permission request card. | **Low** | **No** | Verified working. |
| **FEAT-07** | **AI Meal Photo Scanner** | Fully Functional | `mobile/src/features/nutrition/screens/MealPhotoScreen.tsx`<br>`MealAnalysisScreen.tsx`<br>`backend/.../python-meal-photo-service.ts` | Captures food photo, sends base64 (via the Python AI backend) to Gemini multimodal via `POST /nutrition/meal-photo/analyze`, parses food items, portion weights, macros, and confidence ratings. | **Low** | **No** | Verified working. |
| **FEAT-08** | **AI Coach Text Chat** | Fully Functional | `mobile/src/features/ai-coach/screens/CoachScreen.tsx`<br>`mobile/src/features/ai-coach/store/coachStore.ts` | Multi-turn contextual chat, rich blocks (metrics, actions, sources), in-flight `busy` lock preventing duplicate sends, message copy, like/dislike sentiment persistence. | **Low** | **No** | Verified working. |
| **FEAT-09** | **AI Coach Read Aloud (TTS)** | Fully Functional | `mobile/src/features/ai-coach/components/AssistantMessage.tsx`<br>`mobile/src/features/ai-coach/services/speech-service.ts` | On-demand Text-to-Speech via `expo-speech`, strips Markdown artifacts, auto-detects Tamil script vs Indian English, auto-cancels on tab navigation. | **Low** | **No** | Verified working. |
| **FEAT-10** | **Voice Coach (Audio Mode)** | Fully Functional | `mobile/src/features/voice-coach/screens/VoiceCoachScreen.tsx`<br>`backend/.../gemini-client.ts:transcribeAudio` | Records audio via `expo-audio`, animated soundwave waveform, base64 to Gemini multimodal speech-to-text (`POST /coach/transcribe`), auto-reads response via TTS. | **Low** | **No** | Verified working. |
| **FEAT-11** | **Goals & Habit Tracking** | Fully Functional | `mobile/src/features/goals/screens/GoalsScreen.tsx`<br>`GoalCreateScreen.tsx`<br>`GoalDetailScreen.tsx` | Active/completed tabs, habit checkboxes, creation wizard with deadline and metric target, progress calculation, empty states. | **Low** | **No** | Verified working. |
| **FEAT-12** | **Progress & Advanced Analytics** | Fully Functional | `mobile/src/features/analytics/screens/ProgressScreen.tsx`<br>`mobile/src/features/analytics/store/progressStore.ts` | Time-range selectors (W/M/3M/Y), chart visualizations (LineChart, BarChart), period comparisons, volume aggregation, EMA smoothing on body weight. | **Low** | **No** | Verified working. |
| **FEAT-13** | **Push & In-App Notifications** | Fully Functional | `mobile/src/features/notifications/components/NotificationBridge.tsx`<br>`NotificationsScreen.tsx`<br>`NotificationPreferencesScreen.tsx` | FCM token registration, native notification channels, category opt-in toggles, background push listener, notification inbox with read/unread tracking. | **Low** | **No** | Verified working. |
| **FEAT-14** | **Profile & Preferences** | Fully Functional | `mobile/src/features/profile/screens/ProfileScreen.tsx`<br>`PersonalInfoScreen.tsx`<br>`FitnessPreferencesScreen.tsx` | Authenticated profile biometrics, optimistic concurrency version check (`serverProfile.version`), height/weight conversions, avatar initials. | **Low** | **No** | Verified working. |
| **FEAT-15** | **Settings, Appearance & Language** | Fully Functional | `mobile/src/features/settings/screens/SettingsScreen.tsx`<br>`AppearanceScreen.tsx`<br>`LanguageScreen.tsx` | Theme selection (System, Light, Dark) persisted across restarts, metric/imperial unit switching, language preference synced to backend `user_settings`. | **Low** | **No** | Verified working. |
| **FEAT-16** | **Wearable & Health Connect Features** | Safely Disabled & Gated | `mobile/src/shared/constants/featureFlags.ts:13`<br>`HealthIntegrationScreen.tsx`<br>`SleepScreen.tsx` | `WEARABLES_ENABLED = false` disables Apple Watch/Wear OS navigation. Health Connect connect button displays informative toast. Sleep screen shows honest empty states. | **Low** | **No** | Verified safe (zero fabricated metrics). |
| **FEAT-17** | **Legacy Expo Router Route Files** | Dead Code / Inconsistent | `mobile/src/app/(tabs)/`<br>`mobile/src/app/(auth)/` | `app/index.tsx` mounts custom `AppShell` with internal route registry. Unused route files in `app/(tabs)/` have empty no-op handlers (`() => {}`). | **Medium** | **No (Internal)** | Clean up or redirect legacy route files to prevent unexpected deep-link collisions. |

---

## 4. Security & Privacy Audit

| Finding ID | Security Domain | Current Implementation Status | Evidence (Exact File Path) | Finding / Vulnerability | Severity | Release Blocker | Required Fix |
|:---:|---|---|---|---|:---:|:---:|---|
| **SEC-01** | **API Key & Secret Exposure** | Clean / Secure | `mobile/src/` (Full codebase regex scan) | Zero provider API keys (Gemini, JWT secrets, database credentials) are exposed in mobile bundle. Gemini calls run strictly server-side. `google-services.json` contains standard client key. | **Low** | **No** | Verified clean. |
| **SEC-02** | **Sensitive Token Storage** | Clean / Secure | `mobile/src/services/secure-storage.ts`<br>`mobile/package.json:31` | Access and refresh tokens are stored in Android Keystore / iOS Keychain via `expo-secure-store`. Never saved in plaintext AsyncStorage. | **Low** | **No** | Verified clean. |
| **SEC-03** | **Multi-Tenant Data Isolation** | Clean / Secure | `backend/src/modules/` (All SQL queries) | All database read/write queries enforce `WHERE user_id = $1`. Cross-user inspection, chat message hijacking, or profile tampering are rejected with 403/404. | **Low** | **No** | Verified clean. |
| **SEC-04** | **Third-Party SDK Data Collection** | Clean / Minimal | `mobile/package.json` | Zero advertising SDKs, tracking libraries, or data brokers installed. Only Google FCM (`expo-notifications`) is bundled for functional push messaging. | **Low** | **No** | Accurate for Google Play Data Safety declaration (no third-party data sales/advertising). |
| **SEC-05** | **Microphone Temp Audio Cleanup** | Missing File Unlink | `mobile/src/features/voice-coach/screens/VoiceCoachScreen.tsx:182-184` | Recorded voice audio files (`.m4a`) are converted to base64 but never unlinked from cache (`file.delete()`), leaving audio files in application storage. | **Medium** | **No (Internal)** | Call `file.delete()` immediately after base64 conversion. |
| **SEC-06** | **Camera & Audio Permissions** | Appropriately Scoped | `mobile/app.json:29-37`<br>`mobile/android/app/src/main/AndroidManifest.xml` | Explicitly requests `CAMERA` and `RECORD_AUDIO`. `blockedPermissions` blocks unused location permissions (`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`). | **Low** | **No** | Verified clean. |
| **SEC-07** | **Foreground Service Permissions** | Excess Permission Risk | `mobile/app.json:33-34`<br>`mobile/android/app/src/main/AndroidManifest.xml:5-6` | Declares `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Google Play requires policy justification and video proof for foreground services. | **High** | **Yes (Play Store)** | If background playback is not used, remove this permission; otherwise submit justification form in Play Console. |

---

## 5. AI Integration Audit

| Finding ID | AI Subsystem | Current Implementation Status | Evidence (Exact File Path) | Technical Finding / Defect | Severity | Release Blocker | Required Fix |
|:---:|---|---|---|---|:---:|:---:|---|
| **AI-01** | **Primary Model Configuration** | `gemini-3.5-flash` | `backend/src/modules/coach/infrastructure/gemini-client.ts:25`<br>`backend/src/modules/app-settings/domain/gemini-config.ts` | Configured and operational across text chat, image analysis, and speech transcription. | **Low** | **No** | Verified configured. |
| **AI-02** | **Configured Fallback Model** | `gemini-3.5-flash-lite` | `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts:114-115`<br>`migrations/0020_add_gemini_fallback_model.sql` | Resolved dynamically from PostgreSQL `app_settings` or default fallback. | **Low** | **No** | Verified configured. |
| **AI-03** | **Automatic Model Failover** | Fully Implemented | `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts:173-260` | When primary model encounters rate limits or errors, `ModelCooldownTracker` records the incident and automatically fails over to `fallbackModel`. Fast-rejects if both are in cooldown. | **Low** | **No** | Verified working with unit tests passing. |
| **AI-04** | **Provider Quota Bottleneck (Free Tier)** | 20 Requests / Day Limit | `backend/docs/audits/AI_COACH_FINAL_IMPLEMENTATION.md:23`<br>`backend/src/shared/ai/ai-error-classifier.ts` | The project's Google AI Studio key is on Free Tier. Once 20 queries are consumed in 24 hours across all features, Google rejects requests with 429 and an 8-hour cooldown. | **High** | **Yes (Production / Wide Beta)** | Upgrade Google AI Studio project to Pay-As-You-Go billing with appropriate monthly budget caps. |
| **AI-05** | **User Quota Enforcement** | Fully Implemented | `backend/src/shared/ai/ai-usage.ts`<br>`backend/src/modules/app-settings/infrastructure/pg-app-settings-repository.ts` | `AiUsageGate` enforces per-user daily limits (default 50 chats, 20 meal photos, 20 voice meals). Atomic admission prevents quota bypass. | **Low** | **No** | Verified working. |
| **AI-06** | **Friendly Error Messaging** | Fully Implemented | `backend/src/shared/ai/ai-error-classifier.ts`<br>`mobile/src/services/error-normalizer.ts` | Classifies errors into Quota Exhausted, Rate Limited, Timeout, Model Unavailable, and Network. Provides exact retry countdowns when available. | **Low** | **No** | Verified working. |
| **AI-07** | **Chat History Persistence** | Fully Functional | `backend/src/modules/coach/infrastructure/pg-conversation-repository.ts`<br>`migrations/0019_add_coach_message_feedback.sql` | Multi-turn messages stored in PostgreSQL `coach_messages` and `coach_conversations`. History loaded on demand. Message feedback (`like`/`dislike`) persisted. | **Low** | **No** | Verified working. |
| **AI-08** | **Speech-to-Text Transcription** | Fully Functional | `backend/src/modules/coach/interface/coach.routes.ts:180`<br>`backend/src/modules/coach/infrastructure/gemini-client.ts:90-132` | `POST /coach/transcribe` converts audio base64 to text with Tamil, English, and Tanglish detection using Gemini multimodal. | **Low** | **No** | Verified working. |
| **AI-09** | **Deduplication on Retry** | Fully Functional | `mobile/src/features/ai-coach/store/coachStore.ts:191-209`<br>`backend/src/modules/coach/application/use-cases/chat-with-coach.ts:80` | Store retry modifies the existing failed message instead of appending new ones. Client sends `clientMessageId` for server-side idempotency. | **Low** | **No** | Verified working. |

---

## 6. Expo & Android Release Configuration Audit

| Finding ID | Configuration Item | Current Setting | Evidence (Exact File Path) | Release Compliance Verdict | Severity | Release Blocker | Required Action |
|:---:|---|---|---|---|:---:|:---:|---|
| **REL-01** | **Package Name / ApplicationId** | `com.tuneonus.onusfit` | `mobile/app.json:38`<br>`mobile/google-services.json:12` | Matches in both configuration files. | **Low** | **No** | Clean. |
| **REL-02** | **App Version & Version Code** | Version `1.0.0`, Code `1` | `mobile/app.json:5, 23` | Valid initial release values. | **Low** | **No** | Increment `versionCode` for each subsequent AAB upload. |
| **REL-03** | **App Icon & Adaptive Icon** | 1254x1254 Icon, 1024x1024 Foreground | `mobile/app.json:15-20`<br>`mobile/assets/images/` | Assets present on disk and correctly configured. | **Low** | **No** | Verified present. |
| **REL-04** | **Splash Screen** | 1024x1024 Splash Icon | `mobile/app.json:47-58`<br>`mobile/assets/images/splash-icon.png` | Native splash configured for both light (`#FFFFFF`) and dark (`#0B0F17`) themes. | **Low** | **No** | Verified present. |
| **REL-05** | **Android Target SDK** | Target SDK `36`, Min SDK `24` | `mobile/android/app/build.gradle:93-94` | Fully compliant. Target SDK 36 exceeds Google Play minimum (API 34/35). Min SDK 24 covers 98%+ Android devices. | **Low** | **No** | Fully compliant. |
| **REL-06** | **Android Permissions** | 7 granted, 3 blocked | `mobile/app.json:24-37` | Coarse/fine location explicitly blocked. Camera, audio, notification granted. | **Low** | **No** | Fully compliant. |
| **REL-07** | **Push Notification Config** | `remote-updates` channel, custom icon | `mobile/app.json:65-72`<br>`mobile/assets/images/notification-icon.png` | Notification channel created at startup, 192x192 monochrome icon present. | **Low** | **No** | Verified present. |
| **REL-08** | **EAS Project Linkage** | ID: `17a2344d-80a9-4fd9-8b88-589ed4801e4b` | `mobile/app.json:85`<br>`mobile/eas.json` | Project UUID linked to `@tuneonus/onusfit`. `internal-testing` profile ready. | **Low** | **No** | Ready for EAS build execution. |
| **REL-09** | **Release Keystore & Signing** | Debug Keystore fallback | `mobile/android/app/build.gradle:115`<br>`ONUSFIT_RELEASE_READINESS.md:50` | Gradle release build uses `signingConfigs.debug`. Google Play rejects debug-signed AABs. EAS remote credentials must be configured. | **Critical** | **Yes** | Verify and download/configure the official production upload keystore in EAS credentials. |
| **REL-10** | **Build Target Backend URL** | Local IP in `.env` | `mobile/.env:2`<br>`mobile/eas.json:36` | Local `.env` has `http://10.145.97.170:3000/api/v1`. EAS `internal-testing` correctly overrides this with `https://fitonus-api-dev.onrender.com/api/v1`. | **High** | **No (if using EAS)** / **Yes (if local build)** | Run builds strictly via EAS profile `internal-testing` or update `.env`. |

---

## 7. Google Play Requirements Audit

| Requirement Area | Internal Testing Track | Closed Testing Track (20 Testers) | Production Release Track | Current Status in FitOnus Project |
|---|---|---|---|---|
| **Privacy Policy URL** | Not strictly enforced by automated tester upload, but recommended | **Mandatory** — Play Console blocks release creation without live URL | **Mandatory** — Live HTTPS URL displaying active policy | 🛑 **BLOCKED**: `fitonus.com/privacy` is offline. |
| **Account Deletion Webpage** | Not required for initial internal tester list | **Mandatory** — Play Console Data Safety declaration requirement | **Mandatory** — Live web form for account and data deletion | 🛑 **BLOCKED**: No public deletion web page exists. |
| **Data Safety Form** | Not required to distribute to internal testers | **Mandatory** — Detailed questionnaire in Console | **Mandatory** — Publicly displayed on Play Store listing | ⚠️ **PARTIAL**: Data flows are documented in audit; Console form needs to be completed. |
| **Health Apps Policy** | Not required | **Mandatory** — Must declare as Fitness & Nutrition | **Mandatory** — Strict non-medical compliance check | ⚠️ **PENDING**: Requires submission of Google Play declaration form. |
| **Content Rating (IARC)** | Not required | **Mandatory** — Questionnaire completed in Console | **Mandatory** — Official IARC certificate issued | ⚠️ **PENDING**: Standard questionnaire (ratings: Everyone / 3+). |
| **App Access / Reviewer Credentials** | Not required (testers use own accounts) | **Mandatory** — Reviewers must be able to log in | **Mandatory** — Demo account credentials provided | ⚠️ **PENDING**: Reviewer credentials must be generated once backend is live. |
| **Store Listing Graphics** | Not required (only package and AAB) | Basic icon required | **Mandatory** — 512x512 icon, 1024x500 Feature Graphic, phone screenshots | 🛑 **MISSING**: No 1024x500 Feature Graphic or formatted store screenshots. |
| **20 Testers for 14 Days** | **EXEMPT** (immediate distribution to up to 100 testers) | **MANDATORY** for personal developer accounts created after Nov 2023 | Requires approval after completing 14-day closed test | ℹ️ **NOTE**: Internal Testing track bypasses this hurdle completely. |

---

## 8. Testing & Stability Audit

### Automated Test Suite Execution Results
- **Mobile Unit & Integration Tests:**  
  `npm --prefix mobile test`  
  **Result:** **585 passed / 585 tests passed (158 test suites, 0 failures, 8.5s)** 🟢
- **Backend Unit & Integration Tests:**  
  `npm --prefix backend test`  
  **Result:** **1,278 passed / 1,278 tests passed (110 test files, 0 failures, 11.8s)** 🟢
- **Admin Dashboard Tests:**  
  `npm --prefix admin test`  
  **Result:** **119 passed / 119 tests passed (16 test suites, 0 failures, 1.2s)** 🟢
- **Total Repository Passing Tests:** **1,982 tests passed, 0 failures (100% test pass rate)**

### Static Analysis & Compilation Check
- **Mobile TypeScript (`npm --prefix mobile run typecheck`):** **0 errors** 🟢
- **Admin TypeScript (`tsc -p admin/tsconfig.json --noEmit`):** **0 errors** 🟢
- **Mobile Lint (`npm --prefix mobile run lint`):** **0 errors**, 18 minor stylistic warnings 🟢
- **Backend Compilation (`npm --prefix backend run build`):** **FAILED with 1 error** 🛑
  - **File:** `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts:10:3`
  - **Error:** `TS6133: 'defaultModelCooldownTracker' is declared but its value is never read.`
  - **Impact:** Fails production build `tsc -p tsconfig.build.json`.
- **Backend Full Typecheck (`npm --prefix backend run typecheck`):** **2 errors** (above unused import + 1 type mismatch in `tests/unit/app-settings/ai-usage-gate.test.ts:403:5`)

### Runtime & Device Stability Inspection
1. **Network Failure & Offline Resilience:**  
   - Handled via `StatusBanner` components, TanStack Query offline retry policies, and local offline action queues in `nutrition-offline-sync.ts` and `goals-offline-sync.ts`.
2. **Android Back Button & Gesture Navigation:**  
   - Handled cleanly in `mobile/src/app/AppShell.tsx` via `BackHandler` and React Native Reanimated swipe-back gesture detectors.
3. **Database Integrity & Cascades:**  
   - All 20 Neon PostgreSQL migrations are applied. Cascade constraints ensure account deletion purges child records without leaving orphaned data.

---

## 9. Prioritized Implementation Plan

```mermaid
flowchart TD
    subgraph Phase A: Internal Testing Release (Immediate - 1 to 2 Days)
        A1["Fix backend compile error (gemini-runtime-service.ts)"] --> A2["Verify DEV API health & apply migrations"]
        A2 --> A3["Build Android AAB via EAS (internal-testing profile)"]
        A3 --> A4["Upload AAB to Play Console Internal Testing track"]
        A4 --> A5["Distribute to internal testers (up to 100 users)"]
    end

    subgraph Phase B: Closed Testing & AI Quota Scaling (Days 3 to 7)
        B1["Upgrade Google AI Studio key to Pay-As-You-Go"] --> B2["Wire clickable Privacy Policy & Terms in mobile app"]
        B2 --> B3["Add persistent medical disclaimer to Coach chat"]
        B3 --> B4["Purge temp voice recordings in VoiceCoachScreen"]
        B4 --> B5["Deploy public account deletion web page"]
    end

    subgraph Phase C: Google Play Production Launch (Pre-Release)
        C1["Provision & verify production Render backend"]
        C2["Host official Privacy Policy on live domain"]
        C3["Produce 1024x500 Feature Graphic & Store Screenshots"]
        C4["Complete Play Console Data Safety & Health Declarations"]
        C5["Submit for Google Play Store Review"]
    end

    Phase A --> Phase B --> Phase C
```

### Phase A: Android Internal Testing Launch (Immediate Actions)
> **Goal:** Get a working `.aab` into the hands of internal team testers via Google Play Console Internal Testing track within 24–48 hours.

1. **Fix Backend Compile Blocker (`gemini-runtime-service.ts`)**:
   - Remove unused import `defaultModelCooldownTracker` from `backend/src/modules/app-settings/application/services/gemini-runtime-service.ts:10`.
   - Fix type in `backend/tests/unit/app-settings/ai-usage-gate.test.ts:403` (`fallbackModel: ''` instead of `null`).
   - Verify `npm --prefix backend run build` passes with 0 errors.
2. **Configure EAS Build for Internal Testing**:
   - Build target should use the working DEV backend (`https://fitonus-api-dev.onrender.com/api/v1`).
   - Run `eas build --platform android --profile internal-testing`.
   - Ensure EAS has an upload keystore configured.
3. **Distribute Internal Testing Track**:
   - Create an Internal Testing release in Google Play Console.
   - Upload the resulting `.aab`.
   - Add tester email addresses (bypasses Google review and 14-day testing requirement).

---

### Phase B: Closed Testing & Stability Preparation (Days 3–7)
> **Goal:** Address privacy hygiene, AI quota constraints, and prepare for 20-tester closed testing.

1. **Google AI Studio Billing Upgrade**:
   - Attach billing to the Google AI Studio project to remove the 20 RPD Free Tier throttling bottleneck.
2. **In-App Legal Links & Disclaimers**:
   - Wire `Privacy Policy` and `Terms` rows in `mobile/src/features/settings/screens/PrivacyScreen.tsx` and `mobile/src/features/auth/screens/SignupScreen.tsx` to open the policy in `expo-web-browser`.
   - Add static liability disclaimer to `CoachScreen.tsx` and `VoiceCoachScreen.tsx` ("FitOnus AI advice is for fitness guidance only and does not constitute medical advice or diagnosis").
3. **Voice Audio Cache Cleanup**:
   - In `mobile/src/features/voice-coach/screens/VoiceCoachScreen.tsx:182`, call `file.delete()` after transcribing the recorded audio clip.
4. **Deploy Standalone Public Account Deletion Webpage**:
   - Host a lightweight page (e.g. `https://fitonus.com/delete-account` or an Express/Next.js public endpoint) satisfying Google Play's deletion URL requirement.

---

### Phase C: Google Play Store Production Submission
> **Goal:** Satisfy all formal Google Play Store policies and launch to the public.

1. **Production Backend Provisioning**:
   - Deploy backend on production Render service at `fitonus-api.onrender.com` or update EAS production URL to the official production hostname.
2. **Live Domain Privacy Policy**:
   - Ensure `https://fitonus.com/privacy` and `https://fitonus.com/terms` resolve cleanly and accurately disclose personal, biometric, voice, and photo processing.
3. **Store Listing Marketing Assets**:
   - Generate official 1024x500 Feature Graphic.
   - Capture at least 4 phone screenshots (1080x1920 or 1080x2400) showcasing Dashboard, Workout Tracker, Food/Barcode Scanner, and AI Coach.
4. **Google Play Console Declarations**:
   - Complete Data Safety form according to Section 4 & 7 findings.
   - Complete Health Apps form (declare non-medical fitness & nutrition).
   - Complete Foreground Service declaration form for audio recording/playback.
   - Provide test account reviewer credentials for Play Store review team.

---

*Report generated by Antigravity Read-Only Engine. No code, configuration, or database mutations were applied during this audit.*

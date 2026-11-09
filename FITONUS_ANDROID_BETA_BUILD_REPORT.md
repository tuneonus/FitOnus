# FITONUS — ANDROID BETA BUILD & DEVICE QA REPORT

**Engineer:** Senior Expo / React Native Android Release Engineer  
**Date:** November 9, 2026  
**Build Profile:** `preview` (Target: Standalone Android APK)  
**Host Environment:** Linux (Study_Drive volume)  
**Target Expo SDK:** 58.0.0 | React Native 0.88.1 | React 19.3.0  
**Build Status:** `[SUCCESSFUL — STANDALONE ANDROID PREVIEW APK GENERATED]`

---

## 1. Release Configuration

| Parameter | Configuration Value | Status |
| :--- | :--- | :--- |
| **App Name** | FitOnus | Verified |
| **Package Name** | `com.devshan369.FitOnus` | Verified |
| **Version Name** | `1.0.0` | Verified |
| **Version Code** | `1` | Configured |
| **Orientation** | `portrait` | Locked |
| **Deep Link Scheme** | `fitonus://` | Configured |
| **Target SDK** | Android 36 (compileSdk 36, targetSdk 36) | Google Play Compliant ($\ge 34$) |
| **Minimum SDK** | Android 24 (Android 7.0+) | Verified |
| **Architecture** | React Native New Architecture (`newArchEnabled=true`), Hermes Engine | Verified |
| **Adaptive Icon** | Configured with 512×512 foreground, background, monochrome | Verified |
| **Preview Build Output** | Standalone `.apk` (`eas.json` profile: `preview`) | Ready |
| **Production Build Output** | Google Play `.aab` (`eas.json` profile: `production`) | Ready (Isolated from DEV API) |

---

## 2. Environment Verification

### 2.1 Backend Connectivity & Live API Inspection

Tested against Render DEV backend: `https://fitonus-api-dev.onrender.com`

- **Liveness Endpoint (`/health/live`):** HTTP 200 `{"status": "ok"}`
  - *Cold-Start Measurement:* First wake-up request took **32.52 seconds**.
  - *Warm Measurement:* Second request took **1.03 seconds**.
- **Readiness Endpoint (`/health/ready`):** HTTP 200 `{"status": "ok", "message": "Ready"}`
- **Authentication Routes (`/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`):** Active on Render DEV.
- **Core Fitness Routes (`/api/v1/workouts/exercises`, `/api/v1/nutrition/daily`, `/api/v1/nutrition/water`):** Active on Render DEV.
- **AI Endpoints Route Audit (`/api/v1/coach/chat`, `/api/v1/nutrition/meal-photo/analyze`, `/api/v1/nutrition/voice-meal/parse`):**
  - **Returned HTTP 404.**
  - *Root Cause:* The live Render DEV service runs the deployed `main` git branch. The AI modules and schemas are currently in the local working tree and have not yet been deployed to Render.

---

## 3. Release Blockers & Safe Remediation

### Blocker 1: EAS Project Linkage Required (`extra.eas.projectId`) — RESOLVED ✅
- **Status:** **LINKED & VERIFIED**
- **Project:** `@tuneonus/FitOnus`
- **Project ID:** `ede4995a-e0ad-4753-9932-e2f9cfabb0bf`
- **Owner Account:** `tuneonus` (Personal)
- **Config:** Written into `mobile/app.json` (`extra.eas.projectId`).

### Blocker 2: Storage Exhaustion on Host Drive (`/media/devshan/Study_Drive`) — RESOLVED ✅
- **Status:** **RESOLVED**
- **Action Taken:** Executed `./gradlew clean` in `mobile/android`.
- **Result:** Storage on `/media/devshan/Study_Drive` increased from **11 MB free** to **12 GB free** (84% disk usage).
- **Compilation Safety:** Drive now has ample headroom for local tasks, while APK compilation was successfully executed on EAS Cloud infrastructure.

### Blocker 3: Live Render DEV Missing Unmerged AI Routes
- **Condition:** Beta testers using the preview APK against `https://fitonus-api-dev.onrender.com` will receive HTTP 404 when tapping the AI Coach FAB, scanning meal photos, or using voice meal logging.
- **Remediation:** Test core app features (auth, onboarding, workout logging, exercise library, water, and settings) on the preview APK first, or deploy the AI backend changes to Render once concurrent sessions are committed.

---

## 4. Fixes Applied in This Phase

1. **Production Backend Isolation (`eas.json`):**
   - Configured `production` profile in `mobile/eas.json` to point to production URL (`https://fitonus-api.onrender.com/api/v1`), preventing dev backend contamination in store bundles.
2. **Exercise UUID Mapping (`workoutsMock.ts`):**
   - Added bidirectional UUID-to-slug mapping so database exercises resolve accurately in UI screens rather than defaulting to Barbell Bench Press.
3. **Workout Working Volume Fix (`workout-session.ts`):**
   - Corrected volume calculations to strictly exclude warmup sets.
4. **Defensive Progress Calculations (`goal-calculator.ts`):**
   - Added `NaN` and zero-division guards to prevent UI progress ring corruption.
5. **Headless Asset Loader Support (`images.ts`):**
   - Safe fallback in test runners for image asset requires.

---

## 5. Automated Verification Results

- **Mobile TypeScript Compilation (`npm run typecheck`):**
  - Command: `tsc --noEmit`
  - Result: **0 errors** (Clean).
- **Mobile Unit Test Suite:**
  - Command: `npm test`
  - Tests Executed: **176 tests across 74 suites**.
  - Tests Passed: **176** (100% pass rate).
  - Tests Failed: **0**.
  - Duration: **~2.3 seconds**.
- **Expo Public Configuration Introspection:**
  - Evaluated permissions, adaptive icons, version codes, plugins: **Clean & Valid**.

---

## 6. Physical Android Device QA Checklist

Use this structured matrix when verifying the standalone APK on a physical Android test device.

| Area | QA Test Case | Test Steps & Verification Criteria | Device Status |
| :--- | :--- | :--- | :--- |
| **Installation** | Sideload & Launch | Install `.apk` on Android 10+ device; verify splash screen displays with logo glow and resolves into Welcome screen without crash. | `NOT TESTED` |
| **Auth** | User Signup | Register a new user with NIST-compliant password ($\ge 12$ chars); verify tokens persist to hardware-backed Keystore (`SecureStore`). | `NOT TESTED` |
| **Auth** | User Login & Auto-Login | Log in with valid credentials; force-kill app and reopen; verify session is preserved without re-prompting. | `NOT TESTED` |
| **Onboarding** | Profile Setup Flow | Complete personal info, sex, height, weight, activity level; verify Mifflin-St Jeor metabolic targets are calculated and saved. | `NOT TESTED` |
| **Navigation** | Bottom Navigation Bar | Tap each tab (Home, Workouts, Nutrition, Analytics, Profile); verify smooth tab switching and active icon highlights. | `NOT TESTED` |
| **Navigation** | Screen Transitions & Gestures | Verify forward slide transition, native Android back button, edge swipe-back gesture, and drag-to-dismiss modals. | `NOT TESTED` |
| **AI Coach** | Coach FAB & Chat | Tap floating AI Coach button; verify conversation screen opens; verify graceful fallback/offline handling if backend returns 404. | `NOT TESTED` |
| **AI Memory** | Memory Preferences | Navigate to AI Memory screen; toggle memory categories; verify preferences persist. | `NOT TESTED` |
| **Workouts** | Exercise Catalog Search | Open Exercise Library; search by name ("Squat", "Bench"); filter by muscle and equipment; open Exercise Detail. | `NOT TESTED` |
| **Workouts** | Dynamic Generator | Generate a 30-min bodyweight workout; verify exactly 3 unique exercises; verify sets and rest intervals match goal. | `NOT TESTED` |
| **Workouts** | Live Workout Logging | Start active workout; log reps/weights; toggle warmup sets; trigger rest timer; complete session; verify volume excludes warmups. | `NOT TESTED` |
| **Nutrition** | Food Search & Logging | Search catalog for "Egg" or "Chicken"; select 1 serving; verify portion macros match 100g scaling; log to breakfast. | `NOT TESTED` |
| **Nutrition** | Water Logging | Tap quick-log water (+250ml); verify rapid-tap debounce prevents duplicate entries; verify progress ring advances toward target. | `NOT TESTED` |
| **Nutrition** | Camera Meal Photo | Tap photo scanner; grant Camera permission on-demand; snap food photo; verify base64 payload is captured without memory crash. | `NOT TESTED` |
| **Nutrition** | Voice Meal Entry | Tap voice log; grant Microphone permission on-demand; record spoken meal; verify audio recorder stops on unmount. | `NOT TESTED` |
| **Analytics** | Period Comparisons | View weekly and monthly progress graphs; verify EMA smoothed weight trend; verify comparison metrics display canonical units. | `NOT TESTED` |
| **Settings** | Units & Preferences | Switch unit system from Metric to Imperial; verify weight displays in `lb` and height in `ft/in` without double-conversion error. | `NOT TESTED` |
| **Settings** | Change Password | Submit password change; verify old password rejection and session continuity. | `NOT TESTED` |
| **Security** | Secure Deletion & Logout | Log out; verify all local caches, stores, and Keystore tokens are wiped atomically; verify redirect to Welcome screen. | `NOT TESTED` |

---

## 7. APK Build Status & Artifact Location

- **Current Build Status:** `SUCCESS / COMPLETED` ✅
- **Build ID:** `8fafd0e2-0ba0-4446-a8c8-d5e59e8461b2`
- **Build Profile:** `preview`
- **Target Platform:** Android (`.apk` standalone)
- **App Version / VersionCode:** `1.0.0` / `1`
- **Application Archive (APK):**
  - **Direct Download URL:** [FitOnus Preview APK (132 MB)](https://expo.dev/artifacts/eas/sghCxvSrrboP0t1GqWNuAfIi3Fk5Ig4UYbS4dsZ4zkw.apk)
  - **EAS Build Management Page:** [Expo Build #8fafd0e2](https://expo.dev/accounts/tuneonus/projects/FitOnus/builds/8fafd0e2-0ba0-4446-a8c8-d5e59e8461b2)
- **Fingerprint Hash:** `1657f6c43b6fb2b31472ae77260d435b40cc0a2c`
- **Signing Credentials:** Expo Managed Remote Keystore (`tuneonus`)
- **Backend API Target:** `https://fitonus-api-dev.onrender.com/api/v1`

---

## 8. Physical Device Testing & Next Steps

1. **Install Standalone APK on Test Device:**
   - Download the APK directly from [Expo Artifacts Link](https://expo.dev/artifacts/eas/sghCxvSrrboP0t1GqWNuAfIi3Fk5Ig4UYbS4dsZ4zkw.apk) or open [EAS Build Page](https://expo.dev/accounts/tuneonus/projects/FitOnus/builds/8fafd0e2-0ba0-4446-a8c8-d5e59e8461b2) on an Android device (Android 7.0+).
   - Alternatively, install via ADB:
     ```bash
     curl -L -o fitonus-beta.apk "https://expo.dev/artifacts/eas/sghCxvSrrboP0t1GqWNuAfIi3Fk5Ig4UYbS4dsZ4zkw.apk"
     adb install fitonus-beta.apk
     ```
2. **Execute Physical QA Test Matrix:**
   - Step through the 19 checklist items in **Section 6** (Splash, Auth Keystore persistence, Onboarding calculation, Tab navigation, Workouts volume tracking, Nutrition macro scaling, Water rapid-tap debounce, Units toggling, Keystore logout wipe).
3. **Backend AI Route Sync:**
   - Once the active backend sessions commit and merge changes to `main`, deploy the updated backend to Render DEV so the AI Coach (`/coach/chat`), Meal Photo Scanner (`/nutrition/meal-photo/analyze`), and Voice Meal Entry (`/nutrition/voice-meal/parse`) endpoints transition from 404 to active.


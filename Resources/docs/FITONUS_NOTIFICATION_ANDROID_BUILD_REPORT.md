# FITONUS — NOTIFICATION PHASE A ANDROID APK BUILD REPORT

**Report Version:** 1.0.0  
**Date:** November 9, 2026  
**Build Time:** 1:12 PM IST  
**Role:** Senior Expo SDK 58 Engineer, Android Build Engineer, Git Release Engineer & Mobile QA Specialist  
**Git Baseline:** `48d35c1`  
**Checkpoint Commit:** `3f8fb05` (`feat(mobile): complete local notification phase A`)  
**EAS Build ID:** `89f74515-d4c7-426d-a3cf-04d21f395e99`  
**Build Profile:** `preview`  
**Build Status:** **FINISHED (SUCCESS)**  
**APK Download Link:** [https://expo.dev/artifacts/eas/kzizZm_w8TwQdMqzx8rz7lVE5JHHn5Q7J9CCXSWKIvw.apk](https://expo.dev/artifacts/eas/kzizZm_w8TwQdMqzx8rz7lVE5JHHn5Q7J9CCXSWKIvw.apk)

---

## 1. Executive Summary

Phase A local notifications have been hardened, verified, committed to a local Git checkpoint (`3f8fb05`), and successfully compiled into a release-ready Android APK via Expo Application Services (EAS).

The build is ready for installation on physical Android devices to conduct Phase A manual QA testing.

---

## 2. Git Checkpoint & Commit Details

- **Branch:** `main`
- **Baseline Commit:** `48d35c1`
- **Checkpoint Commit:** `3f8fb05d320a7f7ed58f657a02a79f5f33922448`
- **Commit Message:** `feat(mobile): complete local notification phase A`
- **Remote Push:** **NOT PUSHED** (Committed locally in compliance with strict instructions).

### Files Included in Checkpoint Commit:
1. `mobile/app.json` (Native notification permissions and `expo-notifications` plugin configuration)
2. `mobile/src/services/notificationService.ts` (Notification orchestrator, channels, permission bridge, bounded reminder engine)
3. `mobile/src/features/notifications/types/notification.ts` (NotificationSchedule types, 12h/24h converters, quiet hours evaluator)
4. `mobile/src/shared/stores/settingsStore.ts` (User-scoped settings persistence and automatic reconciliation hooks)
5. `mobile/src/features/notifications/screens/NotificationPreferencesScreen.tsx` (Premium preference management screen)
6. `mobile/src/app/AppShell.tsx` (Startup initialization, active app state listener, and auth lifecycle synchronization)
7. `mobile/src/features/auth/services/auth-service.ts` (Immediate reminder cancellation on session termination/logout)
8. `mobile/tests/notifications-phase-a.test.ts` (28 exhaustive automated tests)
9. `FITONUS_NOTIFICATION_PHASE_A_IMPLEMENTATION_REPORT.md` (Implementation documentation)
10. `FITONUS_NOTIFICATION_PHASE_A_FIX_REPORT.md` (Hardening and fix audit)

---

## 3. Automated Test Verification

Prior to triggering the EAS build, all automated test suites and TypeScript checks were executed and passed cleanly:

| Suite | Runner | Result | Details |
| :--- | :--- | :--- | :--- |
| **Mobile TypeScript** | `tsc --noEmit` | **PASSED** | 0 errors |
| **Mobile Test Suite** | Node.js / `tsx` | **PASSED** | **263 passed**, 0 failed, 102 suites |
| **Phase A Specific Tests** | Node.js / `tsx` | **PASSED** | **28 passed**, 0 failed |
| **Backend Test Suite** | Vitest | **PASSED** | **740 passed**, 0 failed, 76 test files |

---

## 4. EAS Build & Native Android Configuration

### 4.1 Build Metadata
- **EAS Project ID:** `ede4995a-e0ad-4753-9932-e2f9cfabb0bf`
- **Expo Account / Owner:** `tuneonus`
- **Application ID / Package:** `com.devshan369.FitOnus`
- **SDK Version:** `58.0.0`
- **Version / Version Code:** `1.0.0` (Version Code `1`)
- **Profile:** `preview` (`"buildType": "apk"`)
- **Distribution:** `internal`
- **Keystore:** Managed by Expo (`oqco1NA1be (default)`)
- **Artifact Type:** Standalone APK (`.apk`)
- **Archive Size:** ~85 MB
- **Fingerprint Hash:** `7f2e291fb8066811b9fea03e971e286f5da43562`
- **Start Time:** 12:52:51 PM IST
- **Completion Time:** 1:12:14 PM IST
- **Build Duration:** 19 minutes 23 seconds
- **Build Log URL:** [https://expo.dev/accounts/tuneonus/projects/FitOnus/builds/89f74515-d4c7-426d-a3cf-04d21f395e99](https://expo.dev/accounts/tuneonus/projects/FitOnus/builds/89f74515-d4c7-426d-a3cf-04d21f395e99)

### 4.2 Native Permissions Verified in Build
- `android.permission.POST_NOTIFICATIONS` (Android 13+ runtime notification prompt)
- `android.permission.RECEIVE_BOOT_COMPLETED` (AlarmManager boot receiver persistence)
- `android.permission.CAMERA` (Preserved)
- `android.permission.RECORD_AUDIO` (Preserved)
- `android.permission.MODIFY_AUDIO_SETTINGS` (Preserved)
- `android.permission.FOREGROUND_SERVICE` (Preserved)
- `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` (Preserved)
- **`SCHEDULE_EXACT_ALARM`**: **Excluded** (Verified unnecessary for daily repeating reminders; prevents battery drain and Google Play Store policy review rejection).

---

## 5. Known Limitations

1. **Notification Tap Navigation:**
   - Notifications successfully present with proper payload `{ route: 'workoutPlan', kind: 'workout' }` or `{ route: 'home', kind: 'water' }`.
   - Direct deep-link routing from background notification taps via `addNotificationResponseReceivedListener` is slated for Phase C/D integration to prevent disrupting the active navigation state during Phase A.
2. **Standard AlarmManager Delivery Jitter:**
   - Android utilizes inexact repeating alarms to conserve device battery. Reminders may experience minor delivery jitter (±2 to 8 minutes) if the physical device is in Deep Doze mode.
3. **FCM / Remote Push:**
   - Explicitly omitted in Phase A. No Firebase Cloud Messaging or backend push dependencies are installed or configured.

---

## 6. Physical Device Testing Checklist

Follow this step-by-step verification plan on a physical Android test device running Android 13 or newer:

- [ ] **Step 1: Download & Install APK**
  - Download APK: [kzizZm_w8TwQdMqzx8rz7lVE5JHHn5Q7J9CCXSWKIvw.apk](https://expo.dev/artifacts/eas/kzizZm_w8TwQdMqzx8rz7lVE5JHHn5Q7J9CCXSWKIvw.apk)
  - Install on test device. Allow installation from unknown sources if prompted.
- [ ] **Step 2: Launch App & Authenticate**
  - Launch FitOnus. Verify splash screen and smooth startup.
  - Sign in with an existing user account or create a test account.
- [ ] **Step 3: Test Permission Request Flow**
  - Navigate to **Profile -> Settings -> Notifications**.
  - Toggle **Allow Notifications (Master Switch)** to **ON**.
  - Verify the native Android 13+ system permission prompt (`"Allow FitOnus to send you notifications?"`) appears.
  - Tap **Allow**. Verify toggle stays active and toast indicates reminders enabled.
- [ ] **Step 4: Configure Workout Reminder**
  - Ensure **Workout Reminders** switch is **ON**.
  - Tap the workout time picker chip and select a time near the current time (or note selected time).
  - Verify toast confirms time selection.
- [ ] **Step 5: Verify Foreground Alert Presentation**
  - Keep app open in foreground.
  - Verify notification displays heads-up banner with sound and vibration.
- [ ] **Step 6: Verify Background Delivery**
  - Lock physical device or send app to background.
  - Wait for scheduled reminder time.
  - Verify device wakes/notifies with "Workout Ready" alert on the `Workout Reminders` notification channel.
- [ ] **Step 7: Water Reminder Interval Testing**
  - Enable **Water & Hydration Reminders**.
  - Select interval (e.g. 1 hour or 2 hours).
  - Verify schedule reconciles without crashing.
- [ ] **Step 8: Quiet Hours Verification**
  - Configure Quiet Hours (e.g. 10:00 PM – 6:00 AM).
  - Verify any reminder scheduled within the quiet window is silenced/skipped.
- [ ] **Step 9: Master Switch Cancellation**
  - Toggle **Allow Notifications** to **OFF**.
  - Verify toast indicates reminders disabled.
  - Verify all upcoming alarms are cancelled.
- [ ] **Step 10: Logout Verification**
  - Go to Account Settings and tap **Log Out**.
  - Verify all local alarms are purged upon session termination.
- [ ] **Step 11: Device Reboot Persistence**
  - Log back in, enable notifications, and restart the physical phone.
  - Unlock the phone once (to allow Direct Boot decryption).
  - Verify alarms persist post-boot via `RECEIVE_BOOT_COMPLETED`.

---

## 7. Remaining Manual Tasks

1. **Tester Manual Execution:** Download APK, install on device, and complete the checklist in Section 6.
2. **Feedback Collection:** Record actual physical delivery timestamps, volume/vibration behavior, and OEM battery optimization impacts (e.g. Samsung OneUI, Xiaomi HyperOS).

---

## 8. Final Readiness Status

| Deliverable | Status |
| :--- | :--- |
| **Phase A Implementation** | **COMPLETE & HARDENED** |
| **Automated Tests** | **263/263 PASSED (100%)** |
| **Local Git Checkpoint** | **COMMITTED (`3f8fb05`)** |
| **EAS Preview APK** | **GENERATED & SIGNED** |
| **FCM / Phase B Boundary** | **PRESERVED & ISOLATED** |
| **Physical Delivery Status** | **READY FOR PHYSICAL QA TESTING** |

> [!TIP]
> **Next Action:** Download and install the APK on a physical Android device to validate real-world notifications. Do not begin Phase B until Phase A physical testing is approved.

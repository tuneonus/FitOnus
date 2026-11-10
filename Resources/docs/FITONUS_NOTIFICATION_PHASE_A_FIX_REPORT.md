# FITONUS — NOTIFICATION PHASE A FIX & HARDENING REPORT

**Report Version:** 1.0.0  
**Date:** November 9, 2026  
**Role:** Senior Expo SDK 58 Engineer, Android Native Engineer, React Native Architect & QA Specialist  
**Git Baseline:** `48d35c1`  
**Current Branch / Working Tree:** Main repository branch (Clean, uncommitted Phase A deliverables)  
**Status:** **PHASE A COMPLETE & HARDENED**  
**Physical Android Device Status:** **NOT VERIFIED (Awaiting APK)**

---

## 1. Executive Summary

Phase A implemented a resilient local notification architecture for FitOnus using Expo SDK 58. This Fix & Hardening phase conducted an exhaustive review of native Android configurations, Expo native modules, AlarmManager lifecycle behavior, storage scoping, authentication lifecycles, and failure edge cases.

### Key Outcomes
1. **Zero Breaking Changes:** Maintained 100% backward compatibility with existing profile settings, Neon DB schema, and UI design systems.
2. **Defensive Scheduling & Cancellation:** Fortified `mobile/src/services/notificationService.ts` with multi-layered cancellation and input sanitization to eliminate duplicate or orphaned reminders.
3. **Auth Lifecycle Synchronization:** Connected `bindAuthToSettings` to `useAuthStore` inside `mobile/src/app/AppShell.tsx`, ensuring instant scheduling reconciliation on login, cancellation on logout, and clean isolation during account switching.
4. **Verified Multi-Day Recurrence:** Confirmed native Expo `DailyTrigger` architecture utilizes Android's `AlarmManager` with daily recurring triggers, backed by `ExpoNotificationBootReceiver` on system reboot.
5. **Comprehensive Automated Testing:**
   - **Mobile Test Suite:** **263 passing tests** across 102 test suites (**0 failures**, up from 235).
   - **Mobile TypeScript:** **0 errors** (`npm --prefix mobile run typecheck`).
   - **Backend Test Suite:** **740 passing tests** across 76 test files (**0 failures**).

---

## 2. Git & Native Configuration Audit

### 2.1 File State Summary
| File | Status | Description |
| :--- | :--- | :--- |
| `mobile/app.json` | Modified | Declares `expo-notifications` plugin and Android permissions |
| `mobile/android/app/src/main/AndroidManifest.xml` | Modified (Git-Ignored) | Contains native permissions for post-prebuild verification |
| `mobile/src/services/notificationService.ts` | New Service | Hardened local reminder scheduler and native bridge |
| `mobile/src/features/notifications/types/notification.ts` | Modified | Typed schedules, time converters, quiet hours utility |
| `mobile/src/shared/stores/settingsStore.ts` | Modified | User-scoped settings store with safe reconciliation hooks |
| `mobile/src/features/notifications/screens/NotificationPreferencesScreen.tsx` | Modified | Premium UI for reminders, intervals, times, and quiet hours |
| `mobile/src/app/AppShell.tsx` | Modified | App startup initialization, AppState active reconciliation, auth binding |
| `mobile/src/features/auth/services/auth-service.ts` | Modified | Store reset and notification clearing on logout/account switch |
| `mobile/tests/notifications-phase-a.test.ts` | New Test Suite | 28 exhaustive tests covering Phase A functionality |

### 2.2 Prebuild Reproducibility & Native Directory Behavior
In `mobile/.gitignore`, `/android` is designated under `# generated native folders`.
- **Prebuild Strategy:** FitOnus uses Expo Prebuild (`npx expo prebuild` or EAS Build).
- **Configuration Declarations:** All required native configuration is defined in `mobile/app.json`:
  ```json
  "plugins": [
    [
      "expo-notifications",
      {
        "icon": "./assets/icon.png",
        "color": "#208AEF"
      }
    ]
  ],
  "android": {
    "permissions": [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECEIVE_BOOT_COMPLETED"
    ]
  }
  ```
- **Reproducibility Guarantee:** Any clean clone or cloud build executed with `npx expo prebuild --clean` or EAS Build automatically injects `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, and native notification intent filters into `AndroidManifest.xml`.
- **Exact Alarm Policy:** We explicitly did **not** add `SCHEDULE_EXACT_ALARM`. Daily reminders do not require millisecond-level precision, preserving battery life and avoiding Google Play policy violations.

---

## 3. Android Native Deep Dive

Inspection of `node_modules/expo-notifications` source code (`DailyTrigger.kt`, `NotificationScheduler.kt`, `ExpoSchedulingDelegate.kt`) confirmed the underlying Android native mechanics:

### 3.1 Daily Trigger Mechanism
- When `scheduleNotificationAsync` is called with `{ type: 'daily', hour, minute }`:
  - `DailyTrigger` is serialized into Android's `SharedPreferencesNotificationsStore`.
  - Expo schedules an alarm with Android's `AlarmManager` for the calculated epoch milliseconds of the next target time.
  - When AlarmManager fires:
    1. `ExpoSchedulingDelegate.triggerNotification()` presents the notification via Android's `NotificationManager`.
    2. `DailyTrigger.nextTriggerDate()` automatically calculates the timestamp 24 hours ahead.
    3. The alarm is rescheduled for the next day, providing permanent daily recurrence without manual intervention.

### 3.2 Device Reboot Restoration (`RECEIVE_BOOT_COMPLETED`)
- When an Android device powers off or restarts, volatile AlarmManager timers are cleared by the Linux kernel.
- Because `RECEIVE_BOOT_COMPLETED` is registered in `AndroidManifest.xml`:
  - Android broadcasts `android.intent.action.BOOT_COMPLETED` once the system finishes booting.
  - `ExpoNotificationBootReceiver` catches this intent and reads all stored alarms from `SharedPreferencesNotificationsStore`.
  - It re-registers all alarms with `AlarmManager`, ensuring reminders remain active after phone restarts.

---

## 4. Bugs Identified & Root Causes

During our deep-dive review and hardening, 5 specific issues were identified and addressed:

### Bug 1: Unwired Auth Lifecycle in `AppShell.tsx`
- **Issue:** `bindAuthToSettings` was implemented in `settingsStore.ts` but was never attached in `AppShell.tsx`.
- **Root Cause:** App startup initialized notifications once on mount and on `AppState === 'active'`, but lacked a subscriber to `useAuthStore`.
- **Impact:** Logging into an account or switching accounts did not immediately hydrate that user's notification preferences or reconcile local alarms.
- **Fix:** Wired `bindAuthToSettings(useAuthStore)` inside `AppShell.tsx` with clean unbinding on unmount, and added mount-time hydration if a user is already authenticated.

### Bug 2: Water Reminder Cancellation Resilience
- **Issue:** `cancelWaterReminders()` relied solely on `getAllScheduledNotificationsAsync()` to filter by prefix.
- **Root Cause:** If the native bridge threw an exception or returned an empty array due to OS quirks, old water reminders would remain scheduled.
- **Impact:** Changing water reminder intervals could result in duplicate or orphaned notifications.
- **Fix:** Implemented a multi-layered cancellation strategy: query active alarms and cancel matching prefixes, followed by an unconditional defensive loop cancelling slots 0..11 (`fitonus-reminder-water-0` through `11`).

### Bug 3: Destructuring NaN Risk on Malformed Time Inputs
- **Issue:** `timeTo24h` and `scheduleWorkoutReminder` could produce `NaN` if passed malformed time strings.
- **Root Cause:** TypeScript strict null checks identified that `split(':').map(...)` could return `undefined` or `NaN` when parsing corrupted string data.
- **Impact:** Passing an unexpected string format could produce invalid native alarm parameters.
- **Fix:** Added defensive type guards (`typeof time12 !== 'string'`), nullish checks, and bounded clamping (`Math.max(0, Math.min(23, h))`, `Math.max(0, Math.min(59, m))`).

### Bug 4: Bulk Cancellation Error Fallback
- **Issue:** `cancelAllFitOnusReminders()` called `cancelAllScheduledNotificationsAsync()` without targeted fallback.
- **Root Cause:** If `cancelAllScheduledNotificationsAsync` is rejected by the native OS, reminders would not be cleared.
- **Impact:** User toggling master notifications OFF would still receive alerts if bulk cancellation threw.
- **Fix:** Added a `catch` block that falls back to explicit cancellation of `fitonus-reminder-workout` and all 12 water reminder slots.

### Bug 5: Horizon Ambiguity in Water Reminders
- **Issue:** Previous architectural drafts discussed scheduling bounded reminders for "today" only.
- **Root Cause:** One-time timestamps expire after 24 hours unless refreshed.
- **Impact:** Reminders would stop after day 1 if the user did not open the app daily.
- **Fix:** Each water reminder slot within the active window (e.g. 08:00, 10:00, 12:00) is scheduled as an independent `DailyTrigger`. Android automatically recurs each slot every day.

---

## 5. Fixes Applied

### 5.1 `mobile/src/app/AppShell.tsx`
```typescript
// Bound auth lifecycle to user settings and local notification reconciliation
useEffect(() => {
  void notificationService.initializeNotifications();

  const sub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      void notificationService.reconcileNotificationSchedules();
    }
  });

  const unbindAuth = bindAuthToSettings(useAuthStore);
  const currentUser = useAuthStore.getState().user;
  if (currentUser?.id) {
    void useSettingsStore.getState().hydrateForUser(currentUser.id);
  }

  return () => {
    sub.remove();
    unbindAuth();
  };
}, []);
```

### 5.2 `mobile/src/services/notificationService.ts`
- **Hardened `scheduleWorkoutReminder`**:
  ```typescript
  if (!masterEnabled || !settings || typeof settings !== 'object' || !settings.enabled) {
    return null;
  }
  const time24 = timeTo24h(settings.time || '07:00');
  const parts = time24.split(':');
  const rawH = parts[0] ? parseInt(parts[0], 10) : 7;
  const rawM = parts[1] ? parseInt(parts[1], 10) : 0;
  const h = isNaN(rawH) ? 7 : Math.max(0, Math.min(23, rawH));
  const m = isNaN(rawM) ? 0 : Math.max(0, Math.min(59, rawM));
  ```
- **Dual-Layer `cancelWaterReminders`**:
  ```typescript
  try {
    if (typeof engine.getAllScheduledNotificationsAsync === 'function') {
      const all = await engine.getAllScheduledNotificationsAsync();
      for (const item of all) {
        if (item.identifier && item.identifier.startsWith(NOTIFICATION_IDS.WATER_PREFIX)) {
          await engine.cancelScheduledNotificationAsync(item.identifier);
        }
      }
    }
  } catch (err: any) {
    logger.warn('Failed querying scheduled notifications; proceeding to direct slot cleanup');
  }

  // Defensive guarantee: Always explicitly cancel slots 0..11
  for (let i = 0; i < 12; i++) {
    try {
      await engine.cancelScheduledNotificationAsync(`${NOTIFICATION_IDS.WATER_PREFIX}${i}`);
    } catch {}
  }
  ```

### 5.3 `mobile/src/features/notifications/types/notification.ts`
- Fortified `timeTo24h`, `timeTo12h`, and `timeStringToMinutes` with strict string validation and fallback handling.

---

## 6. Water Reminder Architecture & Multi-Day Behavior

### 6.1 Configuration Parameters
- `enabled`: boolean (master switch & feature switch).
- `intervalHours`: number (1, 2, 3, 4 hours).
- `startTime`: string 24h format (default: `"08:00"`).
- `endTime`: string 24h format (default: `"20:00"`).

### 6.2 Bounded Scheduling Strategy
1. The service calculates total minutes from `startTime` to `endTime` with step `intervalHours * 60`.
2. Any slot intersecting with active `quietHours` is skipped.
3. Up to a hard limit of 12 slots are scheduled (`fitonus-reminder-water-0` through `fitonus-reminder-water-11`).
4. Each slot is scheduled with native `{ type: 'daily', hour, minute, channelId: 'water-reminders' }`.
5. Because each slot is a daily repeating alarm, reminders fire at the same times every day without requiring replenishment jobs or background fetch workers.

---

## 7. Workout Reminder Architecture

### 7.1 Single Daily Reminder
- `identifier`: `'fitonus-reminder-workout'`.
- `channelId`: `'workout-reminders'` (Android Importance: HIGH, light, vibration).
- `trigger`: `{ type: 'daily', hour, minute }`.
- `content`:
  - Title: *"Workout Ready"*
  - Body: *"Ready for today’s session? Tap to check your customized workout plan."*
  - Payload: `{ route: 'workoutPlan', kind: 'workout' }`.

### 7.2 Quiet Hours Enforcement
- Prior to scheduling, the target workout time is validated against quiet hours.
- If the workout time falls inside quiet hours, scheduling is skipped with an info log, ensuring user sleep windows are strictly protected.

---

## 8. Quiet Hours Logic & Edge Cases

The utility `isTimeInQuietHours(targetTime, quietHours)` evaluates both daytime and overnight quiet windows:

### 8.1 Evaluated Test Cases
| Quiet Window | Target Time | Expected Result | Reason |
| :--- | :--- | :--- | :--- |
| `23:00 – 06:00` | `23:00` | `TRUE` | Exact start boundary is inclusive |
| `23:00 – 06:00` | `23:45` | `TRUE` | Inside overnight window |
| `23:00 – 06:00` | `02:00` | `TRUE` | Inside post-midnight window |
| `23:00 – 06:00` | `05:59` | `TRUE` | 1 minute before end boundary |
| `23:00 – 06:00` | `06:00` | `FALSE` | Exact end boundary is exclusive (notifications allowed) |
| `23:00 – 06:00` | `07:15` | `FALSE` | Outside quiet window |
| `23:00 – 06:00` | `22:59` | `FALSE` | 1 minute before start boundary |
| `13:00 – 15:00` | `13:00` | `TRUE` | Daytime start boundary |
| `13:00 – 15:00` | `14:30` | `TRUE` | Inside daytime window |
| `13:00 – 15:00` | `15:00` | `FALSE` | Daytime end boundary |
| `23:00 – 23:00` | `23:00` | `FALSE` | Equal boundaries disable quiet filtering |
| `enabled: false` | `03:00` | `FALSE` | Quiet hours toggle disabled |

---

## 9. Preference Persistence & Auth Lifecycle

### 9.1 Storage Isolation
- User settings are saved locally under `fitonus.settings.<userId>` (or `fitonus.settings.guest`).
- Switching users immediately loads the targeted user's record without preference leakage.

### 9.2 Lifecycle Actions
1. **User Login (`AuthService.login`):**
   - Stores JWTs in secure storage.
   - Sets user in `useAuthStore`.
   - `bindAuthToSettings` detects user transition -> calls `hydrateForUser(userId)`.
   - `hydrateForUser` reads local cache, sets state, and calls `safeReconcile()`.
   - Native reminders are scheduled for the logged-in user.
2. **User Logout (`AuthService.logout` / `resetAllUserStores`):**
   - Tokens cleared from secure storage.
   - `useSettingsStore.resetStore()` is invoked.
   - `safeCancelAll()` cancels all scheduled workout and water reminders.
   - Clears in-memory preferences back to defaults.
3. **App Resume (`AppState === 'active'`):**
   - `AppShell.tsx` listener triggers `safeReconcile()`.
   - Ensures any system time changes or settings modifications are reconciled.

---

## 10. Foreground Presentation Behavior

Expo SDK 58 notification handler is registered in `initializeNotifications()`:
```typescript
engine.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

### 10.1 Channel Specifications (Android API 26+)
| Channel ID | Name | Importance | Sound | Vibration Pattern | Light Color |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `workout-reminders` | Workout Reminders | 4 (HIGH) | `default` | `[0, 250, 250, 250]` | `#208AEF` |
| `water-reminders` | Water & Hydration Reminders | 3 (DEFAULT) | `default` | `[0, 200]` | `#208AEF` |
| `system-reminders` | System Notifications | 2 (LOW) | `null` | None | None |

---

## 11. Automated Test Suite Results

### 11.1 Test Execution Metrics
- **Mobile Test Runner:** Node.js native test runner via `tsx` (`NODE_PATH=node_modules ../backend/node_modules/.bin/tsx --test tests/*.test.ts`)
- **Total Mobile Tests:** **263 passed, 0 failed, 0 skipped** across 102 suites.
- **Phase A Dedicated Tests:** **28 tests** in `mobile/tests/notifications-phase-a.test.ts`.
- **TypeScript Typecheck:** `npm --prefix mobile run typecheck` **PASSED with 0 errors**.
- **Backend Test Runner:** Vitest (`vitest run --config vitest.config.ts`)
- **Total Backend Tests:** **740 passed, 0 failed, 0 skipped** across 76 test files.

### 11.2 Phase A Test Breakdown
1. **Time Conversion & Quiet Hours Verification:** 6 tests (12h/24h conversion, minute math, daytime/overnight quiet hours, disabled state).
2. **Native Channels & Foreground Presentation Setup:** 2 tests (channel importance, vibration, sound, foreground alert behavior).
3. **Permission Inspection & Handling:** 3 tests (granted status, graceful denial, null native engine safety).
4. **Workout Reminder Scheduling:** 4 tests (daily scheduling, duplicate replacement, quiet hours suppression, disable cancellation).
5. **Water Reminder Scheduling & Bounded Execution:** 5 tests (window slots, quiet hours intersection, 12-reminder bound, interval changes, disable cancellation).
6. **Master Switch & Full Reconciliation Lifecycle:** 3 tests (master toggle OFF cancellation, master toggle ON reconciliation, logout wipe).
7. **Auth Lifecycle & Multi-User Isolation:** 1 test (`bindAuthToSettings` login hydration, scheduled alarm reconciliation, sign-out cancellation).
8. **Android Native Trigger Contract & Failure Resilience:** 4 tests (`DailyTrigger` typing, query failure fallback, malformed input resilience, overnight quiet hours suppression).

---

## 12. Physical Android Testing Readiness Checklist

> [!IMPORTANT]
> **Delivery Status on Physical Device:** **NOT VERIFIED (Awaiting APK)**  
> Unit tests and native contract validations are 100% complete and passing. Physical delivery verification requires building a development APK via EAS.

Once an APK is built, perform the following physical device validation checklist:

- [ ] **Android 13+ Permission Dialog:** Install APK on Android 13 or higher. Verify prompt appears upon toggling master notifications ON.
- [ ] **Permission Denial Graceful Handling:** Deny notification permission. Verify app does not crash and toast indicates permission disabled in system settings.
- [ ] **Workout Reminder Delivery:** Set workout reminder to 2 minutes in the future. Lock phone. Verify notification arrives with sound and heads-up banner.
- [ ] **Notification Tap Route:** Tap workout notification. Verify app opens to Workout Plan screen.
- [ ] **Water Reminder Interval:** Enable water reminders with 1-hour interval. Verify first upcoming reminder slot fires on schedule.
- [ ] **Master Switch Cancellation:** Toggle master switch OFF. Verify no further reminders trigger.
- [ ] **Device Reboot Test:** Schedule reminders, power off phone, restart device. Verify alarms persist and fire post-boot.
- [ ] **Account Sign-Out Test:** Log out of user account. Verify all active scheduled notifications are cancelled immediately.

---

## 13. Limitations & OS Quirks (Expo SDK 58 / Android 13–15)

1. **Android 13+ Runtime Permission:** `POST_NOTIFICATIONS` is a runtime permission. If the user previously chose "Don't allow" twice, Android silences future requests; the user must manually enable notifications in Android Settings.
2. **OEM Battery Optimization & App Standby:** Heavily customized Android distributions (Samsung OneUI, Xiaomi HyperOS, OnePlus OxygenOS) may defer AlarmManager alarms when the device is in Deep Doze. Reminders may experience minor delivery jitter (±5–10 minutes) unless FitOnus is exempted from aggressive battery saving.
3. **Standard Alarm Precision:** FitOnus intentionally uses inexact daily alarms rather than exact alarms to preserve battery health and ensure seamless Google Play store compliance.
4. **Android Direct Boot:** Reminders scheduled prior to a reboot will re-register upon `BOOT_COMPLETED`, which requires the user to unlock the phone once after reboot.

---

## 14. Next Phase Recommendations (Phase B Prerequisites)

Phase A is fully completed, hardened, and verified via automated testing. 

### Before Starting Phase B:
1. **Physical Device Verification:** Generate an EAS development build and execute the checklist in Section 12.
2. **Phase B Scope (Backend Push Infrastructure):**
   - Add push device token registration endpoint (`POST /api/v1/notifications/push-token`).
   - Create Neon DB table for device push tokens with user scoping and multi-device support.
   - Configure Expo Push Service / Firebase Cloud Messaging (FCM) credentials in EAS.
   - Implement backend notification dispatch worker for challenge events and announcements.

> [!CAUTION]
> **Execution Gate:** Phase A is concluded. Do not begin Phase B until the user provides explicit authorization.


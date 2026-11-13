# OnusFit notifications (mobile)

Written for: OnusFit mobile and backend engineers. Expo SDK 58 (`expo-notifications ~58.1.7`), Android first. All changes are uncommitted.

**Status:** the full path is implemented end to end in code (backend, admin, mobile) and verified by automated tests against fakes and a real PostgreSQL. It has **not been run on a physical device or against real FCM**. Do not call remote push "working" until the device test plan in §7 has passed.

## 1. Two kinds of notification, never mixed

| | Local reminders | Server notifications |
|---|---|---|
| What | The phone's own alarm fires workout / hydration reminders | An admin campaign sent by the backend through FCM, also stored in the inbox |
| Needs backend | No | Yes (`backend/src/modules/notifications`) |
| Needs FCM + dev build | No (works in Expo Go) | Yes (not in Expo Go on Android) |
| Categories | `workout_reminders`, `habit_reminders` | `announcements`, `challenges`, `coach_insights`, `goal_updates` |

**Why a reminder cannot arrive twice:** the server can only send the four server categories; it cannot send the local ones. A local reminder carries `{ kind }` and no `notificationId`; a server push carries `{ notificationId, category, destination? }` and no `kind`. The app routes each by its own shape (`parseNotificationPayload` vs `parseRemotePushPayload`), a foreground server push is de-duplicated by `notificationId`, and the inbox only ever contains server items.

## 2. How a server push reaches the user

0. **Permission (once).** After sign-in, on the first usable screen (not splash/auth/onboarding, not under a maintenance/forced-update modal), `NotificationPermissionPrompt` shows a short in-app explanation. Only the **Allow notifications** press opens the Android 13+ system dialog, so the "OS prompt only from a user gesture" rule still holds. The answer (allow or *Not now*) is stored once per install (`fitonus.push.permission-prompt.v1`): a denial is never re-prompted automatically, and Settings → Notifications keeps the **Enable notifications / Open settings** card. Android < 13 grants permission at install, so no prompt is shown and registration just happens at sign-in. Policy: `notification-permission-prompt.ts`.
1. Sign-in, token rotation, or returning to the foreground (e.g. after granting in Android settings): the app obtains the **native FCM token** (`getDevicePushTokenAsync`) only if the OS permission is already granted, never prompting, then `PUT /notifications/devices/{installationId}` with `{ installationId, pushToken, platform, appVersion, timeZone }`. No EAS project id and no Expo push token are involved; the backend talks to FCM directly.
2. The backend sends through FCM HTTP v1 on channel `remote-updates` (HIGH importance, so it can heads-up; created at every app launch, before the Android 13 prompt and before the token request; Android never raises the importance of a channel that already exists) with data `{ notificationId, category, destination? }`.
3. **Foreground:** the banner shows; the app confirms receipt (`POST /notifications/:id/received`) and refreshes the inbox.
4. **Background / terminated:** Android shows it; tapping launches or resumes the app. The response listener (and the cold-start `getLastNotificationResponseAsync`) marks it read, confirms receipt and refreshes. A tap before sign-in or during onboarding is held and delivered after. With direct FCM (no JSON `body` key) Expo copies the data keys as-is into `content.data` (verified in the installed SDK source).
5. **Navigation** is a closed allow-list: `destination` ∈ `home, activity, coach, progress, profile, workouts, nutrition, goals, challenges, badges, weekly_report, notifications`. A payload that names `route`, `screen` or `url`, an unknown key, or has no valid `notificationId` navigates nowhere.
6. **Logout:** `DELETE /notifications/devices/{installationId}` (bounded, never throws), the device's FCM token is invalidated, reminders are cancelled, the inbox store is reset.

Receipt honesty: the backend marks a delivery `received` only when step 3 or 4 happens. A push shown in the status bar and never tapped stays `accepted` ("FCM took it"), which the admin dashboard states.

## 3. Screens

* **Notifications inbox** (existing screen, unchanged layout): now loads the server inbox on open, on sign-in and on foreground. Read / mark-all / remove are optimistic and synced. Items with a known destination get an **Open** action.
* **Notification settings** (existing screen): the permission card, master switch, reminder rows and quiet hours are unchanged. A new **Updates from OnusFit** card holds the four server categories; each toggle is saved immediately and rolled back with a toast if the save fails. The master switch already synced through the settings endpoint and is the same column the backend uses (`user_settings.notifications_enabled`).

`BottomNav.tsx` and its theme tokens were not touched.

## 4. Files

New: `services/notification-inbox-api.ts`, `-inbox-mapper.ts`, `-remote-handlers.ts`, `-category-preferences.ts`, `-backend-config.ts`, `hooks/useServerCategoryPreferences.ts`.
Changed: `types/push.ts` (+`getDevicePushTokenAsync`, −Expo token), `types/push-contract.ts`, `types/notification.ts` (`remote` flag), `services/{native,notification-token,notification-coordinator,notification-runtime,notification-routing,notification-listeners}.ts`, `store/notificationsStore.ts`, `components/NotificationBridge.tsx`, `screens/{NotificationsScreen,NotificationPreferencesScreen}.tsx`, `index.ts`.
From the earlier foundation (unchanged here): `AppShell.tsx` mounts the bridge, `auth-service.ts` logout cleanup, `app.json` (`googleServicesFile`, `defaultChannel: remote-updates`).

## 5. Credentials and configuration

* `google-services.json` (package `com.tuneonus.onusfit`) is present and referenced by `app.json`. Not modified.
* The FCM V1 key already uploaded to **EAS** is for Expo's push service and EAS builds. The backend sends directly and needs **its own** `FCM_SERVICE_ACCOUNT_BASE64` (or `_JSON`) on Render; see `backend/docs/notifications.md`. Nothing secret belongs in `EXPO_PUBLIC_*`.
* A **new development build is required** if the installed build predates the `app.json` change (the local `android/` is gitignored and pre-rebrand). No build was started.
* API-key restrictions: if the `google-services.json` key is restricted, allow the FCM Registration and Firebase Installations APIs and use the SHA-1 of the Play Console app-signing key.

## 6. Known gaps (deliberately not changed)

* Notification small icon: the plugin icon `icon.png` is RGB with no alpha, so the status bar draws a blank square, and `android-icon-monochrome.png` is the generic Expo chevron, not the OnusFit mark. Needs a white-on-transparent silhouette (≈80% of a 96×96 canvas) before a store build.
* No goal-reminder UI writes `notificationSchedule.goal`, so that local reminder never schedules.
* The by-name `eval('require')` pattern still exists in `settingsStore.ts` / `auth-service.ts` (reminder engine is bridged through `setNotificationEngine()`); unverified on a device.
* Local reminders only schedule with OS permission **and** a signed-in user.
* Android only: `platform: 'ios'` is accepted by the API but APNs is not configured.

## 7. Device test plan (physical Android, new dev build, DEV backend with `FCM_DRY_RUN=false`)

Preconditions: migration `0018` applied to DEV, `FCM_SERVICE_ACCOUNT_BASE64` set on DEV Render, an admin and a member account.

1. **Launch offer.** Fresh install, sign in, reach Home: after ~1 s the in-app "Stay on track with OnusFit" dialog appears, once. **Not now** ends it for good; **Allow notifications** opens the Android system dialog (Android 13+).
2. **Permission.** Grant it (or, after a denial, Settings → Notifications → **Open settings**). Within a few seconds `adb`/DB shows one row in `user_push_devices` for the member (`GET /notifications/devices` lists it, without the token).
3. **Channels.** `adb shell dumpsys notification | grep -A6 com.tuneonus.onusfit` lists `remote-updates` (IMPORTANCE_HIGH, `mImportance=4`) plus the reminder channels.
4. **Foreground push.** Admin → Notifications → send to the member only. Banner appears; inbox updates without reopening; delivery moves to **Received**.
5. **Background push.** Background the app, send again. Notification in the shade; tap → opens the chosen screen; item is read; delivery **Received**.
6. **Killed app.** Swipe the app away, send, tap: app cold-starts through splash/auth, then opens the destination.
7. **Preferences.** Switch **Announcements** off, send an announcement: no push and no inbox item; admin detail shows it as skipped. Switch the master switch off: inbox item, no push.
8. **Token refresh.** Clear app data / reinstall and sign in: the old device row is replaced, not duplicated.
9. **Logout.** Sign out: the device row is deleted; a campaign sent afterwards does not reach the phone. Sign in as another account on the same phone: the token moves to that account.
10. **Invalid token.** Uninstall the app, send to that user: delivery `invalid_token`, device deactivated.
11. **Schedule / cancel.** Schedule 2 minutes ahead and cancel one; the other arrives on time (needs the service awake; see `backend/docs/notifications.md`).
12. **Hostile payloads** (backend-side impossible; only via FCM console): `{"url":"https://example.com"}` and `{"route":"changePassword","notificationId":"<uuid>"}` navigate nowhere.
13. **Local reminders** still fire (workout/water), and a reminder never produces an inbox item.

## 8. Tests

```
npm test                                                                      # whole suite
NODE_PATH=node_modules ../backend/node_modules/.bin/tsx --test tests/notifications-*.test.ts
```

`tests/notifications-remote-inbox.test.ts` (new) covers the inbox client, id/URL safety, destination allow-list, payload parsing, foreground de-duplication, cold-start taps, the receipt/read handlers, category preference rollback and ordering, the inbox store (including a late response after logout), and the device endpoint paths. The foundation tests were updated from Expo tokens to FCM tokens. Every test runs against fakes; none runs on a device.

## 9. Troubleshooting (device logs)

| Log line | Meaning | Fix |
| --- | --- | --- |
| `Push registration: failed { reason: endpoint-missing }`, and `404` on `/notifications*` | The server answering does not contain the notification routes, i.e. the deployed backend is older than `a5f47fb`. The app is classifying it correctly. `GET <api>/openapi.json` will have no `notif` paths. | Deploy the backend **and** run the release step `node dist/scripts/migrate.js` (migration `0018`). Foreground the app; registration retries by itself. |
| `Push registration: permission-required { canAskAgain: true }` | Signed in, but the OS permission has not been granted yet (the in-app offer is unanswered, or *Not now* was chosen). Not an error. | Answer the offer, or Settings → Notifications → Enable. |
| `expo-notifications: Custom sound 'default' not found in native app` | A channel was created with `sound: 'default'`. In SDK 58 `sound` is a raw-resource file name. | Omit `sound` for the system default sound (`null` = silent). Fixed in `notification-channels.ts`. |

Confirm a device is stored (DEV database; shows only a token prefix and its length, never the full token):

```sql
SELECT u.email, d.platform, d.status, left(d.push_token, 8) || '…' AS token_prefix, length(d.push_token) AS token_len,
       d.app_version, d.last_registered_at
  FROM user_push_devices d JOIN users u ON u.id = d.user_id
 ORDER BY d.last_registered_at DESC LIMIT 5;
```

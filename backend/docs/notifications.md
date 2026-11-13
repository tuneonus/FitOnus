# Notifications

Push notifications, an in-app inbox, per-category preferences and admin-managed campaigns.
Module: `src/modules/notifications` (migration `0018_create_notifications.sql`).

## What it does

| Area | Behaviour |
| --- | --- |
| Devices | A user may have several devices. `PUT /notifications/devices/:installationId` is an idempotent upsert keyed by (user, installation). A rotated FCM token replaces the old one in place. A token has exactly one owner: registering it on another account moves it. Tokens are never returned by any endpoint. |
| Preferences | Master switch = the existing `user_settings.notifications_enabled`. Per-category switches live in `notification_preferences`. Missing = on. |
| Inbox | `GET /notifications` (paginated, newest first, unread total), unread count, mark one/all read, soft delete. Every query is scoped to the caller's user id, so another user's id is simply "not found". |
| Campaigns (admin) | Draft, preview, edit (optimistic locking), send now, schedule, cancel (draft/scheduled only), per-device delivery list with error codes. |
| Delivery | FCM HTTP v1, server-side OAuth from a service account. Bounded retries with back-off. Dead tokens are deactivated. |

## Delivery states (what is and is not claimed)

`pending → processing → accepted | dry_run | failed | invalid_token`, and `accepted → received`.

* **accepted** only means FCM took the message. It does **not** mean the phone showed it.
* **received** is set only when the app confirms (`POST /notifications/:id/received`, or the user opens/reads the item). A push that was shown in the status bar and never tapped stays `accepted`. The admin UI says so.
* **dry_run** = validated by FCM with `validate_only`; nothing was delivered.

Campaign status: `draft → scheduled → sending → sent | partially_failed | failed`, or `cancelled`.
`sent` means every delivery reached a terminal non-failure state; a send to users with no registered device is `sent` with zero deliveries (inbox only).

## Security model

* Admin routes require `notifications:read` / `notifications:send`, enforced in the route spec (backend), not just hidden in the UI. Only the `admin` role holds them.
* Sending to everyone, to a segment, or to more than 25 hand-picked users needs `confirmBulk: true` (`422 BULK_CONFIRMATION_REQUIRED` otherwise).
* A send with nobody eligible is refused (`422 NO_ELIGIBLE_RECIPIENTS`); with no FCM configured it is refused (`503 PUSH_NOT_CONFIGURED`). Drafts always work.
* `Idempotency-Key` on create/send: a retried request replays instead of queuing a second campaign. Fan-out is additionally protected by unique `(campaign, user)` and `(notification, device)` constraints, and every status change is a guarded `UPDATE`.
* Navigation is a closed key list (`home`, `goals`, `challenges`, ...). A notification can never carry a route, URL or deep link; the app maps each key to a screen.
* Titles/bodies are length-limited and reject control characters. Categories the device schedules locally (`workout_reminders`, `habit_reminders`) cannot be sent by the server, so a reminder cannot arrive twice.
* Rate limits: device registration 40/15 min, inbox 300/15 min, admin sends 60/15 min (per bearer token, else per IP; in-memory, see "Multiple instances").
* The FCM key never leaves the process: not logged, not returned, not in `EXPO_PUBLIC_*`. Config errors name the variable only. Only Google token endpoints are trusted for the signed assertion.
* Every create/edit/schedule/cancel is written to `admin_audit_logs` (`notification.*`).

## Retries

A delivery gets at most `NOTIFICATIONS_MAX_ATTEMPTS` (default 4) sends. Retryable: FCM `UNAVAILABLE`, `INTERNAL`, `QUOTA_EXCEEDED`, 429/5xx, network errors, timeouts, and OAuth/permission problems (our configuration). Back-off 30 s, 60 s, 120 s ... capped at 15 min; a longer `Retry-After` wins. Permanent: other 4xx. `UNREGISTERED`/malformed token → `invalid_token` and the device is deactivated (it reactivates if the app registers again). A worker that died mid-send leaves a lease that expires; if the attempt budget is already spent the delivery is failed rather than re-sent.

## Scheduling (infrastructure requirement)

Scheduled and "send now" campaigns run in an in-process dispatcher (`NOTIFICATIONS_DISPATCHER_ENABLED`, default on) that polls every `NOTIFICATIONS_POLL_INTERVAL_MS`. It is safe on any number of instances (`FOR UPDATE SKIP LOCKED` leases).

**The process must be awake.** On a host that sleeps idle instances (Render free tier), a campaign scheduled for 09:00 is only sent when something wakes the service. Either run the web service on an always-on plan, or add a cron job that calls

```
POST /api/v1/internal/notifications/dispatch
X-Dispatch-Secret: <NOTIFICATIONS_DISPATCH_SECRET>
```

every minute (answers 404 if the secret is unset or wrong). Late campaigns are sent on the next run, never dropped.

## Environment variables (names only)

`FCM_SERVICE_ACCOUNT_JSON` or `FCM_SERVICE_ACCOUNT_BASE64`, `FCM_PROJECT_ID` (optional), `FCM_DRY_RUN`, `FCM_REQUEST_TIMEOUT_MS`, `NOTIFICATIONS_DISPATCHER_ENABLED`, `NOTIFICATIONS_POLL_INTERVAL_MS`, `NOTIFICATIONS_MAX_ATTEMPTS`, `NOTIFICATIONS_DISPATCH_SECRET`.

### Credentials: EAS vs Render

The FCM V1 key uploaded to **EAS** is used by Expo's push service and by EAS builds. This backend does **not** go through Expo's service, so it cannot read that key: **each Render service that sends needs its own copy of a service-account key** for the same Firebase project as `mobile/google-services.json`.

Setup (DEV, no new credentials needed if you reuse the existing key file):

1. Take the existing Firebase service-account JSON (Firebase console → Project settings → Service accounts; the account needs the *Firebase Cloud Messaging API (V1)* send permission).
2. `base64 -w0 service-account.json` and store the result as the secret `FCM_SERVICE_ACCOUNT_BASE64` on the DEV Render service (Environment → secret). Do not paste it into a file in the repo.
3. Set `FCM_DRY_RUN=true` first. Create a campaign to yourself; the delivery should read `dry_run`. Then set it to `false` for a real test.
4. Run migration `0018` against DEV (`npm run db:migrate`) **before** deploying this code.

## Known limits

* In-memory rate limiters are per instance.
* Android only is exercised; `platform: 'ios'` is accepted but APNs is not configured.
* Receipt confirmation only happens when the app is open or the user taps; background-shown, untapped pushes stay `accepted`.

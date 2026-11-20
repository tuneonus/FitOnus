# Notifications

Push notifications, an in-app inbox, per-category preferences and admin-managed campaigns.
Module: `src/modules/notifications` (migrations `0018_create_notifications.sql`, `0021_add_notification_campaign_image.sql`, `0022_allow_webp_notification_image_keys.sql`).

## What it does

| Area | Behaviour |
| --- | --- |
| Devices | A user may have several devices. `PUT /notifications/devices/:installationId` is an idempotent upsert keyed by (user, installation). A rotated FCM token replaces the old one in place. A token has exactly one owner: registering it on another account moves it. Tokens are never returned by any endpoint. |
| Preferences | Master switch = the existing `user_settings.notifications_enabled`. Per-category switches live in `notification_preferences`. Missing = on. |
| Inbox | `GET /notifications` (paginated, newest first, unread total), unread count, mark one/all read, soft delete. Every query is scoped to the caller's user id, so another user's id is simply "not found". |
| Campaigns (admin) | Draft, preview, edit (optimistic locking), send now, schedule, cancel (draft/scheduled only), per-device delivery list with error codes. |
| Templates (admin UI only) | The admin console offers a few starter templates (`admin/src/features/notifications/templates.ts`). A template prefills title, message, category and tap destination in the composer and **nothing else**: no recipients, no saved state, no API of its own, no database table. The admin picks the audience, previews, and confirms before the normal campaign API above is called. Template text must be complete as written: the backend does not substitute placeholders. |
| Images (Android) | A campaign may carry one optional picture (JPEG, PNG, WebP or HEIC upload), converted to an optimized WebP without metadata, stored in the public R2 bucket and sent as the FCM Android "big picture" (as a JPEG copy). Text-only campaigns are unchanged. See [Notification images](#notification-images). |
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
* Images: only an `imageKey` (`onusfit/notifications/<32 hex>.webp`, or the legacy `notifications/<32 hex>.jpg|png`) is ever accepted or stored, never a URL. The request schemas are strict, so an `imageUrl` field is rejected as an unknown key, and a key that is not exactly one of those shapes is rejected. Uploaded files are decoded and re-encoded, never stored as received. The URL is built by the server from `R2_PUBLIC_BASE_URL`. See [Notification images](#notification-images).
* Rate limits: device registration 40/15 min, inbox 300/15 min, admin sends 60/15 min (per bearer token, else per IP; in-memory, see "Multiple instances").
* The FCM key never leaves the process: not logged, not returned, not in `EXPO_PUBLIC_*`. Config errors name the variable only. Only Google token endpoints are trusted for the signed assertion.
* Every create/edit/schedule/cancel is written to `admin_audit_logs` (`notification.*`).

## Retries

A delivery gets at most `NOTIFICATIONS_MAX_ATTEMPTS` (default 4) sends. Retryable: FCM `UNAVAILABLE`, `INTERNAL`, `QUOTA_EXCEEDED`, 429/5xx, network errors, timeouts, and OAuth/permission problems (our configuration). Back-off 30 s, 60 s, 120 s ... capped at 15 min; a longer `Retry-After` wins. Permanent: other 4xx. `UNREGISTERED`/malformed token → `invalid_token` and the device is deactivated (it reactivates if the app registers again). A worker that died mid-send leaves a lease that expires; if the attempt budget is already spent the delivery is failed rather than re-sent.

## Scheduling (infrastructure requirement)

Scheduled and "send now" campaigns run in an in-process dispatcher (`NOTIFICATIONS_DISPATCHER_ENABLED`, default on) that polls every `NOTIFICATIONS_POLL_INTERVAL_MS`. It is safe on any number of instances (`FOR UPDATE SKIP LOCKED` leases).

**`NOTIFICATIONS_DISPATCHER_ENABLED=false` stops the polling timer only. It does not make the server unable to send.** Creating a "send now" campaign still runs one dispatch pass immediately, and a pass sends *every* campaign that is due, not just the new one; the internal `/dispatch` endpoint does the same. To run a server that cannot send a real push (a local run against a shared database, for instance), remove the push credentials instead: leave **both** `FCM_SERVICE_ACCOUNT_JSON` and `FCM_SERVICE_ACCOUNT_BASE64` empty (the config accepts either, so blanking one while the other is set in `.env` leaves push on). Sends are then refused with `503 PUSH_NOT_CONFIGURED` and drafts still work. `FCM_DRY_RUN=true` is the other safe choice: FCM validates each message and delivers nothing.

**The process must be awake.** On a host that sleeps idle instances (Render free tier), a campaign scheduled for 09:00 is only sent when something wakes the service. Either run the web service on an always-on plan, or add a cron job that calls

```
POST /api/v1/internal/notifications/dispatch
X-Dispatch-Secret: <NOTIFICATIONS_DISPATCH_SECRET>
```

every minute (answers 404 if the secret is unset or wrong). Late campaigns are sent on the next run, never dropped.

## Environment variables (names only)

`FCM_SERVICE_ACCOUNT_JSON` or `FCM_SERVICE_ACCOUNT_BASE64`, `FCM_PROJECT_ID` (optional), `FCM_DRY_RUN`, `FCM_REQUEST_TIMEOUT_MS`, `NOTIFICATIONS_DISPATCHER_ENABLED`, `NOTIFICATIONS_POLL_INTERVAL_MS`, `NOTIFICATIONS_MAX_ATTEMPTS`, `NOTIFICATIONS_DISPATCH_SECRET`.

Images (all five or none): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`; optional `R2_REQUEST_TIMEOUT_MS` and `IMAGE_HEIC_ENABLED` (default `true`; `false` refuses HEIC uploads).

### Credentials: EAS vs Render

The FCM V1 key uploaded to **EAS** is used by Expo's push service and by EAS builds. This backend does **not** go through Expo's service, so it cannot read that key: **each Render service that sends needs its own copy of a service-account key** for the same Firebase project as `mobile/google-services.json`.

Setup (DEV, no new credentials needed if you reuse the existing key file):

1. Take the existing Firebase service-account JSON (Firebase console → Project settings → Service accounts; the account needs the *Firebase Cloud Messaging API (V1)* send permission).
2. `base64 -w0 service-account.json` and store the result as the secret `FCM_SERVICE_ACCOUNT_BASE64` on the DEV Render service (Environment → secret). Do not paste it into a file in the repo.
3. Set `FCM_DRY_RUN=true` first. Create a campaign to yourself; the delivery should read `dry_run`. Then set it to `false` for a real test.
4. Run migration `0018` against DEV (`npm run db:migrate`) **before** deploying this code.

## Notification images

Android push notifications can carry one picture (FCM `android.notification.image`, shown as the expanded "big picture"). iOS is out of scope: the image is set on the Android block only and iOS devices receive the text as before.

**Storage policy.** Every image the backend writes to the public bucket follows one policy (`src/shared/images`, `src/shared/storage`), described for all features in [media.md](media.md) (notifications, exercises and workout template covers share the same uploader, processor and store):

* one root prefix, `onusfit/`, then one folder per feature (`onusfit/notifications/`, `onusfit/exercises/` and `onusfit/workouts/`);
* every stored image is an optimized **WebP**, named by 128 random bits: `onusfit/<feature>/<32 hex>.webp`;
* the bucket is public, so the list of features is closed and holds only admin-authored content. **Private member images (meal photos, progress photos, avatars) are never stored in this bucket**, and nothing in the image code can be pointed at them;
* objects written before this policy are never moved, rewritten or deleted.

**Flow.** The admin composer uploads the file to the backend, which validates it, converts it, stores it and answers with an `imageKey` and the public `imageUrl` (of the WebP). Saving or sending the notification then carries only the key. At send time the dispatcher turns the key into a URL and passes it to FCM.

| Rule | Value |
| --- | --- |
| Endpoint | `POST /api/v1/admin/notifications/images`, permission `notifications:send`, admin rate limit |
| Body | The raw file (not JSON or multipart). `Content-Type: image/jpeg`, `image/png`, `image/webp`, `image/heic` or `image/heif`. The declared type only decides whether the body is read at all |
| Accepted | JPEG, PNG, WebP and HEIC (HEIF holding HEVC, what iPhones write). The format is decided from the file's own bytes; the declared type and the file name are never trusted, and a mismatch (a JPEG sent as `image/png`) is harmless because the file is re-encoded either way |
| Refused | GIF, AVIF, SVG, TIFF, BMP, PDF, animated images, a bare HEIF without an HEVC brand, anything unrecognised, and any file that does not fully decode (a good header is not enough). Refused formats never reach the image library |
| Size | At most 10 MiB (10,485,760 bytes) uploaded, enforced while streaming; larger answers `413`. This is separate from `BODY_LIMIT`, which only governs JSON bodies |
| Pixels | At most 8192 px on a side and 40 megapixels (HEIC: 16 megapixels, because it is decoded in WebAssembly). A 12 MP phone photo is fine |
| Conversion | Fully decoded, EXIF orientation applied (for HEIC, the rotation the file records), then **all metadata removed** (EXIF including GPS and camera details, XMP, embedded colour profile, thumbnails) and colours converted to sRGB; scaled down to 1440 px on the long side (never enlarged); WebP quality 80. A PNG's transparency is kept |
| Push copy | A baseline **JPEG** of the same picture is stored beside the WebP: at most 1440 px, quality 82 stepping down to 45 and then a smaller picture until it is under 1,000,000 bytes; transparency is flattened onto white |
| Object keys | WebP `onusfit/notifications/<32 hex>.webp` (the only thing a campaign stores); push copy `onusfit/notifications/<32 hex>.push.jpg` (computed from the key, never stored). The server generates the names: a client cannot choose one, overwrite an object or write outside `onusfit/notifications/` |
| Legacy keys | `notifications/<32 hex>.jpg` / `.png`, written before the policy. They stay valid and keep resolving to the same public URL; they are sent to FCM as they always were |
| Storage | Bucket `R2_BUCKET` (`fitonus-media`), `Cache-Control: public, max-age=31536000, immutable` (the name is never reused). The push copy is written first and the WebP last, so a failure part way leaves at most an unreferenced JPEG, never a key a notification could use |
| Database | `notification_campaigns.image_key`, nullable. A `CHECK` pins the two key shapes above (migration `0021` added the column with the legacy shape, `0022` widened the `CHECK`) |

**Why FCM gets a JPEG, not the WebP.** The FCM REST reference (`Notification.image`) says "JPEG, PNG, BMP have full support across platforms", "WebP and HEIF have varying levels of support across platforms and platform versions", and "Android has 1MB image size limit". The WebP is the canonical copy (what the admin console shows); the push carries the JPEG beside it. The push URL is always `.push.jpg` for a new image and the original URL for a legacy one. **Not yet confirmed on a real device.**

**HEIC.** Sharp's prebuilt binaries cannot decode HEVC, so HEIC is decoded with `libheif-js` (libheif compiled to WebAssembly) and handed to Sharp. It takes about 4 s and 180 MB for a 12 MP photo, so decodes run one at a time. libheif-js is LGPL-3.0 and decoding HEVC can carry patent-licensing obligations for a commercial service: set `IMAGE_HEIC_ENABLED=false` to switch it off. HEIC uploads then answer `415 UNSUPPORTED_MEDIA_TYPE` ("HEIC images are not enabled on this server") and JPEG, PNG and WebP still work.

**Errors.** `415 UNSUPPORTED_MEDIA_TYPE` (declared type not accepted, or HEIC switched off), `413 PAYLOAD_TOO_LARGE`, `422 INVALID_IMAGE` (the message says what is wrong: "The file is a GIF", "damaged or incomplete", too many pixels, animated), `503 IMAGE_STORAGE_NOT_CONFIGURED` (no `R2_*` variables), `503 IMAGE_STORAGE_UNAVAILABLE` (R2 failed; the response never says why, the server log carries the HTTP status only). The image library's own error text is never returned. Unauthenticated requests answer `401` and members `403` before the body is read, so an unauthorized caller never makes the server buffer a file.

**Using an image.** `imageKey` is accepted by create, edit (drafts only) and preview. An edit replaces the whole draft, so an edit without `imageKey` removes the image. Before a notification is queued (send now, schedule, or sending a saved draft) and on preview, the server checks that **every object the notification needs** exists: for a new image both the WebP and its push JPEG (`422 IMAGE_NOT_FOUND` otherwise, so a half-written pair is never sent without a picture); for a legacy image its one file. Saving a draft does not call R2. That check is the last step, so a request that would fail anyway never reaches R2. Nothing is queued when it fails. The list and detail views show the WebP; the review step shows the JPEG the phone will receive.

**Compatibility.** A notification without an image behaves exactly as before: the same FCM payload byte for byte, the same idempotency fingerprint (so a retry spanning a deploy still replays), no call to R2. The inbox is unchanged; the image is a push-time extra. If the media domain is later unconfigured, existing campaigns keep their key but show no URL and are sent as text.

**Audit.** `notification.image_upload` (key, source format, source and stored sizes, push copy size, dimensions; never a URL or file content) and `hasImage` on create/edit/schedule entries.

### Setup (DEV first)

1. Create an R2 API token limited to **Object Read & Write on `fitonus-media` only**. Do not reuse an account-wide token.
2. Confirm the bucket's public custom domain (`media.tuneonus.com`) is active: `curl -I https://media.tuneonus.com/` answers from Cloudflare over valid TLS (404 for `/` is normal).
3. Run migrations `0021` **and** `0022` against DEV (`npm run db:migrate` applies pending migrations in order, so both go in one run) **before** deploying this code. Both are metadata-only: one nullable column, then a wider `CHECK` over the few existing rows. Code from before them ignores the column. `0021` alone is not enough (see below).
4. Set the five `R2_*` variables as secrets on the service (the access key and secret in the secret store, never in the repo or any `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` variable). The server fails to start, naming the variable and rule but never a value, if only some are set or a value is malformed. `IMAGE_HEIC_ENABLED` is optional (default `true`).
5. Upload an image in the admin console, then `curl -I` the returned URL and its `.push.jpg` sibling: expect `200`, the right `content-type` (`image/webp`, `image/jpeg`) and the `cache-control` above.
6. Send to your own device with `FCM_DRY_RUN=true` first (FCM validates the message), then for real, and confirm on the phone that the picture is drawn.

### If the migrations have not been applied

New code on a database that is behind fails in recognisable ways. Each is fixed by applying the missing migration, and none needs a code change or a restart:

| Schema state | What happens |
| --- | --- |
| Before `0021` | `GET /admin/notifications` answers 500; the log shows `ZodError ... imageKey: expected string, received undefined` (the list reads `SELECT *`, the table has no `image_key`). `POST`/`PATCH` answer 500; the log shows PostgreSQL error `42703` (`column "image_key" ... does not exist`) |
| `0021` applied, `0022` not | Everything works except saving a notification with a **new** image: the upload succeeds, but the database's `CHECK` still allows only the legacy key shape, so create/edit answer `409 CONFLICT` ("The request violates a data integrity rule", naming no table or constraint) and nothing is saved. Text notifications, legacy-keyed notifications and dispatching are unaffected |
| `0022` applied | Both key shapes are accepted; no existing row is rewritten |

Reads treat a missing column as "no image", so the list still loads while the schema is behind; creating, editing and **sending** do not work until `0021` is applied (the dispatcher selects the column too, so a due campaign simply waits and is sent after the migration). Check the state with `SELECT max(version) FROM schema_migrations` (it must be at least 22). Do not use `npm run db:migrate:status` against a shared database just to look: it runs `CREATE TABLE IF NOT EXISTS schema_migrations` first.

### Things to know

* **The bucket is public.** Anything uploaded is readable by anyone with the URL. Only admin-authored artwork belongs here; never upload a member's photo (meal photos, progress photos, avatars). The upload route is admin-only and nothing else in the backend writes to this bucket.
* **Metadata is removed from new uploads.** Images uploaded before the policy (legacy keys) were stored exactly as uploaded and may still carry EXIF, including GPS. They are left as they are on purpose (see the next point); an admin who wants one gone can upload it again, and the old object is then removed from the bucket by hand.
* **Files are never deleted.** Replacing or removing an image on a draft only changes the reference. An image may still be in use by a sent notification, so deleting by reference would break it; abandoned uploads (an image chosen and never saved), including a push JPEG left behind by a failed upload, remain in the bucket. Clean-up needs a reconciliation job and is not built. No migration of existing objects to WebP is done either.
* **Cost of an upload.** The conversion runs in the request, in Sharp's thread pool. A typical photo takes a fraction of a second; the worst case, a picture of pure noise that cannot be compressed, takes about 3 s of CPU because the JPEG copy is retried at lower quality and size until it fits. Uploads are admin-only and rate limited. The server's 30 s request timeout also applies to receiving the file, so a connection too slow to deliver 10 MB in that time is cut off.
* **No R2 SDK.** The R2 client is a small AWS Signature V4 signer over `fetch` (`src/shared/storage`), verified against AWS's published examples. Redirects are refused, so a signed request can only reach the endpoint it was signed for. The image libraries are `sharp` and `libheif-js`.

## Known limits

* In-memory rate limiters are per instance.
* Android only is exercised; `platform: 'ios'` is accepted but APNs is not configured. Notification images are Android only, and the WebP/JPEG delivery has not yet been confirmed on a real device.
* On Android the image is drawn by the system when the app is in the background or closed. Whether it is drawn while the app is open is up to the app's foreground handler, which this change does not touch.
* Receipt confirmation only happens when the app is open or the user taps; background-shown, untapped pushes stay `accepted`.

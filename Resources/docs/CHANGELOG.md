# Changelog

All notable changes to the FitOnus project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Notification images (Android): an admin can attach one optional picture to a notification, uploaded as JPEG, PNG, WebP or HEIC (iPhone photos), up to 10 MiB and 8192 px a side. The composer gains an image field with preview, replace and remove; the history list shows thumbnails; the detail view and the review step show the image. Every upload is decoded and re-encoded by the backend (`sharp`, plus `libheif-js` for HEIC): the stored result is an optimized WebP, at most 1440 px on the long side, with orientation applied and **all metadata (EXIF including GPS, XMP, colour profile) removed**; formats such as GIF, SVG, AVIF, TIFF, BMP and PDF, animated images and damaged files are refused. Images follow a single storage policy in the public Cloudflare R2 bucket `fitonus-media`: `onusfit/<feature>/<random>.webp`, with private member images never stored there. A notification's push carries a JPEG copy of the picture (`<same name>.push.jpg`, under 1,000,000 bytes) as `android.notification.image`, because FCM documents only JPEG, PNG and BMP as fully supported (WebP and HEIF "varying levels") and limits Android images to 1 MB; delivery on a real device is not yet confirmed. Existing keys (`notifications/<hex>.jpg|png`) stay valid and keep their public URLs, and no existing object is moved, rewritten or deleted. Endpoint: `POST /api/v1/admin/notifications/images` (raw body, `notifications:send`). Campaigns store only the object key (nullable column `image_key`, migration `0021`; migration `0022` widens its `CHECK` to the new key shape, so **both must be applied before deploying**), the public URL is built from the configured media domain, and arbitrary external image URLs are rejected. `IMAGE_HEIC_ENABLED=false` switches HEIC off (LGPL/patent consideration). The R2 client is a small SigV4 signer over `fetch`. Without the five `R2_*` variables, uploads answer 503 and text-only notifications behave exactly as before. iOS images, mobile app changes and orphaned-file cleanup are out of scope. See `backend/docs/notifications.md`.
- Exercise images: an admin can upload a picture for an exercise (JPEG, PNG, WebP or HEIC, up to 10 MiB), with the same conversion as notification images: one optimized WebP, at most 1600 px on the long side, all metadata removed, stored in the public Cloudflare R2 bucket under `onusfit/exercises/<random>.webp` (`POST /api/v1/admin/workouts/exercises/images`, raw body, `admin:access`, its own rate limit, audit action `workout.exercise.image_upload`). Migration `0023` adds the nullable `exercises.image_key` (with a CHECK on the key shape); `image_url` and `video_url` are preserved. The exercise API keeps `imageUrl` as "the picture to display" (the uploaded image when there is one, otherwise the external address), so **the mobile app needs no change**, and adds `imageKey` and `externalImageUrl` for the admin editor. Saving a new key verifies the object exists in storage (`422 IMAGE_NOT_FOUND`, `503` when storage cannot answer). In the admin console the exercise form gains image upload, preview and removal beside the external address field (with a note on which picture the app will show and a warning for http addresses), and the exercise table shows the stored picture as a thumbnail. Replacing or removing a picture only changes the reference: no object is ever deleted (cleanup is designed in `backend/docs/media.md` but not built). See `backend/docs/media.md`.
- A route can declare its own request body limit (`bodyLimit` in its route spec), read after authentication; the application-wide JSON parser skips exactly those routes. See `backend/docs/media.md`.
- Admin notification templates: a "Start from a template" picker on the Notifications page opens the existing composer with a template's title, message, category and tap destination prefilled. A template never selects recipients and has no API or database table; sending still goes through the existing permission-checked campaign endpoints behind the review step and confirmation dialog. The composer also now rejects control characters client-side (as the backend does), refuses a second save/send while one is in flight, words the confirmation without promising delivery, and reports a send whose answer was lost (timeout, dropped connection) as "outcome unknown" instead of "failed". No backend, database or mobile change.
- AI observability (Phase 9): structured JSON logs in the Python AI backend with the same field names as the Node API, a correlation id sent from Node to Python (`X-Correlation-Id`), a shared error-category vocabulary, events for coach insights cache hits and deterministic fallbacks, and log-redaction tests; learning guide `ai/learning/07-ai-observability.md`. No behavior, API, database or deployment change.
- Initial project documentation suite (docs 01-27).
- Project governance documents (README, AGENT_RULES, DEVELOPMENT_WORKFLOW, ARCHITECTURE_DECISIONS).
- Foundational repository structure for mobile and backend.

### Changed
- Reduced documentation to agent instructions, product requirements, component guides, retained feature designs, and operational references; refreshed the documentation index and admin setup guide.
- Organized release notes under `Resources/docs/releases/`, project reports under `Resources/docs/reports/`, and component audits and phase reports under each component's `docs/audits/` and `docs/reports/` folders.
- Added a repository README and documentation index with placement rules; updated moved-document references.
- Exercise image and video addresses accept only absolute http or https URLs (at most 2048 characters). `javascript:`, `data:`, `file:`, `ftp:` and relative addresses are now refused with a 400, and a stored value that is not http(s) is never passed on to an app. Addresses already stored stay valid.
- The meal photo scanner (`POST /nutrition/meal-photo/analyze`, 11 MiB), voice meal entry (`POST /nutrition/voice-meal/parse`, 16 MiB) and coach transcription (`POST /coach/transcribe`, 16 MiB) carry a base64 photo or audio clip in JSON and now have a body limit of their own, derived from the cap each use case enforces and read only after sign-in. They no longer depend on raising the global `BODY_LIMIT` (default 100 kB), which can stay small for every other route.
- The image upload logic (validation, conversion, storage, error messages) moved out of the notifications module into shared code used by notifications and exercises, and the admin image field, file rules and thumbnail into `admin/src/features/media/`. Behaviour and messages of notification images are unchanged.

### Removed
- Removed historical audit, implementation, and test reports plus UI review screenshots and generated evidence files. Their committed versions remain available in Git history.
- Removed an unused duplicate notification image and local generated cache files.

### Fixed
- Migrations `0019_add_coach_message_feedback.sql` and `0020_add_gemini_fallback_model.sql` were never committed: the 2026-11-18 change that added the `*.sql` ignore rule also added the code that needs them. They are now tracked, the rule has an exception for `backend/migrations/`, and a unit test guards it.
- Integration tests simulated "AI backend unreachable" with port 9, which `fetch` blocks (no `ECONNREFUSED`, so the quota refund path was never taken); they now use a port that refuses connections. One rate-limit test expected an envelope the limiter had intentionally changed (`details.retryAfterSeconds`) and was updated.
- CI now also runs for `development` (push and pull request).

### Security
- Exercise `imageUrl` and `videoUrl` could be set through the admin API to any URL scheme, including `javascript:`, `data:` and `file:` (only the admin form restricted them to http and https). The API now enforces the same rule.
- Large request bodies are no longer read from signed-out callers on the AI photo and audio routes: the bigger limit applies only after authentication.

---

## [0.1.0] - YYYY-MM-DD
*(Template for future releases)*

### Added
- [Feature description]

### Changed
- [Modification description]

### Removed
- [Deprecation/Removal description]

### Fixed
- [Bug fix description]

### Security
- [Security patch description]

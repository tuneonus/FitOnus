# Private member media (avatars and progress photos)

How the backend keeps the pictures a member takes of themselves: their profile picture and their progress photos. These
are **private**: stored in a separate bucket, readable only through short-lived signed URLs that the backend issues after
checking whose picture it is, never reachable through the public media domain, and never visible to an admin.

The public bucket (admin-authored artwork) is a different system with a different policy: see [media.md](media.md). The
two share the image decoding pipeline and nothing else.

Code: `src/shared/private-media` (policy, processor, uploader, URLs, deletion queue and worker, configuration),
`src/shared/storage` (`private-object-store.ts`, `r2-private-object-store.ts`, `sigv4-presign.ts`),
`src/modules/profile` (avatar) and `src/modules/progress` (photos).

## Setup (DEV first)

1. In the Cloudflare dashboard open **R2 > Manage API tokens > Create API token**. Permission **Object Read & Write**,
   scoped to **the private bucket only** (DEV: `tuneonus-private`). Copy the S3 **Access Key ID** and **Secret Access
   Key** (not the "Token value"). The token of the public bucket cannot be reused: it is scoped to that bucket, and
   configuration refuses to start if the two tokens are the same.
2. Leave the bucket's **Public access disabled**: no r2.dev subdomain, no custom domain. A private bucket has no public
   address by design. No CORS rule is needed (the app is native).
3. Set the variables in the **backend environment only** (`backend/.env` locally, the host's secret store elsewhere).
   Credentials never go in a client app, a repository file or a log.

| Variable | Value | Notes |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | the Cloudflare account id | shared with the public bucket's settings |
| `R2_PRIVATE_BUCKET` | `tuneonus-private` (DEV) | PROD sets its own bucket; the code has no environment names |
| `R2_PRIVATE_ACCESS_KEY_ID` | token key id | secret |
| `R2_PRIVATE_SECRET_ACCESS_KEY` | token secret | secret |
| `PRIVATE_MEDIA_URL_TTL_SECONDS` | `900` (60 to 3600) | lifetime of a signed picture URL; default 15 minutes |
| `PRIVATE_MEDIA_PURGE_ENABLED` | `true` | run the deletion worker in this process |

* `R2_ACCOUNT_ID` is shared with the public bucket. Setting it alone does **not** turn the public bucket on, so a
  deployment can configure private media without a public bucket (and the reverse).
* `PRIVATE_MEDIA_PURGE_ENABLED=false` keeps *this process* from deleting on its own: no background loop, and a request no
  longer nudges the worker. Queued objects then wait for another instance's loop (or an explicit `drain()`), so leave it
  `true` unless exactly one other instance runs the worker.
* The three `R2_PRIVATE_*` values are **all or none**. None set = private media off: avatar and photo routes answer
  `503 PRIVATE_STORAGE_NOT_CONFIGURED` (the avatar `GET` answers "no picture") and nothing else is affected.
* Startup **fails** if the private bucket is the public one (`R2_BUCKET`), if the private token is the public token, or if
  `R2_PRIVATE_PUBLIC_BASE_URL` is set.
* Use a separate private bucket (and token) for each environment: DEV pictures never belong in PROD's bucket.

## Where it is wired

* `src/config/env.ts` reads the variables (`parsePrivateMediaConfig`) and refuses an invalid or conflicting set at startup.
* `src/container.ts` (the composition root) builds `createPrivateMedia(...)` once, from the same `ImageProcessor` the public
  features use, and hands it, with the `memberImageUploads` rate limiter (30 uploads per window per member), to the profile
  and progress modules. `ContainerOverrides.privateStore` lets a test replace the store.
* `src/server.ts` starts the purge worker after the container is built and stops it (waiting for the pass in progress) on
  shutdown.
* Not configured: `container.privateMedia` is `null` and the routes answer as described under Setup; nothing else changes.

## What is stored, and where

`members/<owner user id>/<avatar|progress>/<32 random hex>.webp`, plus its thumbnail `<same name>.thumb.webp`.

* The owner's id is in the key, and a database `CHECK` on every table refuses a key that is not that row's own. The 128
  random bits are chosen by the server and never reused: **a replacement is always a new key**, which is what keeps client
  caches correct (see the `version` field below).
* Tables store the key, never a URL. `member_avatars` (one row per user), `progress_photos` (many, at most 50 per user).
* Every object carries `Cache-Control: private, max-age=31536000, immutable`.

| Picture | Stored image | Thumbnail |
| --- | --- | --- |
| Avatar | centre square, at most 400 px, WebP | 128 px square |
| Progress photo | whole picture, at most 1600 px long side, WebP | 200 px wide |

Uploads go through the shared decoder (`ImageProcessor`), unchanged: format from the bytes (JPEG, PNG, WebP, HEIC),
fully decoded, 10 MiB / 8192 px / 40 MP limits, animated images refused, EXIF orientation applied, then **all metadata
removed, GPS included**. The private processor only crops and resizes its validated output. A test pins that the shared
profile it draws from stays big enough.

## API

All routes need a signed-in member. None takes a member id: **the owner is always the session**. Uploads are a **raw
body** (the image itself, `Content-Type: image/jpeg|png|webp|heic`, up to 10 MiB) with metadata in the query string;
the route's authentication and rate limit run before a byte is read. Responses carry `Cache-Control: private, no-store`.

| Route | Purpose | Notes |
| --- | --- | --- |
| `GET /api/v1/profile/avatar` | my picture, or `avatar: null` | fresh signed URLs each call |
| `PUT /api/v1/profile/avatar` | set or replace | replaces and removes the old files |
| `DELETE /api/v1/profile/avatar` | remove | idempotent |
| `GET /api/v1/progress/photos` | my gallery, newest day first | thumbnails only; `count`, `limit`, `nearLimit` |
| `POST /api/v1/progress/photos?takenOn=YYYY-MM-DD&tag=front\|side\|back\|other` | add | `201`; date defaults to today (UTC); not before 2000 or after tomorrow |
| `GET /api/v1/progress/photos/:id` | one photo with its full-size URL | another member's id is a `404` |
| `DELETE /api/v1/progress/photos/:id` | delete for good | another member's id is a `404` |

Errors: `415 UNSUPPORTED_MEDIA_TYPE`, `413 PAYLOAD_TOO_LARGE`, `422 INVALID_IMAGE`, `409 PHOTO_LIMIT_REACHED`,
`404 PHOTO_NOT_FOUND`, `429`, `503 PRIVATE_STORAGE_NOT_CONFIGURED`, `503 PRIVATE_STORAGE_UNAVAILABLE` (storage failed; the
response never says why).

Pictures are returned as `{ version, url, thumbnailUrl, expiresAt }`:

* `url` and `thumbnailUrl` are **GET-only signed URLs** valid until `expiresAt` (15 minutes by default). They are
  credentials: never logged, never stored. The app asks for fresh ones a minute before they expire, or when a picture fails
  to load.
* `version` changes whenever the picture is replaced. **Clients key their image cache by id and `version`, never by URL
  and never by id alone**: the URL changes on every request (nothing would be reused), and a replaced picture keeps its id
  (the old picture would stay on screen).
* The gallery list carries thumbnail URLs only; the full-size URL comes from `GET /photos/:id`, so a list never hands out
  the means to fetch fifty full-size pictures.

### Privacy rules

* Every query is scoped to the session's user id; a photo is found by `(id, owner)` in one query, so a foreign id is
  indistinguishable from a missing one.
* The only code that makes a URL (`PrivateImageUrlIssuer`) refuses a key that is not this owner's canonical key of this
  kind; a corrupt row shows nothing and signs nothing.
* **No admin route reads member pictures**, and the admin console has no access to this bucket or these tables.
* Logs and audit entries never contain a key, a URL or picture content.

### The limit of 50 photos

Enforced by the database (a `BEFORE INSERT` trigger that takes a per-member advisory lock and counts, migration 0027), so
no code path can exceed it and two uploads racing at 49 cannot both succeed. The application checks first, before the
photo is read or converted, so a member at the limit gets `409` immediately. The responses carry `nearLimit` from 45.
`PROGRESS_PHOTO_LIMIT` in `src/modules/progress/domain/progress-photo.ts` and the trigger must agree; a test pins both.

## Lifecycle: nothing is orphaned, nothing public is touched

Deleting is real (not a soft delete): a "deleted" private photo left in storage would contradict the member's choice.

1. **Records the removal in the same transaction.** Triggers on `member_avatars` (delete, or `object_key` changed) and
   `progress_photos` (delete) insert the old picture **and its thumbnail** into `private_media_deletions` (migration 0025).
   Triggers also fire for **cascades**, so deleting an account removes every row of the member *and* queues every one of
   their objects, atomically: a rolled-back deletion queues nothing.
2. **Deletes afterwards.** `PrivateMediaPurger` runs in the server process: it is nudged after each commit (so the object
   normally disappears within a second) and polls every 30 s for everything else (a crash between commit and nudge, an
   account deletion, an outage). `FOR UPDATE SKIP LOCKED` with a lease makes several instances safe.
3. **Retries until storage accepts.** A failed delete is counted and retried with exponential backoff (30 s up to 6 h) and a
   coarse reason (`Private storage delete failed (http HTTP 503)`; never a URL). A `404` from storage counts as done, so a
   retry after a crash is harmless.
4. **Replacing** stores the new pair under a new key first, then one statement points the row at it (the trigger queues
   the old pair). If the row cannot be saved, the new pair is removed again, or queued if even that fails, and the old
   picture keeps working.

Why this differs from the public bucket's "nothing is ever deleted" rule ([media.md](media.md#replacing-and-removing-nothing-is-ever-deleted)):
there, whether an object is still referenced is a guess across several tables; here the member asked for exactly this
object to go, and the database says so itself. The public side is unchanged and cannot be affected:

* the queue table admits only private keys (`CHECK`), and the worker also checks, then calls the **private** store;
* the private store accepts only private keys and is bound to the private bucket with its own token; the public store still
  has only `put` and `exists`;
* `tests/unit/private-media/store-separation.test.ts` fails if either side starts referring to the other.

Look at the queue: `SELECT object_key, attempts, next_attempt_at, last_error FROM private_media_deletions ORDER BY queued_at;`
An empty table is healthy. Rows with a high `attempts` mean storage or the token needs attention.

### Known gap

If an upload stores its files and then **both** the database save and the cleanup (delete and queue) fail at the same moment,
the files stay in the private bucket with no row pointing at them. They are never shown to anyone, but they are not removed
either. This needs storage and the database to fail together; a reconciliation that lists the bucket against the tables
would remove them. It is not built; the bucket's `members/` prefix and the owner id in every key make it straightforward.

## Setup and migrations

1. Apply `0025`, `0026`, `0027` **before** deploying the code, in order (see [database.md](database.md)). The runner applies
   every pending file in version order, so if `0024` (workout template covers) is still pending it is applied first; the
   three files here do not depend on it. All migration files must be committed with the code: the runner refuses a database
   that has applied a file the checkout lacks. They add three
   tables, two trigger functions and three triggers; no existing table or row is touched (`users` is not altered, and every
   existing member simply has no avatar and no photos). Neon DEV is migrated like any other migration, deliberately and by
   a person; the tests never do it.
2. Set the `R2_PRIVATE_*` variables (above), then deploy the backend.
3. The mobile app needs no separate release gate: against a backend without private storage it shows its "not available"
   state.

## Tests

No test reaches real storage or a hosted database: `tests/helpers/fake-private-store.ts` is an in-memory bucket (signed
URLs that expire and can be tampered with; injectable outages), and the HTTP tests run the real route groups against a real
local PostgreSQL and the real image pipeline (`tests/helpers/private-media-app.ts`).

* `tests/unit/private-media`, `tests/unit/storage/{sigv4-presign,r2-private-object-store}`: keys, configuration, processor,
  uploader, URL issuer, purger, the wall between public and private, and the route specs. The presigned-URL signature is
  checked against the example in AWS's documentation.
* `tests/integration/database/private-media-schema.test.ts`: constraints, triggers, the 50 limit under concurrency, the
  queue's leases and backoff, cascades, and an upgrade over a database that already holds members.
* `tests/integration/http/member-avatar.http.test.ts`, `progress-photos.http.test.ts`: upload, replace, delete, ownership
  (a foreign photo is a 404 and cannot be deleted), expired URLs, missing files, outages, the limit, and storage off.
* `tests/integration/http/private-media-account-deletion.test.ts`: deleting an account queues and removes exactly that
  member's objects, survives a storage outage, and is atomic.
* `tests/integration/http/private-media-container.http.test.ts`: the same features through the **real container and
  `createApp`** (real configuration, authentication, rate limiter and body handling): every route needs a session, a
  picture larger than the JSON limit is accepted, another member gets a 404, the 30-upload budget, account deletion, storage
  not configured, and `PRIVATE_MEDIA_PURGE_ENABLED=false`.
* `tests/unit/config/private-media-env.test.ts` (and `r2-env.test.ts`): the `R2_PRIVATE_*` variables through `loadConfig`,
  including the conflicts with the public bucket and that no secret is ever repeated in an error.

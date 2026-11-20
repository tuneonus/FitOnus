# Public media (images)

How the backend stores pictures that an admin attaches to something the app shows: notification images, exercise
images and workout template covers. One policy covers them all; each feature only decides its folder, its size and what it keeps in its own table.
Code: `src/shared/images` (policy, conversion, upload, checks), `src/shared/storage` (the R2 client),
`src/shared/http/read-upload-body.ts`.

**Public only.** The bucket (`R2_BUCKET`, served at `R2_PUBLIC_BASE_URL`) is public: anything in it can be read by anyone
with the URL. Only admin-authored content belongs there. **Private member images (progress photos, avatars) are never
stored in this bucket**, and nothing in this code can be pointed at them. They live in a separate private bucket with
short-lived signed URLs and a database-backed deletion queue: see [private-media.md](private-media.md). **Meal photos are
deliberately never stored** (see [Meal photos stay transient](#meal-photos-stay-transient)).

## What uses it

| Feature | Folder | Stored on | Pictures | Endpoint |
| --- | --- | --- | --- | --- |
| Notifications | `onusfit/notifications/` | `notification_campaigns.image_key` (0021, 0022) | a WebP **and** a JPEG copy for the push | `POST /api/v1/admin/notifications/images` (`notifications:send`) |
| Exercises | `onusfit/exercises/` | `exercises.image_key` (0023) | one WebP, at most 1600 px | `POST /api/v1/admin/workouts/exercises/images` (`admin:access`) |
| Workout template covers | `onusfit/workouts/` | `workouts.cover_image_key` (0024) | one WebP, at most 1600 px | `POST /api/v1/admin/workouts/templates/images` (`admin:access`) |

The list of folders is closed (`PUBLIC_IMAGE_FEATURES`). Adding a feature means adding it there, a size profile in
`FEATURE_PROFILES`, a nullable key column with a `CHECK` on the key shape, **an entry in the image-key registry (see
below)**, and an endpoint that calls the shared uploader. Two tests enforce the last part: one fails for a feature
with no registered column, the other for a column that looks like an image key in the database but is not registered.

## The rules every upload follows

* **Raw body.** The request body is the file itself (not JSON or multipart), with `Content-Type: image/jpeg`,
  `image/png`, `image/webp`, `image/heic` or `image/heif`. The declared type only decides whether the body is read at
  all. The route's authentication, permission and rate limit run before a byte is read.
* **Content decides.** The format comes from the file's own bytes. JPEG, PNG, WebP and HEIC (HEVC) are accepted; GIF,
  AVIF, SVG, TIFF, BMP, PDF, animated images and anything that does not fully decode are refused.
* **Limits.** At most 10 MiB uploaded (enforced while streaming), 8192 px on a side, 40 megapixels (HEIC 16).
  `BODY_LIMIT` does not apply to these routes.
* **Conversion.** Decoded, orientation applied, then **all metadata removed** (EXIF including GPS, XMP, colour profile),
  converted to sRGB, scaled down to the feature's size (never enlarged) and re-encoded as an optimized WebP.
  Transparency is kept in the WebP.
* **Names.** `onusfit/<feature>/<32 random hex>.webp`, chosen by the server. A client cannot choose a name, overwrite an
  object or write anywhere else. Derivatives sit beside the canonical image under a name computed from it
  (`<same name>.push.jpg`), so no column has to remember them.
* **Cache.** `Cache-Control: public, max-age=31536000, immutable`: a name is never reused.
* **Keys, never URLs.** A table stores the key; the public URL is built from `R2_PUBLIC_BASE_URL` at read time, and a
  stored value that is not a canonical key of that feature resolves to nothing. The request schemas refuse any other
  shape, so an external address can never enter as an uploaded image.
* **Errors.** `415`, `413`, `422 INVALID_IMAGE`, `503 IMAGE_STORAGE_NOT_CONFIGURED` (no `R2_*` variables) and `503
  IMAGE_STORAGE_UNAVAILABLE` (R2 failed; the response never says why). The image library's own error text is never
  returned.
* **Order of writes.** Derivatives first, the canonical image last, so a failure part way leaves at most an
  unreferenced derivative, never a key that a record could store that is missing a file.
* **Audit.** Every upload writes an entry with the key and the sizes (never a URL or file content).
* **HEIC.** Decoded with `libheif-js` (WebAssembly; about 4 s and 180 MB for 12 MP, one at a time). It is LGPL-3.0 and
  decoding HEVC can carry patent obligations: `IMAGE_HEIC_ENABLED=false` refuses HEIC with `415`.

Saving a record that carries a key checks that the object exists (`422 IMAGE_NOT_FOUND`; `503` when storage cannot
answer; `503 IMAGE_STORAGE_NOT_CONFIGURED` with no storage). Notifications check this when a campaign is queued; an
exercise is checked whenever a **new** key is saved, so editing the text of an exercise never depends on R2.

## Exercise images

An exercise has two pictures: one an admin **uploaded** (`image_key`) and an **external** address an admin typed
(`image_url`, which has always existed). The uploaded one is shown when there is one; otherwise the external address.

| Field | In responses (member app and admin) | In admin create/update requests |
| --- | --- | --- |
| `imageUrl` | the picture to display: the uploaded image's URL, else the external address. This is what the mobile app has always read, and its meaning and type are unchanged | the **external** address (http or https; `null` clears it) |
| `imageKey` | the uploaded image's key, or `null` | the key the upload returned; `null` removes the upload (the external address shows again); omitted = unchanged |
| `externalImageUrl` | the stored external address, or `null` (the admin form's fallback field) | not accepted |
| `videoUrl` | unchanged (http or https only) | unchanged (http or https only) |

* **Only http and https.** `imageUrl` and `videoUrl` accept an absolute http or https address and nothing else
  (`javascript:`, `data:`, `file:`, `ftp:` and relative addresses are `400`), at most 2048 characters. https is
  preferred: a release Android build does not load cleartext images, so the admin console warns about an http address.
  Addresses already stored stay valid, and a stored value that is not http(s) is never passed on to an app.
* **An older admin client** shows the displayed picture in its "image URL" field and sends it back on save. A URL equal
  to what an uploaded key resolves to is treated as "unchanged" and never written to `image_url`.
* **Thumbnails.** The admin table shows the stored 1600 px WebP, scaled by the browser. There is no second, smaller copy.
* **Deleting an exercise** is a soft delete: the row keeps its key and no object is touched.

## Workout template covers

A system workout template (`workouts` with `is_template = true` and `user_id IS NULL`, edited by an admin under
`/api/v1/admin/workouts/templates`) can have one **cover**: the picture at the top of its card in the member app's
"Curated Templates" list and above the routine on its detail screen. There is no external-address fallback: a template
has an uploaded cover or none.

| Field | In responses (member app and admin) | In admin create/update requests |
| --- | --- | --- |
| `coverImageUrl` | the cover's public URL, or `null` (always `null` for a member's own routine) | not accepted |
| `coverImageKey` | the cover's key, or `null`. Round-tripped by the admin editor; the member app ignores it | the key the upload returned; `null` removes the cover; omitted = unchanged |

Both response fields are **additive**: every field the member app has always read is unchanged, and a template without a
cover answers `null` for both, so an older app (which ignores them) and a template made before covers behave exactly as
before.

* **Only system templates.** The database `CHECK` (`workouts_cover_image_key_valid`, migration 0024) allows a key only
  on a system template and pins its shape to `onusfit/workouts/<32 hex>.webp`. The member routine endpoints do not accept
  a cover at all (an unknown field is dropped), and the repository only names the cover column when it writes a
  template. A member's routine can therefore never reference the public bucket, and creating or editing a routine does
  not depend on migration 0024 having been applied.
* **Saving a template** checks a **new** key exists in storage (`422 IMAGE_NOT_FOUND`; `503 IMAGE_STORAGE_UNAVAILABLE`
  when storage cannot answer; `503 IMAGE_STORAGE_NOT_CONFIGURED` without storage), exactly like exercises. Editing a
  template whose cover does not change never touches R2.
* **Keys are feature-pinned.** The request schema accepts only `onusfit/workouts/` keys: an exercise key, a notification
  key, a derivative, a URL or a path with `..` is `400`. The public URL is built by a resolver bound to the `workouts`
  folder, so another feature's key stored in the column would resolve to nothing, not to a URL.
* **Audit.** Uploads write `workout.template.cover_upload` (key and sizes); creating and updating a template record
  `hasCover` (and `coverChanged` on update), never the key.
* **Deleting a template** is a soft delete: the row keeps its key and no object is touched.
* **Admin console.** The routine form has a cover field (choose, preview, replace, remove) and holds Save while an upload
  is in flight; the routines table shows the cover as the thumbnail.
* **Member app.** The app runs on the custom navigator (`src/app/index.tsx` -> `AppShell` -> `screenRegistry`), **not** the
  expo-router `src/app/(tabs)` folder, which nothing navigates to. A system template reaches a member through exactly one
  live path: the dashboard picks the member's oldest own routine or, failing that, the oldest system template as "today's
  workout", and `usePlannedWorkout` loads that plan into the store's `plannedSession` (`plannedSessionFromPlan` carries
  `coverImageUrl`, https only). The cover is then drawn on the **Home and Training "Your training" card**
  (`RecommendedWorkout`, planned or in-progress state only) and at the top of the **workout plan screen**
  (`WorkoutPlanScreen`), inset in the card's padding. Both draw nothing (no empty box, no gap, no broken image) when there
  is no cover, it is not https, or it fails to load, so they look as they did before. There is **no live "Curated
  Templates" list or routine detail screen**; the ones in `src/app/(tabs)/workouts` also draw the cover but are not
  reachable. A test fails if a live file starts reading workout plans without carrying the cover.

## Replacing and removing: nothing is ever deleted

Replacing or removing a picture only changes the reference. An object may still be referenced elsewhere (a sent
notification, an exercise or template that was soft-deleted), and an uploaded picture that is never saved stays in the
bucket. The R2 client has only `put` and `exists`: **no code in this backend deletes or lists an object**, and the legacy
objects written before this policy (`notifications/<hex>.jpg|png`) are never moved or rewritten.

**Replacement is safe by construction.** Every upload gets a new random name that is never reused, so replacing a
picture can never overwrite an object that something else still shows; the record simply switches to the new key. The
old object stays where it is, with the `Cache-Control: immutable` header it was stored with, so a copy cached by a phone
or the CDN stays valid. Nothing is "updated in place", so there is no window in which a record points at a half-written
object: the object is complete (and verified to exist) before any record can hold its key.

### The image-key registry

`src/shared/images/image-key-columns.ts` (`IMAGE_KEY_COLUMNS`) lists every column that holds the key of an object in this
bucket, with its feature and the derivatives stored beside each canonical image:

| Column | Feature | Derivatives |
| --- | --- | --- |
| `notification_campaigns.image_key` | `notifications` | `.push.jpg` |
| `exercises.image_key` | `exercises` | none |
| `workouts.cover_image_key` | `workouts` | none |

It is not used at run time. It exists so that a future cleanup starts from a complete list, and two tests keep it honest
(`tests/unit/images/image-key-columns.test.ts`, `tests/integration/database/image-key-columns.test.ts`): the database
test reads the real schema and **fails when a column whose name ends in `_key` and mentions an image, cover, photo,
avatar, banner, thumbnail, artwork or picture is not registered**, when a registered column does not exist, is not
nullable text, or has no `CHECK` pinning it to its feature's folder, and when a public feature has no registered column.
A guard test proves the rule works by adding unregistered columns to a scratch database. A column for **private** member
media is not added here: those (`member_avatars.object_key`, `progress_photos.object_key`) live in another bucket, are
guarded by their own `CHECK`s and are cleaned up by the deletion queue described in [private-media.md](private-media.md).

### Cleaning up later (not built)

Cleaning up is a separate, deliberately reviewed step; there is no scanner, no `list` and no `delete` today. The design it
must follow:

1. A script, dry-run by default, run by a person with an explicit flag, never on a timer.
2. The referenced set is every key in every registered column, **including rows that are soft-deleted**, plus the
   derivatives each column lists (`notification_campaigns.image_key` and its `.push.jpg`, `exercises.image_key`,
   `workouts.cover_image_key`).
3. Only canonical-shaped keys under `onusfit/` that are older than a grace period (an upload is not referenced until the
   admin saves) are candidates. Legacy `notifications/*` objects are never candidates.
4. It needs `list` and `delete` on the R2 client, tested against a fake, and a report of what it would remove. Deleting
   is a second, separate flag after a dry-run has been read, and a record whose key is missing from the bucket is
   reported, never "fixed".

## Meal photos stay transient

The meal photo scanner is not an image-storage feature. The app sends the photo as base64 in the JSON body of
`POST /nutrition/meal-photo/analyze`; the backend forwards it to the Python AI service, which decodes it in memory and
sends it to the model. **Nothing writes the photo to R2, to PostgreSQL or to disk, and the AI service's logs redact the
image fields.** On the phone the photo only lives in the capture screen's parameters until analysis is done. There is no
image column in the nutrition tables.

The privacy setting `privacyPhotoRetention` ("keep meal photos", default on, column `privacy_photo_retention`) therefore
controls nothing today. The mobile Privacy screen **no longer shows it** (a switch that implied photos are kept was
misleading), while the stored preference, its sync and the database column are untouched, so nothing is lost if photo
retention is ever built. That would build on the private bucket described in [private-media.md](private-media.md).

## Request body limits for the AI routes that carry base64

Unrelated to image storage but easy to confuse with it: the meal photo scanner, voice meal entry and coach
transcription send a photo or an audio clip as base64 text inside a JSON body. `BODY_LIMIT` (default 100 kB) is far too
small for that, and raising it would raise it for every route.

Instead a route can declare its own `bodyLimit` in its spec (`src/shared/http/route.ts`). That route's JSON parser runs
**after authentication and the permission check**, so nobody who is not signed in makes the server buffer a big body,
and the application-wide parser skips exactly the routes that declare one (collected from the same specs, never listed by
hand). Every other route keeps `BODY_LIMIT`.

| Route | Cap enforced by the use case | Route limit |
| --- | --- | --- |
| `POST /nutrition/meal-photo/analyze` | 10 MiB of base64 text | `11mb` |
| `POST /nutrition/voice-meal/parse` | 15 MiB of base64 audio | `16mb` |
| `POST /coach/transcribe` | 15 MiB of base64 audio | `16mb` |

Each limit is the cap plus 1 MiB for the rest of the JSON, derived in `src/shared/ai/body-limits.ts` so it cannot drift
from the cap (a test pins both). `BODY_LIMIT` can therefore stay at 100 kB everywhere.

## Setup and migrations

1. The R2 variables and the public domain are in [notifications.md](notifications.md#setup-dev-first); nothing new is
   needed for exercises or workout covers.
2. Apply the migrations **before** deploying the code, in order, in one run: `0021`, `0022` (notifications), `0023`
   (exercises), `0024` (workout covers). Each is additive and metadata-only (0024 adds a nullable column and a `CHECK`
   that every existing row already satisfies). The code reads fine on a schema that is behind (an exercise shows its
   `image_url` as before, a template shows no cover) but **saving** an exercise, a notification or a **system template**
   names the new column and fails until the migration is applied; that is why the order is migrate first. Members'
   own routines never name the cover column, so they keep working even if the order is got wrong.
3. Deploy the backend, then the admin console (an older console keeps working against the new backend), then the mobile
   app (an older app ignores `coverImageUrl`).

## Tests

Everything is tested without real storage: a fake in-memory store replaces R2 (the container takes it as an override),
real PostgreSQL and the real image pipeline run. `tests/integration/http/image-migrations-upgrade.http.test.ts` applies
0021, 0022 and 0023 one after the other on a database that already holds notifications and exercises, and checks that
no existing row is touched. `workout-cover-migration-upgrade.http.test.ts` does the same for 0024 on a database that
already holds templates, member routines and a soft-deleted template, and also proves that members keep creating and
editing routines while the schema is behind. `workout-template-covers.http.test.ts` covers the endpoint, saving,
replacing, removing, the member contract and the database `CHECK`.

# Public media (images)

How the backend stores pictures that an admin attaches to something the app shows: notification images and exercise
images. One policy covers them all; each feature only decides its folder, its size and what it keeps in its own table.
Code: `src/shared/images` (policy, conversion, upload, checks), `src/shared/storage` (the R2 client),
`src/shared/http/read-upload-body.ts`.

**Public only.** The bucket (`R2_BUCKET`, served at `R2_PUBLIC_BASE_URL`) is public: anything in it can be read by anyone
with the URL. Only admin-authored content belongs there. **Private member images (meal photos, progress photos,
avatars) are never stored in this bucket**, and nothing in this code can be pointed at them. Those features, if they are
built, need their own private bucket, short-lived signed URLs and a deletion queue (an account is deleted with
cascades, which would otherwise leave their objects behind). None of that exists yet and no migration prepares for it.

## What uses it

| Feature | Folder | Stored on | Pictures | Endpoint |
| --- | --- | --- | --- | --- |
| Notifications | `onusfit/notifications/` | `notification_campaigns.image_key` (0021, 0022) | a WebP **and** a JPEG copy for the push | `POST /api/v1/admin/notifications/images` (`notifications:send`) |
| Exercises | `onusfit/exercises/` | `exercises.image_key` (0023) | one WebP, at most 1600 px | `POST /api/v1/admin/workouts/exercises/images` (`admin:access`) |

The list of folders is closed (`PUBLIC_IMAGE_FEATURES`). Adding a feature means adding it there, a size profile in
`FEATURE_PROFILES`, a nullable key column with a `CHECK` on the key shape, and an endpoint that calls the shared
uploader.

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

## Replacing and removing: nothing is ever deleted

Replacing or removing a picture only changes the reference. An object may still be referenced elsewhere (a sent
notification, an exercise that was soft-deleted), and an uploaded picture that is never saved stays in the bucket. The
R2 client has only `put` and `exists`: **no code in this backend deletes an object**, and the legacy objects written
before this policy (`notifications/<hex>.jpg|png`) are never moved or rewritten.

Cleaning up later is a separate, deliberately reviewed step. The design it must follow:

1. A script, dry-run by default, run by a person with an explicit flag, never on a timer.
2. The referenced set is every key in every image column (`notification_campaigns.image_key` and its `.push.jpg`,
   `exercises.image_key`), **including rows that are soft-deleted**. A test must fail when a new image-key column is not
   in that list.
3. Only canonical-shaped keys under `onusfit/` that are older than a grace period (an upload is not referenced until the
   admin saves) are candidates. Legacy `notifications/*` objects are never candidates.
4. It needs `list` and `delete` on the R2 client, tested against a fake, and a report of what it would remove.

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
   needed for exercises.
2. Apply the migrations **before** deploying the code, in order, in one run: `0021`, `0022` (notifications), `0023`
   (exercises). Each is additive and metadata-only. The code reads fine on a schema that is behind (an exercise shows its
   `image_url` as before) but **saving** an exercise or a notification names the new column and fails until the migration
   is applied; that is why the order is migrate first.
3. Deploy the backend, then the admin console (an older console keeps working against the new backend).

## Tests

Everything is tested without real storage: a fake in-memory store replaces R2 (the container takes it as an override),
real PostgreSQL and the real image pipeline run. `tests/integration/http/image-migrations-upgrade.http.test.ts` applies
0021, 0022 and 0023 one after the other on a database that already holds notifications and exercises, and checks that
no existing row is touched.

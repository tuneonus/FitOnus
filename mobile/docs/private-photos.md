# Profile picture and progress photos (mobile)

The member's profile picture and progress photos. Both are **private**: the backend stores them in a private bucket and
hands the app short-lived signed URLs. Backend side: [backend/docs/private-media.md](../../backend/docs/private-media.md).

## Where things are

| What | Where |
| --- | --- |
| Profile picture shown | `features/profile/components/member-avatar.tsx` (Profile screen and the Home header; the old Expo Router dashboard route also uses it but is not part of the live app) |
| Change or remove it | `features/profile/components/avatar-editor-sheet.tsx` (tap the picture on the Profile screen) |
| Gallery, viewer, comparison | `features/progress/screens/ProgressPhotosScreen.tsx`, `ProgressPhotoViewerScreen.tsx`, `PhotoComparisonScreen.tsx` (routes `progressPhotos`, `progressPhoto`, `photoComparison`; entered from Profile > Progress photos) |
| Add a photo | `features/progress/components/add-photo-sheet.tsx` |
| Shared media code | `shared/media/`: `private-image.ts` (cache keys, URL freshness), `upload-image.ts` (raw-body upload, progress, error messages), `PrivateImage.tsx`, `pick-image.ts` |
| Pure rules (tested) | `features/progress/utils/photo-gallery.ts` (grouping, limit banner, comparison pairs, dates) |

## The rules that matter

* **URLs are credentials and expire.** They are kept in React Query's in-memory cache only (never persisted, never logged) and
  the cache is cleared on sign-out or when another account signs in. A query refreshes itself a minute before the earliest URL
  expires; a picture that fails to load asks for fresh URLs once, then shows an "unavailable" placeholder instead of retrying
  for ever (`PrivateImage`).
* **The image cache is keyed by kind, id and `version`, never by URL and never by id alone.** (An avatar's id is the member's
  own id and a photo's id is a unique UUID, so a key never matches another member's picture.) The URL changes on every
  request, so keying by it would re-download everything; a replaced picture keeps its id, so keying by id would keep showing the
  old one. The backend changes `version` on every replacement, so a new picture always loads and an unchanged one is reused
  across URL refreshes (`privateImageCacheKey`).
* **expo-image's disk and memory caches are emptied** (`private-image-cache.ts`) when a member signs out or is signed out, when a
  different account takes over, and at app start when the saved session is read and nobody is signed in (a sign-out the system
  interrupted must not leave photos on disk). The rule is the pure `shouldClearPrivateImages`; the listener is registered once
  in the root layout (`src/app/_layout.tsx`) so it exists before any sign-out can happen. Restoring the same member's session
  at app start keeps the cache (their own pictures, no re-download).
* **Uploads are the raw file** with `Content-Type: image/jpeg|png|webp|heic`, metadata in the query string, through the shared
  API client (same token and refresh as every other call). Files over 10 MB are refused before anything is read or sent. The
  server crops, converts and removes all metadata; the app does no image processing.
* **The photo library needs no permission.** The system picker (Android photo picker, iOS PHPicker) hands over only what the
  member selects. The camera asks for permission; a refusal is explained, with a shortcut to settings when the system allows.

## States every screen handles

Loading (skeleton), error with retry (including "photo storage is not available"), empty with a call to action, upload progress
with cancel, the 45-photo warning and the 50-photo limit, an expired URL, and a photo whose file is missing.

## Native configuration (Expo SDK 58, `expo-image-picker` 58.0.x)

`expo-image-picker` and `expo-camera` are installed and the camera permission is declared in `app.json`. `app.json` also lists
the `expo-image-picker` plugin with **only `photosPermission`** (the iOS `NSPhotoLibraryUsageDescription` text App Store
validation looks for). Leave `cameraPermission` and `microphonePermission` unset: setting either to `false` makes the plugin
**block** `CAMERA` or `RECORD_AUDIO` in the Android manifest, which would break the camera and voice meal logging. Resolved
config (`npx expo config --type introspect`) keeps `CAMERA` and `RECORD_AUDIO` allowed and the blocked list unchanged.
The plugin changes only the iOS plist text, so the current Android development build needs no rebuild. `android/` and `ios/` are
generated and git-ignored; `app.json` is the source of truth.

## Tests

`npm --prefix mobile test` runs `tests/private-media.test.ts` (cache keys, URL freshness, when the on-device image cache is
emptied, the upload helper and its error messages) and `tests/progress-photos-logic.test.ts` (dates, grouping, limit banner, comparison). They need no phone.

# OnusFit — Android Internal Testing release readiness

**Current Internal Testing decision:** the user approved the existing icon/splash and DEV backend for this test, then explicitly approved a separate Expo project and verified linkage. See [new Expo setup](ONUSFIT_EXPO_SETUP.md) for the new UUID, signing status and current validation. Earlier production-only/asset/linkage blockers below are historical or apply to the production launch.

Date: 2026-11-10 (Asia/Kolkata). **AAB cloud build is NOT safe to start yet.** This execution fixes safe local code and records external blockers; it does not claim release readiness.

| Blocker | Status | Fix applied / verification | Remaining action |
| --- | --- | --- | --- |
| 1. Production API | BLOCKED | Local Express registration and mobile paths match. Nine safe probes, including login/register validation and protected profile/workout/nutrition GETs, all returned 404 with `x-render-routing: no-server` | Owner must restore/provision routing to the intended production Render service or confirm its actual official hostname; no local path workaround is justified |
| 2. Dummy personal data | FIXED | Legacy profile now uses authenticated identity and account-scoped `useProfile` API data; no fabricated weight/goal/progress; loading/empty/retry states and signed-out redirect added without changing its card/header design | Confirm on real device with authorized accounts; do not seed synthetic personal data |
| 3. Social login | FIXED | Unimplemented Apple/Google buttons and divider removed; email/password, password recovery and account creation retained | OAuth remains intentionally unimplemented; no provider secrets introduced |
| 4. Brand assets | MANUAL ACTION | Inspected launcher, adaptive, splash/notification references, web favicon and admin ICO; no finalized approved OnusFit set found | Supply/approve the assets listed below; current assets remain unchanged |
| 5. EAS project | MANUAL ACTION | Current ID/owner/scheme and Android/iOS identifiers preserved; no active EAS Update or project-scoped push-token flow found | Approve separate @tuneonus/onusfit project creation and supply its UUID before any relink; never delete/overwrite old project |
| 6. Signing | BLOCKED | Only local signing file found is current repo’s debug.keystore. Release has no debug-signing fallback. Supported `CI=1 eas credentials --platform android` fails at slug mismatch before credential display | Existing approved OnusFit upload-key existence is UNKNOWN. Owner must verify EAS/Play metadata and SHA-256 identity mapping; no TuneStack files or credentials accessed |
| 7. Privacy/permissions | MANUAL ACTION | Confirmed unused coarse/fine location and overlay permissions blocked in Expo config/native manifest. Used camera/audio/notifications/media retained. Policy URLs fail DNS resolution from this environment; no verified replacement supplied | Supply official privacy/terms destinations; wire links only after verification; complete actual Console declarations and device checks |

## Changes in this execution

- `mobile/src/app/(tabs)/profile/index.tsx`: preserve header, weight/goal cards and settings layout; replace static identity/weights/monthly change with current-account API data, guard against cached data from another account, show existing StatusBanner retry plus neutral missing/loading copy, and redirect signed-out access to the existing app entry.
- `mobile/src/features/auth/screens/LoginScreen.tsx`: hide unsupported provider controls; retain form validation and working email/password service integration.
- `mobile/app.json`: `android.blockedPermissions` prevents coarse/fine location and SYSTEM_ALERT_WINDOW from being reintroduced by dependency manifests in a fresh Expo prebuild.
- `mobile/android/app/src/main/AndroidManifest.xml` (gitignored generated native): equivalent `tools:node="remove"` entries for the existing local native tree.
- `mobile/tests/release-auth-profile.test.ts`: six screen-render regression cases covering current/missing/error/cross-account/invalid/signed-out profile data and the implemented login affordances. Only native/context boundaries are stubbed; production screen composition is exercised.
- `ONUSFIT_PLAY_INTERNAL_TESTING.md`: annotate superseded findings and link current results.
- This report. No backend/admin implementation changes were needed in this execution; their existing rebrand work remains uncommitted.

Pre-existing Resources/Figma changes, three untracked backend maintenance scripts, environment files, old EAS project linkage and all databases are untouched. No commit, push, deployment, Expo project action, key generation/reset, cloud build, AAB upload or Play rollout was performed.

## Production API: routing evidence and exact manual action

Expected routes derive from `backend/src/container.ts`, `src/app.ts` and module route specs:

- `/health/live` and `/health/ready` are mounted without `/api/v1`.
- Documentation is `/api/v1/openapi.json`.
- Mobile login/register: POST `/api/v1/auth/login`, POST `/api/v1/auth/register`.
- User/profile/workout/nutrition probes: GET `/api/v1/users/me`, `/api/v1/profile/me`, `/api/v1/workouts/exercises`, `/api/v1/nutrition/daily`.

Every request to `https://fitonus-api.onrender.com` returned plain `Not Found` and Render's `x-render-routing: no-server`, rather than the application's JSON error envelope. This rules out treating the problem as merely missing health/docs routes. It indicates platform routing is not reaching the expected Express application; the repository alone cannot distinguish an absent service, stopped service, or incorrect configured hostname. Historical project documentation also records this hostname as offline/unprovisioned. No DEV host was substituted.

The authentication probes sent only empty `{}` bodies, after verifying local validation occurs before application handlers. Protected GETs sent no Authorization header. No real credentials, tokens, record-changing request or database script was used. Private authenticated data and successful production sign-in cannot be tested while the service is unavailable.

Exact owner action (not executed): open [Render Dashboard](https://dashboard.render.com/), locate the intended production backend and verify its public hostname is `fitonus-api.onrender.com`. Restore the existing service/routing if available. If no such service exists, separately approve provisioning/deployment of this backend using the intended existing production configuration. Use repository `tuneonus/FitOnus`, Root Directory `backend`, build `npm ci --include=dev && npm run build`, start `npm start` (`node dist/src/server.js`), NODE_ENV=production, HOST=0.0.0.0 and Render's assigned PORT. Preserve approved production database/secrets/issuer/audience values; do not seed, migrate, reset or copy DEV credentials. Review production public-registration policy explicitly, rather than enabling it automatically.

After an approved deployment/restoration, repeat the above probes: health/docs should return 200, protected GETs should reject missing authentication with application 401 JSON, and empty login should return validation 400. Empty registration may return 400 or registration-policy 403. If a different real production hostname is confirmed, approve changing both the EAS production URL and release fallback together; never guess a new hostname or point store builds at DEV. Successful authenticated feature testing then requires separately authorized tester accounts/device activity.

Probe evidence: `/tmp/onusfit-ready-production-api.json`. API paths do not need a local code change.

## Required approved brand assets

| Destination | Requested approved input | Current finding |
| --- | --- | --- |
| `mobile/assets/images/icon.png` | 1024×1024 PNG launcher master | Current 1254×1254 image includes FitOnus text |
| `mobile/assets/images/android-icon-foreground.png` | 1024×1024 RGBA, mark within Android adaptive safe area | Current 512×512 Expo symbol |
| `mobile/assets/images/android-icon-background.png` | Same square dimensions as foreground, approved background | Existing Expo-related layer |
| `mobile/assets/images/android-icon-monochrome.png` | 1024×1024 alpha monochrome version of approved mark | Current 432×432 Expo symbol |
| `mobile/assets/images/splash-icon.png` | Approved transparent PNG mark, e.g. 1024×1024; retain existing imageWidth 200/layout | Current unused 228×213 Expo glyph; active splash plugin still references icon.png containing FitOnus |
| `mobile/assets/images/notification-icon.png` (pending new file) | 96×96 all-white PNG with transparency | Notification plugin currently references full-color icon.png; change reference only after approval |
| `mobile/assets/images/favicon.png` | Approved 48×48 PNG web favicon | Current 48×48 Expo symbol |
| `admin/app/favicon.ico` | Approved multi-resolution ICO (16/32/48/256) | Current ICO is Vercel triangle |
| Play store graphic | Approved 512×512 store icon and truthful screenshots | No Console assets uploaded |

These are requested deliverables, not generated assets. No asset was replaced and no temporary logo was invented. Native launcher/splash references must be regenerated and device-previewed after approved images arrive. [Expo icon config](https://docs.expo.dev/versions/v57.0.0/config/app/), [notification glyph requirement](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

## EAS migration gate

Keep current project `@tuneonus/FitOnus`, ID `ede4995a-e0ad-4753-9932-e2f9cfabb0bf`, owner tuneonus and its history/credentials untouched. Local app stays OnusFit, slug onusfit, Android/iOS `com.tuneonus.onusfit`, scheme fitonus.

Source inspection found no installed expo-updates dependency, runtimeVersion, updates URL/channel or active native updater (updates ENABLED=false). Local notifications do not register Expo push tokens or expose a project-scoped backend push flow. Build profiles target production store AABs, with remote credential selection; no new environment or credential migration is automatic.

After separate explicit approval, owner can create `onusfit` under the **tuneonus** account in Expo Dashboard → Projects → Create project. Do not modify/delete/transfer the old project. Copy the new project's UUID from Settings → General and confirm it here. Only then change `expo.extra.eas.projectId`, leaving all other identity fields intact, and run `npx expo config --json`, `eas whoami`, `eas project:info`. Do not run `eas init --force`. A separate project has separate build history/project-scoped integrations and must have approved environment/signing/push settings independently verified. Old binaries and their project identity do not migrate automatically.

## Signing identity and backup checklist — no TuneStack reuse

Signing-key status is **unknown/unapproved**, not “missing” or “safe”. The only local keystore found inside this repository is `mobile/android/app/debug.keystore`; it is not an upload key. `mobile/android/app/build.gradle` release has no `signingConfigs.debug` fallback. Raw local Gradle release output is unsigned until approved signing exists; EAS must inject the intended upload key. A new prebuild may regenerate the template signing line, so the actual final AAB certificate is the authoritative gate.

1. Owner opens the existing intended Expo project's **Settings → Credentials → Android** and selects exact application ID `com.tuneonus.onusfit`, not the old package and not any TuneStack application. Inspect metadata only; stop at any create/import/copy/reset action. Current CLI credential inspection is blocked by the slug mismatch, and no authenticated Play Console connector is available in this environment.
2. In the intended developer's Play Console **All apps**, search for this package (including draft apps). If it exists, open **App integrity → App signing** and record **upload certificate SHA-256** and **app-signing certificate SHA-256** separately. A public store listing cannot prove that a private/draft registration does not exist. Registration is therefore not verified here.
3. Record a public identity mapping: owner tuneonus, OnusFit, `com.tuneonus.onusfit`, selected approved EAS UUID, key alias, upload certificate SHA-256, Play app-signing certificate SHA-256. Ask the owner to explicitly approve the mapping; do not infer approval from an existing key name or alias. Never choose a TuneStack key.
4. If an approved key exists, reuse it only with approval. If none exists, request separate approval before generating/configuring one. Do not reset an existing key to bypass an upload error; first compare package, account, signer and expected Console upload fingerprint.
5. After approval, back up the intended keystore encrypted outside the repository/cloud-build archive. Store its password separately in a password manager, restrict access, and keep a second protected backup. Verify readability and the certificate/alias without printing passwords or private key bytes. Do not put key material in EXPO_PUBLIC variables, Git, logs or chat. No backup/download was performed here.
6. Before the first AAB upload, run `jarsigner -verify /absolute/path/OnusFit.aab` and `keytool -printcert -jarfile /absolute/path/OnusFit.aab` against the authorized future artifact. Compare its public SHA-256 to the approved **upload** certificate, not Google's app-signing certificate; compare against existing Play metadata if the package is registered. Also inspect the bundle manifest package/versionCode. Stop on any mismatch. No AAB upload until these checks are signed off.

## Privacy and permissions

`https://fitonus.com/privacy` and `/terms` could not resolve from this environment. There is no verified official replacement in the inspected source/assets. The signup agreement currently refers to policies without operative policy links, and legacy profile policy rows have no actions. These remain manual blockers; wiring a guessed domain or a merely reachable unrelated page would not fix them. Owner must provide the official published privacy/terms destinations and approve them before source links are changed. No remote app-setting/database value was modified.

No active location/geolocation calls or overlay feature were found in mobile source. The unused package's location permissions and overlay permission are now blocked through Expo's supported `blockedPermissions`, with corresponding native removal tags. Camera/barcode/photo capture, voice recording, notification scheduling/boot restoration and gallery selection have active call sites; their permissions are retained. Gallery currently explicitly requests media-library permission, so legacy storage declarations were not removed on assumption. No Health Connect/HealthKit bridge or health read permission was enabled; wearables remain disabled. [Expo permission blocking](https://docs.expo.dev/versions/v57.0.0/config/app/).

Owner-operated Console work still includes verified policy/deletion-request URLs, app access/reviewer instructions, content rating/target audience/ads, truthful Health apps declaration (actual activity/nutrition features), and any permission/foreground-service forms actually flagged by the final bundle. Internal-only Data safety exemption is not a waiver of health/privacy duties. Use the exact Play setup instructions in ONUSFIT_PLAY_INTERNAL_TESTING.md; do not claim no data collection or completed declarations. Real devices must verify camera/media/microphone/notification denial and revocation, policy access, account isolation, deletion and cold-start/backup behavior.

## Validation

| Check | Result |
| --- | --- |
| Mobile TypeScript | PASSED; exact optional prop handling corrected and rechecked |
| Full mobile suite | 305 passed, 0 failed; six new screen regression cases also rerun after the type correction |
| Production Android Expo export | PASSED; `/tmp/onusfit-ready-android-export` contains Hermes bundle/assets, not an AAB |
| Expo public config and native plugin introspection | PASSED; OnusFit, onusfit, Android/iOS IDs, retained fitonus scheme and unchanged EAS ID verified |
| Native release checks | PASSED offline: `:app:processReleaseManifestForPackage :app:compileReleaseKotlin` |
| Final native manifest | Correct package/versionCode 1; non-debuggable; target API 36; unused coarse/fine location and overlay absent; used camera/microphone/notification permissions retained; no health read permissions |
| Standalone and native Gradle release bundle scan | Production hostname present; no DEV hostname, removed fabricated name/email, fixed weight/goal or monthly-change literals |
| Signing configuration | No local release debug-signing fallback; actual approved upload certificate remains UNKNOWN until external metadata approval and signed-artifact verification |
| Backend build | PASSED |
| Backend unit suite | 760 passed across 78 files, 0 failed |
| Admin production build | PASSED |
| Admin suite | 88 passed, 0 failed |
| Working tree diff | `git diff --check` PASSED; no files staged |
| Live production endpoint checks | BLOCKED: all nine responses are platform 404/no-server |
| Policy links | BLOCKED: inherited privacy/terms hostname could not resolve; no approved replacements supplied |
| EAS credential metadata | BLOCKED before display by remote/local slug mismatch; no keys downloaded, copied, created or reset |

Commands run from the appropriate project directories: `npm run typecheck`, `npm test`, backend `npm run build`/`npm test`, admin `npm run build`/`npm test`; mobile `expo config --type public --json`, `expo config --type introspect --json`, and production `expo export --platform android --output-dir /tmp/onusfit-ready-android-export`. Production export/native bundling explicitly used `EXPO_NO_DOTENV=1`, `NODE_ENV=production`, and `EXPO_PUBLIC_API_URL=https://fitonus-api.onrender.com/api/v1` to prevent local .env contamination. No cloud build or integration runner that writes a database was used.

Evidence/logs: `/tmp/onusfit-ready-*.log`, `/tmp/onusfit-ready-production-api.json`, `/tmp/onusfit-ready-policy-probes.json`, `/tmp/onusfit-ready-final-verification.json`. Native dependency/Kotlin/Gradle deprecation messages were non-blocking. Device-only checks remain for actual authorized login/signup, persistence, camera/media/audio permission handling, masked icons, notification glyph/taps, process death/restart and Play-installed signing/updates.

**Exact next manual action:** owner verifies/restores the Render production service and confirms its official hostname using the settings above. In parallel, supply approved assets/policy URLs and separately approve creation/linkage of the new EAS project. Before any cloud AAB build, verify the OnusFit signing/registration identity and approve the upload certificate mapping. **Do not start the Internal Testing AAB build until these critical gates are resolved.**

# OnusFit — Google Play Internal Testing preparation

**Current Internal Testing decision:** the user approved the existing icon/splash and DEV backend for this test, then explicitly approved a separate Expo project and verified linkage. See [new Expo setup](ONUSFIT_EXPO_SETUP.md) for the new UUID, signing status and current validation. Earlier production-only/asset/linkage blockers below are historical or apply to the production launch.

Prepared 2026-11-10 (Asia/Kolkata). **Status: BLOCKED for launch; local preparation only.**

Follow-up fixes and current evidence: [Android release readiness](ONUSFIT_RELEASE_READINESS.md). This follow-up replaces the initial dummy-profile/social-button findings; external launch gates remain open.

No Expo project was created/linked, no project ID was replaced, no credentials were generated/reset/downloaded, no EAS build or upload was started, no database was modified, and no Git files were staged/committed/pushed. Do not publish to production. Each future project, signing, cloud-build, upload and rollout action needs separate explicit approval.

## Readiness and blockers

| Item | Evidence / status | Required next action |
| --- | --- | --- |
| Identity | App name OnusFit; Android and iOS `com.tuneonus.onusfit`; version 1.0.0; Android versionCode 1; owner tuneonus; scheme fitonus | Keep these values. Code 1 is suitable only if this package has never had an uploaded artifact; verify Console history before building |
| Expo identity | Local slug onusfit still references old project ID `ede4995a-e0ad-4753-9932-e2f9cfabb0bf`, whose remote slug is FitOnus | BLOCKER: approve a separate new project and confirm its exact UUID before changing local linkage; keep old project intact |
| Production backend | Configured `https://fitonus-api.onrender.com/api/v1`; read-only GETs to `/health/live`, `/health/ready`, `/api/v1/openapi.json` all returned HTTP 404 | BLOCKER: owner must confirm a working production deployment/URL. Do not substitute the DEV backend. No deployment/database changes were made |
| Branding | Existing `mobile/assets/images/icon.png` visibly says FitOnus; native splash and notification plugin reference this image | BLOCKER: supply finalized approved OnusFit assets; no replacement logo generated |
| Adaptive icon | Foreground/monochrome images are Expo symbols, not the existing fitness mark | BLOCKER: approve consistent foreground/background/monochrome OnusFit assets; check masked launchers |
| Signing | Local Gradle release formerly used `signingConfigs.debug`; that binding has been removed. EAS profile selects remote credentials, but actual approved upload credentials have not been verified | BLOCKER: authorized signing review/provisioning required. No signed store AAB was produced. Native directory is gitignored; a fresh Expo prebuild may restore template debug signing, so verify the final EAS-signed AAB, never upload a raw debug-signed Gradle artifact |
| Social login | FIXED in readiness follow-up: unimplemented Apple/Google controls and their divider removed; email/password and signup flow preserved | Keep provider controls hidden until real provider authentication is approved and implemented |
| Dummy personal data | FIXED in readiness follow-up: registered legacy profile uses authenticated profile data, rejects another account’s cache and shows loading/empty/retry states | No fabricated identity/measurements remain in this route; keep real-device account-isolation checks. Existing unrelated preference callbacks are unchanged |
| Email/password and core features | Login/signup call existing backend endpoints; tokens use SecureStore; lifecycle tests cover real stores, session isolation and offline queues with mocks | Local tests pass; production authentication is unverified because backend probes fail. Do not create live accounts/data during this preparation |
| Privacy | Signup mentions Terms/Privacy without working policy links; the legacy profile policy rows are no-ops; configured support/legal destinations were inherited and are unverified | Verify a publicly accessible policy, actual AI/photo/audio processing disclosures, account deletion and deletion-request URL before collecting tester data |
| Permissions | Readiness follow-up blocks unused coarse/fine location and overlay permissions in tracked Expo config and local native manifest; camera, microphone, notifications and media handling retained | Verify final release manifest and device behavior; privacy-policy destinations and declarations still need owner completion |

## Changes made in this preparation

- `mobile/eas.json`: production profile now explicitly selects store distribution, release client, production environment and remote credentials; new `internal-testing` profile inherits production. It produces an AAB, not an EAS internal-distribution APK. Existing preview profile retains its DEV API and APK behavior. Existing project ID and local version source remain untouched.
- `mobile/src/constants/config.ts`: native release/headless fallback now uses the configured production host; Expo Go/development retains the existing DEV default. Explicit environment overrides, including preview, remain supported. Headless execution no longer assumes development logging.
- `mobile/tests/release-api-config.test.ts`: four environment/override regression cases.
- `mobile/android/app/build.gradle` (generated/gitignored): removed release debug-signing fallback; raw Gradle release is unsigned until approved signing is configured. EAS must inject approved release credentials in the eventual build.
- This runbook. Existing rebranding edits, Resources/Figma edits and three local-only backend maintenance scripts remain unstaged and untouched.

The configured production hostname has not been proven correct: switching the fallback prevents accidental DEV use; it does not resolve the observed 404 responses. [EAS profile fields](https://docs.expo.dev/eas/json/).

## Expo project decision and dependencies

Current source inspection:

- Existing ID appears in `mobile/app.json`; it is unchanged. New slug is already onusfit, owner tuneonus.
- `expo-updates` is not installed; no updates URL, runtime version or channel is configured; native `expo.modules.updates.ENABLED` is false. No active EAS Update feed was found to migrate. Existing binaries and any old project's service history remain associated with the old identity.
- Notifications currently schedule local reminders. No `getExpoPushTokenAsync`, push token registration, backend push delivery, Firebase service files or APNs configuration was found in the inspected paths. A new EAS ID does not itself enable push delivery. Future Expo push registrations/tokens/credentials must be checked against the selected project.
- Remote signing credentials were not enumerated or altered. Do not assume a new project inherits the previous project's signing choices, environment variables, integrations or access settings. Reuse an approved upload key where appropriate; any creation/import requires separate approval. EAS upload signing and Google Play app signing are distinct.
- Existing backend endpoints, token contracts, `fitonus://` scheme and storage keys remain unchanged. Project ID replacement does not migrate databases, old-package local storage, build history or old installs. The Android package itself changed during the earlier rebrand, so it installs separately from the old package.
- New builds, links and project-scoped services would belong to the new project. Keep the old project and all history/credentials; do not initialize with `--force`, delete/transfer anything or reset keys.

### Manual Expo steps — only after explicit approval

1. Sign in at [Expo](https://expo.dev/) as tuneonus; select the **tuneonus** account and open **Projects**.
2. Choose **Create project**; use project slug/name **onusfit**. Confirm account owner is tuneonus. If onusfit already exists, inspect it and confirm ownership/UUID rather than creating a duplicate. Do not modify the FitOnus project.
3. Open the new project's **Settings → General**, copy its **Project ID** UUID, and send it here with explicit approval to link this repository. If a display-name field is offered, use OnusFit; local app display name is already OnusFit.
4. Only after that confirmation, update **only** `expo.extra.eas.projectId` in `mobile/app.json`. Existing slug, owner, Android package, iOS ID, scheme and other settings stay unchanged. Do not run `eas init --force` or create a second project via CLI.
5. Verify from `mobile/`:

```bash
npx expo config --json
eas whoami
eas project:info
```

Expected: @tuneonus/onusfit, the newly confirmed UUID, app name OnusFit, Android/iOS com.tuneonus.onusfit, scheme fitonus. Stop if any value differs. This manual action has not been approved or performed here.

### Production API confirmation

After the owner confirms the deployed URL (and authorizes any configuration correction), update the production profile and release fallback together if needed, then repeat these read-only checks against the confirmed host:

```bash
curl --fail-with-body --max-time 30 https://fitonus-api.onrender.com/health/live
curl --fail-with-body --max-time 30 https://fitonus-api.onrender.com/health/ready
curl --fail-with-body --max-time 30 https://fitonus-api.onrender.com/api/v1/openapi.json
```

For the currently configured host these commands fail with 404. No login/signup test that writes server data was attempted. Confirm production public-registration policy and reviewer/tester access without displaying credentials or changing the database.

### Signing and cloud-build gates — future commands, not executed

After project linkage succeeds, request separate approval to inspect/configure Android upload signing:

```bash
# Interactive: inspect existing entries first; stop at any generation/import/reset prompt.
eas credentials --platform android
```

Select the internal-testing/production profile and correct package. Compare approved upload certificate SHA-256 with Play Console's upload certificate when available. Never use the Android debug certificate. Keep any backup outside this repository; never paste passwords or private keys into chat or put them in EXPO_PUBLIC variables. No service-account JSON is needed for a manual Console upload. [Expo signing guidance](https://docs.expo.dev/app-signing/app-credentials/).

After approved assets, backend, authentication, dummy-route/privacy corrections, confirmed signing and local validation are complete, obtain separate cloud-build approval before running:

```bash
# Starts a cloud build. Do not run during preparation. Does not submit to Play.
eas build --platform android --profile internal-testing --non-interactive
```

Do not add `--auto-submit`. Non-interactive mode should fail if required setup/credentials are missing; do not work around that by resetting credentials. Inspect/download only the approved resulting AAB. Do not build from the preview profile. VersionCode is currently 1 with local version management; increment both app.json/native versionCode before each subsequent upload if that code has already been used. [Version guidance](https://docs.expo.dev/build-reference/app-versions/).

## Manual Play Console work

These are owner-operated dashboard steps, not actions performed by the agent. Pause for approval before account/app creation, signing enrollment, artifact upload and release rollout. There is no production release in this plan.

1. **Verify the developer account.** Open [Play Console](https://play.google.com/console/). Use the existing intended developer account or separately approve creating one. Complete the Console identity/contact/organization verification checklist, matching legal/payment information; provide ID and organization/D-U-N-S documents when the selected account requires them. If requested, complete Android device verification in the Play Console mobile app. Treat verification as pending until Console says complete. No repository command can complete identity verification. [Account setup](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
2. **Create OnusFit.** In **All apps → Create app**, enter OnusFit; default language English (or owner's selected language); App; owner's free/paid decision; verified support email. Enter **com.tuneonus.onusfit** if the flow requests package name. Accept the displayed policy/export/signing declarations only as the authorized owner, then create the app. If package is not requested here, the uploaded AAB supplies it. Do not choose/alter pricing without the owner's decision. [App creation](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).
3. **Confirm package identity before upload.** In the app/first-release flow and bundle inspection verify com.tuneonus.onusfit, versionName 1.0.0, versionCode 1 (or the approved unused higher code). Package names are not a cosmetic rename. Confirm there is no prior artifact for this package. Once the AAB exists, inspect it locally with an approved installed bundletool, for example `java -jar /absolute/path/bundletool.jar dump manifest --bundle=/absolute/path/OnusFit.aab --module=base`; do not substitute an APK or invent an artifact path.
4. **Configure Play App Signing.** Follow first-release enrollment under **App integrity → App signing** (or the first-upload signing prompt); accept Google's managed signing only with approval. Upload AABs must be signed by the approved upload key. Record app-signing and upload certificate fingerprints; these differ. Register Play app-signing fingerprints with any enabled OAuth/Firebase provider; do not reset an existing key. [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en).
5. **Open Internal testing.** Choose **Test and release → Testing → Internal testing → Releases → Create new release**. If disabled, complete the Console's blocking tasks. Stay on Internal testing throughout. EAS `distribution: store` creates the store artifact; choosing the internal track happens in Play Console.
6. **Upload the approved AAB.** Only after explicit upload approval, add the signed .aab. Wait for processing; check package/version/signing, supported devices, target API and permission warnings. Save as draft. Never upload the Hermes export directory, debug artifact, or an AAB signed with the debug key. Review the Console's final artifact details against local inspection. After the approved AAB is downloaded, `jarsigner -verify /absolute/path/OnusFit.aab` checks archive signing and `keytool -printcert -jarfile /absolute/path/OnusFit.aab` shows the public signer certificate for comparison with the approved upload certificate. A successful signature check alone does not prove it is the correct key.
7. **Complete required declarations.** Use **Policy → App content** / Dashboard tasks. Complete all forms Console actually requires for the chosen track: privacy policy, app access/reviewer instructions for login-restricted content, ads, content rating, target audience, health features and any permission/foreground-service declarations flagged by the artifact. For health categories, accurately consider **Activity and Fitness** and **Nutrition and Weight Management**; do not claim enabled Health Connect, sleep sensors or wearables. Disclose real account/fitness/nutrition data and AI photo/audio/chat processing. Verify in-app policy and account-deletion flows plus a deletion-request web URL; do not claim no data collection. Apps exclusively on Internal testing are exempt from the **Data safety section**; prepare truthful answers before closed/open/production distribution and follow any Console-specific blocker. Do not assume this exemption waives health/privacy or permission requirements. [App content](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en), [Health declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en), [Data safety exemption](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
8. **Add testers.** Under Internal testing → **Testers**, create/select an email list using testers' Google accounts; add a feedback email/URL and save. The internal track supports up to 100 testers. Owner must supply the real tester list; no dummy addresses or messages were created.
9. **Submit the internal release.** Add release name `OnusFit 1.0.0 — Internal testing` and truthful notes such as “Initial internal build; wearable integration disabled.” Review permissions, signing and rollout destination; resolve errors. After separate approval, select the Console action to review/start rollout to **Internal testing**, and send for review if prompted. Check **Publishing overview** for any required submission action. Do not promote to production. Google can still block/review the release; approval or processing time is not guaranteed. [Release workflow](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en).
10. **Copy the opt-in link.** Once the internal release is available, return to Internal testing → **Testers**, copy the shareable opt-in link and provide it to the approved tester list through an authorized channel. Testers must use their listed Google account, accept the test, then install via Play. Draft/pending releases may not expose a usable link immediately. No invitations were sent. [Tester setup and link](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

Dashboard-only steps have no required shell command; use local commands only at the explicit artifact/project gates above. New-personal-account closed-testing requirements relate to later production eligibility; internal testing should not be represented as satisfying them automatically.

## Local validation and device testing

The results in this section describe the initial preparation artifact. In particular, its dummy-profile finding was subsequently fixed; see ONUSFIT_RELEASE_READINESS.md for current validation and artifact results.

Commands already authorized for local validation (no build/upload to EAS):

```bash
cd /media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus/mobile
npm run typecheck
npm test
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://fitonus-api.onrender.com/api/v1 NODE_ENV=production npx expo export --platform android --output-dir /tmp/onusfit-play-android-export
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://fitonus-api.onrender.com/api/v1 NODE_ENV=production npx expo config --type public --json
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://fitonus-api.onrender.com/api/v1 NODE_ENV=production npx expo config --type introspect --json
cd android
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://fitonus-api.onrender.com/api/v1 NODE_ENV=production ./gradlew --offline :app:processReleaseManifestForPackage :app:compileReleaseKotlin
```

These environment assignments deliberately avoid loading the ignored local .env (which can point to DEV). They do not create or modify an environment file. Explicit preview overrides still work; do not use preview for Play. Local export is JS/assets, not a signed AAB or proof that native installation works. Backend/admin code was not changed in this preparation, so their checks were not rerun here; earlier results are in ONUSFIT_REBRANDING.md.

| Validation | Result |
| --- | --- |
| Mobile TypeScript | Passed |
| Full mobile test suite | 299 passed, 0 failed (including four new API-environment tests) |
| Production Android Expo export | Passed; Hermes bundle and assets in `/tmp/onusfit-play-android-export` |
| Expo public configuration | Passed; OnusFit / onusfit / both package IDs / old project ID / fitonus scheme preserved |
| Expo native plugin introspection | Passed; no credentials changed |
| EAS schema and profile inheritance | Passed offline using the installed CLI's EAS schema/resolver; internal-testing resolves to app-bundle/store/production/non-development/remote credentials |
| Native Android release checks | Passed `:app:processReleaseManifestForPackage` and `:app:compileReleaseKotlin` with existing dependencies in offline mode; non-blocking dependency/Kotlin/Gradle deprecation warnings |
| Final local release manifest | Package com.tuneonus.onusfit, versionCode 1, versionName 1.0.0, minSdk 24, targetSdk 36, non-debuggable; retained fitonus scheme |
| Release bundle inspection | Both standalone Expo and native Gradle Hermes output contain the production API host and no DEV API host; both still contain the legacy hardcoded profile identity |
| Production API probes | BLOCKED: all three GET probes returned 404 |
| Remote EAS validation | BLOCKED: current `eas project:info` still reports FitOnus vs onusfit mismatch |
| Device installation, AAB signing and Play acceptance | Not performed; no signed AAB/cloud build/upload was authorized |
| Backend/admin | Not affected by these preparation changes; not rerun |
| Diff and Git index | `git diff --check` passed; index remains empty |

No dummy personal data was introduced; the packaged pre-existing legacy profile violates the requested no-dummy-data requirement and must be fixed before sign-off. Compilation/export success does not override this launch blocker. Current target API 36 matches the stated current new-app minimum; recheck Console requirements at upload time. [Google target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

Secret-signature inspection covered 785 tracked application/config files: two findings were reviewed as local Docker Compose URLs with environment interpolation; no unresolved credential signature was found. This is not a guarantee: ignored .env files, remote EAS secret stores, build history and Git history were not audited or displayed. Public variables are bundled into mobile code, so API/AI/database private keys must stay server-side. Logs: `/tmp/onusfit-play-*.log`, profile resolution `/tmp/onusfit-play-resolved-profiles.json`, read-only API results `/tmp/onusfit-launch-api-check.json`, secret-signature scan `/tmp/onusfit-play-secret-scan.json`.

Real Play-installed Android devices must verify:

- Cold start, Android back navigation, process death/relaunch, min/target Android support, 16 KB page-size device compatibility, crashes/ANRs and native module behavior. Compilation alone is insufficient.
- Email signup/login against the confirmed production backend using authorized accounts; invalid credentials, refresh expiry, logout/relaunch, password reset, account deletion, cross-account isolation, deep links and legacy route removal. Do not expose credentials in logs or reviewer notes in this repository.
- Workout creation/logging, real exercise catalog, meals/water/weight/goals/progress, offline save and reconnect deduplication, fresh-account empty states; no sample identity/metrics.
- Camera/photo/microphone/notification deny/allow/revoke behavior; audio interruption; notification scheduling/cancellation/taps and permission prompt; background/boot behavior only if supported. No wearable data without a provider.
- App name, masked adaptive icon, splash, monochrome themed icon, white-alpha notification small icon rendering, accessibility/text sizes/dark mode. Current full-color launcher icon is unsuitable as a confirmed final Android notification glyph.
- Policy links, in-app deletion, actual photo/audio retention and AI disclosure/consent, HTTPS behavior, approved permissions and backup/token behavior. SecureStore falls back to in-memory storage on failure; test persistence and failure UX. No crash-reporting service is configured in the current logger, so arrange authorized device logs/private feedback for pilot crashes.

When an actual approved APK installed by Play is available, optional read-only device checks (replace nothing with production secrets):

```bash
adb shell dumpsys package com.tuneonus.onusfit
# Launch/reproduce manually, then capture only relevant app logs in a private location.
adb logcat --pid="$(adb shell pidof -s com.tuneonus.onusfit)"
```

Inspect flags for non-debuggable release and target/version; review logs privately for sensitive data before sharing. Do not install an AAB directly with adb.

## Estimated remaining work

Planning estimate, not a delivery/review guarantee: 1–3 engineering days after an approved working backend and final assets are available to address the identified auth/legacy-route/privacy/permission gaps and device validation; approximately 1–3 hours of owner dashboard/signing/tester setup when account verification is already complete. EAS build queues, Play processing and account/identity reviews add external time (potentially days or longer). Backend deployment remediation and asset creation cannot be estimated from this repository alone. No launch date is committed.

# OnusFit — new Expo project and DEV Internal Testing setup

Date: 2026-11-10 (Asia/Kolkata).

## Approved scope and result

The user explicitly approved **project creation and verified linkage only** after the authenticated lookup confirmed `@tuneonus/onusfit` did not exist. Signing credential creation/reset and cloud builds remain unapproved.

| Field | Verified value |
| --- | --- |
| Expo identity | `@tuneonus/onusfit` |
| Owner | `tuneonus` (`eas whoami` confirmed account Owner access) |
| New EAS project UUID | `17a2344d-80a9-4fd9-8b88-589ed4801e4b` |
| App display name | `OnusFit` |
| Local Expo slug | `onusfit` |
| Android application ID | `com.tuneonus.onusfit` |
| iOS bundle ID | `com.tuneonus.onusfit` |
| Deep-link scheme | `fitonus` (unchanged) |
| Internal Testing API base | `https://fitonus-api-dev.onrender.com/api/v1` |
| Internal Testing artifact | Android AAB / release mode / store distribution |
| EAS environment for this profile | `preview`; this selects server environment variables, not a debug Android variant |
| Old project retained | `@tuneonus/FitOnus`, UUID `ede4995a-e0ad-4753-9932-e2f9cfabb0bf` |

Creation used the installed supported `eas project:init --account tuneonus --json --non-interactive --no-icon` command in an isolated temporary project context with no previous EAS ID. No `--force`, replacement of the old project, new app scaffolding, dependency installation or signing setup was used. The returned new UUID was independently queried and verified for owner/slug before the repository's ID was replaced. EAS project slug/name is `onusfit`; the app's display name remains `OnusFit` in Expo configuration.

## Files changed in this setup

- `mobile/app.json`: only `extra.eas.projectId` changed from the prior local state, after verification. The Android/iOS IDs, scheme, assets, permissions, plugins and owner were preserved.
- `mobile/eas.json`: only the `internal-testing` profile gained an explicit DEV API override and `environment: preview`. It still inherits release AAB/store/remote-signing settings. The entire production profile, production backend URL and release fallback source are unchanged from the start of this task.
- This setup report; historical readiness documents link the current testing decision.

The mobile API client expects the `/api/v1` prefix, so the profile uses the requested DEV hostname with `/api/v1`. No database credentials or private keys were added to public variables. Unrelated existing changes and local-only backend maintenance scripts remain unstaged.

## DEV API verification

Read-only unauthenticated requests found:

- `/health/live`: 200, application status ok.
- `/health/ready`: 200, application status ok.
- `/api/v1/openapi.json`: 200 (the deployed API's documentation title is still Generic Backend API; local rebranding was not deployed here).
- `/api/v1/profile/me`, `/api/v1/workouts/exercises`, `/api/v1/nutrition/daily`: expected 401 UNAUTHENTICATED responses without credentials.

These establish reachability, readiness and protected-route presence; successful user login and real-device feature behavior were not exercised. No account was created, no personal record was written, and no Neon database/script was modified. The readiness health check may read database connectivity; it does not change data. `/tmp/onusfit-devsetup-api.json` records probe results.

The production hostname may remain unavailable as documented earlier; it is not used by this Internal Testing profile. Production settings were not changed and no deployment was performed.

## Assets approved for this test

The user explicitly authorized existing `icon.png` and splash assets for this testing build. Their bytes and references were preserved. Existing icon.png still contains FitOnus text; current adaptive/monochrome assets and unused splash-icon/web favicon include Expo glyphs. Active native splash still references icon.png. No new logo, splash design or icon asset was generated. Earlier final-brand asset requirements remain relevant for a polished public launch, but are not treated as an unapproved replacement requirement for this test.

## Update and push dependencies

The repository has no active expo-updates dependency, updates URL, runtimeVersion or EAS Update channel, and the native updater remains disabled. Notifications schedule local reminders; no Expo push-token registration/backend delivery path or service configuration was found. No update URL, notification plugin, scheme, storage key, authentication contract or backend route was changed. Project-scoped environment/integration settings and credential assignments must not be assumed to transfer from the old project. The old project's identity was independently rechecked and remains unchanged.

## Android signing safety

A metadata-only authenticated read checked the exact package `com.tuneonus.onusfit` in **both** `@tuneonus/FitOnus` and `@tuneonus/onusfit`: both returned an empty Android credential list for that package. Only public metadata fields were selected; no keystore bytes, passwords or private keys were queried. This means no credential record is assigned for this package in these two projects; it does not establish that no reusable approved key exists elsewhere.

The only current-repository signing file previously found is the debug keystore. Native `release` has no debug-signing fallback. Raw local release output is unsigned until approved signing is configured; compilation is not signing validation. EAS `credentialsSource: remote` is only a selection policy, not proof of a configured or approved key. No TuneStack files, project records or credentials were referenced, read or reused.

Google Play Console registration for this package remains **unverified** because no authenticated Console access is available here. A missing public store listing would not prove a draft/private registration is absent.

Required next gate:

1. Owner checks the intended Play Console account's All apps for `com.tuneonus.onusfit`. If it exists, record its **upload certificate SHA-256** and **app-signing certificate SHA-256** separately from App integrity → App signing.
2. Confirm the correct identity mapping: OnusFit / owner tuneonus / package com.tuneonus.onusfit / new Expo UUID above. Do not select a TuneStack key or infer approval from an alias.
3. Explicitly approve either a dedicated new OnusFit upload-key creation/configuration, or use of an existing key identified by its approved public SHA-256. No creation/import/reset happens without that approval.
4. After approval, store encrypted keystore backups outside this repository and build archive; keep passwords separately in a password manager and a second protected backup. Never paste private material into chat or commit it.
5. Before any first AAB upload, use `jarsigner -verify /absolute/path/OnusFit.aab` and `keytool -printcert -jarfile /absolute/path/OnusFit.aab` to compare the artifact's public signer against the approved **upload** certificate. Separately confirm package/versionCode and Play's application-signing certificate. Stop on mismatch instead of resetting credentials.
6. A cloud build requires separate explicit approval after signing is configured. No EAS build/submit/upload was started.

## Validation

Local checks are running; results will be finalized after export/native verification. Full mobile tests/typecheck and the linked project's config/info are part of this verification. Existing user-facing privacy-policy and Play declaration tasks from the release-readiness report still need completion before a Play rollout; this setup does not claim store approval or public release readiness.

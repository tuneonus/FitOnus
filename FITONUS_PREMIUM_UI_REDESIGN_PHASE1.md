# FitOnus premium mobile UI redesign — Phase 1

Date: November 9, 2026 · Project: `mobile/` · Expo SDK 58

## Delivery and scope

Home is redesigned around a new athletic editorial direction. Shared color infrastructure and opt-in premium components support subsequent screen work. Existing route names, stores, logging methods, screen registry, gesture handlers and native configuration are preserved.

**Bottom navigation layout is deferred by explicit user direction.** `src/shared/components/common/BottomNav.tsx` was already being edited in another session; the user asked to keep it protected. Its existing presentation receives the shared palette, but this task does not claim improvements to its geometry, icon alignment, labels, animation code or touch targets.

No screen was deleted. This task does not change backend APIs, database schemas, native dependencies, Android build configuration, or package manifests. No commit, push, deployment or APK build was performed. A local Expo web preview is used for layout checks only.

## 1. Existing UI audit

This audit examined source architecture, theme infrastructure, shared controls, the Home components, and the workout, nutrition, Coach and progress screens before implementation. The original Home was not independently captured on an Android device.

| Area | Finding | Phase 1 response |
| --- | --- | --- |
| Architecture | The Expo root mounts the existing custom NavigationProvider, AppShell and screen registry. The five-tab state, swipe-back and modal gestures already have separate worklet logic. | Keep this architecture intact; compose the registered Home screen from focused components. |
| Tokens | `constants/theme.ts` and `shared/theme/tokens.ts` duplicated colors. Legacy spacing names represent different values across the two exports. | Use the semantic palette as the source for compatible theme aliases. Introduce an explicit premium layout/type scale without renaming legacy spacing exports. |
| Hierarchy | The largest initial Home section was a recovery/AI brief. Nutrition, water and logging were secondary. | Lead with actual daily fuel and protein; keep meal logging next to the overview. |
| Data trust | DailyBrief and BodySignals import fixed recovery, sleep, heart-rate and readiness examples from `homeMock.ts`. A simulated health connection could reveal these examples as if observed. | Remove those components from Home composition. Display only API/store observations, unavailable states and existing workout-plan configuration. Keep their files and all routes available. |
| Typography | Numerous component-specific sizes, including 10.5–12 px labels, mixed with repeated large card titles. | Introduce restrained type roles, tabular numerals and a clear display/section/metric/body hierarchy. |
| Cards | Rounded bordered cards appeared repeatedly inside a long dashboard, often with their own miniature card grids. | Limit Home surface grouping to fuel, training and Coach. Use flat ruled sections for water, movement, sleep and recovery. |
| Spacing | Per-component vertical margins compound; tiny inner gaps coexist with broad decorative hero spacing. | Use a 4-based scale with 12 px related-content gaps, 20 px gutters and 32 px section separation. |
| Buttons | Repeated pills, meal slots and small icons compete with the main task. The shared Button is protected by another session. | Add an opt-in ActionButton; retain existing Button behavior elsewhere. Make “Log a meal” the explicit primary action. |
| Bottom navigation | Five tabs and the central Coach control already have haptics, springs, drag interactions and selected accessibility state. Layout changes would overlap another session. | Protect the file and navigation state; inherit the new palette only. |
| Workout UI | Original Home included a hard-coded recovery justification and many stacked details. Starting versus resuming was not explicit in the Home action label. | Present the existing plan honestly as plan configuration, preview two exercises, and distinguish Start, Resume and View summary. |
| Nutrition UI | Home used static nutrition goals instead of all available per-user targets. Macro bars and meal-slot grids competed for space. | Use the daily nutrition endpoint’s targets, show three primary macros and retain the full diary and logging flows through existing routes. |
| Coach UI | The full Coach flow already supports conversations, rich blocks, actions, history, memory and voice. Home duplicated substantial explanation around it. | Add a compact Coach entry with direct chat and voice navigation; preserve the Coach implementation. |
| Progress UI | Existing range controls, charts, analytics stores and insight cards are already separate from Home. | Audit only; defer layout redesign. Fix shared chart theme detection to depend on `isDark`, rather than a specific hex value. |
| Accessibility | Some Home actions have small labels, dense rows, or insufficiently explicit semantics. Skeletons pulse without respecting reduced motion. | Use 48 px controls, labeled actions, header semantics, readable text pairs, wrapping layouts and reduced-motion-aware feedback/skeletons. |

## 2. Design direction

**Athletic editorial:** quiet chalk and forest surfaces, a single citron action accent, deliberate type scale and data-first composition. Fitness identity comes from a decisive numeric hierarchy and useful training/logging controls rather than decorative rings, stock photos, glow, gradients or glass.

- A compact FITONUS wordmark and local date introduce the day. The greeting uses the saved profile/auth name.
- Daily fuel is the main visual anchor. The value means calories consumed; remaining versus above-goal text states the interpretation explicitly.
- Protein, carbs and fat have visible amounts, goals and bars. Meaning is present in text as well as color.
- At narrow widths or larger system text, compact presentation reduces ornament and allows content to wrap.
- Training keeps the existing active/completed state and existing plan/exercise data. Plan duration and sets are configuration, not newly invented performance metrics. The existing starter template can appear until another plan is chosen; Home labels it as a workout plan and does not present its old “week of program” focus text as actual user progress.
- Water and health details use spacing and dividers instead of additional nested cards.
- Coach remains one clear route into chat or voice, with no hard-coded AI readiness claims.

## 3. Design tokens

Canonical semantic colors: `mobile/src/shared/theme/tokens.ts`. Compatibility aliases: `mobile/src/constants/theme.ts`. Premium layout/type: `mobile/src/shared/theme/premium.ts`.

| Role | Light | Dark |
| --- | --- | --- |
| Background | `#F5F5F0` | `#101713` |
| Surface | `#FFFFFF` | `#1A251E` |
| Secondary surface | `#EAEDE5` | `#243128` |
| Primary text | `#17231D` | `#F4F4EE` |
| Secondary text | `#606C63` | `#A6B5A8` |
| Divider | `#DCE2D8` | `#35453A` |
| Action accent | `#C7EF72` | `#C7EF72` |
| Accent ink | `#192812` | `#192812` |
| Accent text on ordinary surfaces | `#42651E` | `#C7EF72` |
| Inverse feature surface | `#14291F` | `#1A3024` |
| Inverse secondary text | `#B1C1B4` | `#B1C1B4` |

| Token | Value / usage |
| --- | --- |
| Space | 4, 8, 12, 16, 24, 32, 40 px |
| Screen gutter | 20 px |
| Content maximum | 640 px, plus gutters |
| Minimum new action target | 48 px |
| Control / card / feature radius | 14 / 20 / 24 px |
| Display | 36 / 42 px, 700 weight |
| Main numeric value | 44 / 52 px, 700 weight, tabular numerals |
| Section title | 22 / 28 px, 700 weight |
| Metric | 24 / 32 px, 600 weight, tabular numerals |
| Body | 15 / 22 px |
| Label | 14 / 20 px, 600 weight |
| Caption | 12 / 18 px |
| Eyebrow | 11 / 16 px, 700 weight, 1.6 tracking |
| Press / settle | 100 / 180 ms; reduced motion disables scale travel |

System fonts are used; there is no font download or new native dependency. Existing shared color consumers receive the palette globally. Premium typography and geometry are opt-in; the remaining screens retain their existing layouts.

## 4. Screen and Home components changed

Only the registered Home screen is redesigned.

| File under `mobile/src/` | Result |
| --- | --- |
| `features/home/screens/HomeScreen.tsx` | New composition, bounded content, pull-to-refresh, saved/error states and explicit logging entry points. |
| `features/home/components/HomeHeader.tsx` | Saved-name greeting, device-local date, profile and notification access. Mock-backed unread decorations are not shown. |
| `features/home/components/NutritionSummary.tsx` | Fuel, actual saved targets, three macros, above-goal messaging and an unavailable-data fallback. |
| `features/home/components/QuickActions.tsx` | Primary meal logging and secondary workout, weight and report actions. |
| `features/home/components/RecommendedWorkout.tsx` | Existing workout plan preview, start/resume/completed actions and plan customization. Hard-coded recovery claims removed. |
| `features/home/components/HomeSkeleton.tsx` | Skeleton follows the new fuel layout; the rest of Home remains actionable while nutrition loads. |
| `features/home/components/HydrationSummary.tsx` | Observed water amount and saved goal; opens the existing nutrition logging flow. |
| `features/home/components/CoachEntry.tsx` | Existing Coach tab and voice routes. |
| `features/home/components/DailyMovement.tsx` | API-backed steps and active time; clear unavailable sleep/recovery states and health-integration access. |
| `features/home/hooks/use-home-overview.ts` | Independent today query, existing dashboard query, local-day rollover and refresh coordination. |
| `features/home/utils/home-overview.ts` | Pure date, pending-log merge, target and progress calculations. |

### Real data and logging preservation

- Profile/auth stores supply the name; the live dashboard query supplies health summary values.
- `/nutrition/daily?date=…` supplies consumed nutrition and per-user targets through the existing `nutritionApi`. No endpoint or contract is changed.
- The new query uses the existing `dashboard` invalidation prefix. Existing meal/water/offline actions invalidate it without modifying logging services.
- Matching in-memory daily data may be used on network failure. Historical data is never relabeled as today. No demo dashboard fallback is used.
- Same-day unsynced meals are merged with server totals; returned server meal IDs prevent double counting.
- Observed optimistic water additions remain visible while older query results refetch. Historical diary water is excluded.
- A missing target remains missing. Zero totals are displayed only when data confirms an empty day or actual local entries exist. Progress is clamped; above-goal amounts remain explicit.
- Viewing Home does not reset the diary date. Explicit meal/water entry actions intentionally open today through existing navigation/store methods.
- Existing plans and active-workout data are retained. Resuming navigates back to the active workout without calling `startSession` again.
- No meal or workout is created as part of production render or data fetching.

## 5. Shared components changed

| Component | Compatibility |
| --- | --- |
| New `ActionButton` | Opt-in button with minimum target, press feedback, haptics, busy/disabled semantics and reduced-motion handling. Protected existing Button is untouched. |
| New `MetricDisplay` | Labeled, tabular numeric content with optional unit/detail and grouped screen-reader text. |
| New `ActionRow` | Accessible ruled action row for health/detail entry points. |
| `Card` | Optional `appearance="premium"`; existing props and default dimensions remain available. |
| `SectionHeader` | Optional premium title/action treatment; headers and actions expose explicit roles. |
| `EmptyState` | Optional premium type/button; existing defaults retained. Omit empty body text nodes. |
| `ProgressBar` | Optional progress accessibility label/value; existing value/progress/max inputs retained. |
| `Skeleton` | Respects system reduced motion; existing API retained. |
| `ProgressRing`, `BarChart` | Use `isDark` for theme-dependent tracks. Ring rotation uses an explicit SVG transform for web/native compatibility. |

## 6. Navigation and concurrency preservation

This task does not edit `NavigationContext.tsx`, `AppShell.tsx`, `screenMotion.ts`, `BottomNav.tsx`, `BottomSheet.tsx`, `ConfirmDialog.tsx`, `Screen.tsx`, the screen registry or routes. Five tabs, central Coach FAB, tab state preservation, haptics and existing gesture handlers remain owned by their current implementation.

Git status was inspected before implementation and before edits. Existing modified/untracked files were recorded to avoid overwriting other work. Another session continued changing protected navigation/modal files during this task; those changes are not part of this redesign. The user explicitly kept BottomNav protected.

A concurrent session also introduced compatibility defaults in NutritionSummary and QuickActions while work was underway. Editing paused on those files until the user confirmed the other session was paused. Compatibility was retained, and hard-coded nutrition fallback goals were replaced with unavailable states.

## 7. Validation

Final source checks completed successfully. No task source file changed during the final validation run.

| Check | Result | Evidence |
| --- | --- | --- |
| `cd mobile && npm run typecheck` | Passed, exit 0 | [TypeScript output](Resources/docs/fitonus-premium-ui-phase1/typecheck.txt) |
| ESLint on all 25 task TypeScript/TSX files, including the new tests, with `--max-warnings 0` | Passed, no errors or warnings | [Lint output](Resources/docs/fitonus-premium-ui-phase1/lint.txt) |
| `cd mobile && npm test` | **221 tests passed, 89 suites, zero failures** | [Full test output](Resources/docs/fitonus-premium-ui-phase1/mobile-tests.txt) |
| Existing navigation/gesture tests | Passed within the full suite; includes swipe-back, sheet thresholds, tab-drag mathematics and tab-state contracts | Full test output above |
| New Home tests | 18 passed: daily data/target fidelity, offline merging, deduplication, date isolation, water updates, over-goal values, safe progress and text contrast | [India-timezone run](Resources/docs/fitonus-premium-ui-phase1/home-tests-asia-kolkata.txt) |
| `TZ=Asia/Kolkata … tsx --test tests/home-overview.test.ts` | 18 passed; verifies the early-morning local date boundary in the relevant timezone | India-timezone run above |
| Task-specific `git diff --check` | Passed | Checked only task files, excluding unrelated in-progress edits |
| Expo web render | Light and dark, 390 × 844 and 320 × 740; no horizontal document overflow and five accessible tabs | [Browser results](Resources/docs/fitonus-premium-ui-phase1/browser-results.json) |
| Browser interaction smoke checks | Open meal entry and return; start a workout; return to Home and find Resume; enter Coach. Passed in both themes. | Browser results above |
| Browser empty/error states | Confirmed zero totals with absent targets and HTTP 503/unavailable nutrition with Retry and no invented totals | Browser results above |
| Android device QA | **Pending**; see section 9 | No emulator/device acceptance or APK build claimed |

The final 320 px preview places the primary meal action at y=584 with a 48 px height; it remains visible in the 740 px viewport. New small-text color pairs tested for Home meet at least 4.5:1 contrast on their intended surfaces. This is not a claim that all legacy screens have undergone a full accessibility audit.

Browser screenshots use intercepted API fixtures in an isolated browser context, with synthetic identity and measurements. Production code reads the existing endpoints and stores; no preview fixture or fake goal is shipped in Home. Browser QA did not write to the live backend, send a Coach message, or save a workout. Real-device haptics, native gestures, server synchronization and accessibility still need the manual checks below.

The web SVG rotation warning observed during review was resolved in the shared ProgressRing. Final normal-state previews have no uncaught page errors or DOM-property error toast. Expected HTTP 503 messages occur in the intentional error-state scenario. Existing dev-server warnings about helper files inside Expo Router’s route directory and the auth import cycle remain outside this scope.

### Review previews

| View | Light | Dark |
| --- | --- | --- |
| Home, 390 px | [Light Home](Resources/docs/fitonus-premium-ui-phase1/home-light-390.png) | [Dark Home](Resources/docs/fitonus-premium-ui-phase1/home-dark-390.png) |
| Home, 320 px | [Compact light Home](Resources/docs/fitonus-premium-ui-phase1/home-light-320.png) | [Compact dark Home](Resources/docs/fitonus-premium-ui-phase1/home-dark-320.png) |
| Water / Coach / movement | [Light lower sections](Resources/docs/fitonus-premium-ui-phase1/home-light-lower.png) | [Dark lower sections](Resources/docs/fitonus-premium-ui-phase1/home-dark-lower.png) |
| Zero day, no saved targets | [Empty day](Resources/docs/fitonus-premium-ui-phase1/home-light-empty.png) | — |

Reference documentation was consulted as required by the mobile AGENTS.md: [Expo v57 SDK reference](https://docs.expo.dev/versions/v57.0.0/) and the project’s [Expo v58 SDK reference](https://docs.expo.dev/versions/v58.0.0/). The installed SDK and dependencies were retained.

## 8. Remaining screens and follow-up work

All existing screen registry entries remain. Workout detail/generation/logging/history, the full nutrition diary/search/photo/barcode/voice flows, Coach conversations/history/memory/voice, Progress analytics, activity, goals, challenges, reports, settings, profile, device integration, auth and onboarding are not redesigned in this phase.

Recommended sequence for later phases:

1. Finish navigation geometry once the protected file is available: balance the central FAB, align icons/labels, verify 48 px targets and selected states without changing state management.
2. Carry premium type and density into workout list, plan, active session and completion.
3. Redesign nutrition diary, search/detail and meal-entry sheets using the new components.
4. Refine Coach message/composer density while retaining rich blocks and actions.
5. Apply readable chart treatment and editorial hierarchy to Progress and reports.
6. Refine onboarding/profile/settings, then complete an app-wide accessibility and dark-mode review.

Existing non-Home demonstration content and data-adapter limitations remain outside this UI phase. Home does not claim those demo values as observations. Cold-start offline visibility depends on existing store/query hydration; if no matching in-memory day is available, Home shows unavailable data rather than invented totals.

## 9. Android visual QA requirements

These are required manual checks; web preview and unit tests do not establish native-device acceptance.

- Check 320, 360, 390 and 430 dp widths, a tablet, and landscape. Verify primary meal logging remains easy to reach, labels wrap, and values do not clip.
- Check light, dark and system theme; change theme while Home and another tab are open. Review the remaining screens because semantic colors are shared.
- Check Android font scales 1.0, 1.3, 1.5 and 2.0 and larger display size. Inspect fuel/macros, health rows, all action labels and bottom navigation.
- Use TalkBack to verify reading order, header landmarks, units, unavailable states, action names, progress announcements and tab selection.
- Enable reduced motion. Verify skeletons stay still, new buttons do not scale, and the existing gesture/navigation preferences remain respected.
- Verify haptics on an actual device, touch targets, system gesture-navigation insets, three-button navigation and edge-to-edge safe areas.
- Switch tabs while a workout is active; return and resume with elapsed time and set logs retained. Complete a workout through the existing flow and confirm its summary and history.
- Log meals and water, edit/remove a meal, leave a historical diary date selected, and return to Home. Confirm today’s values and server targets after successful synchronization.
- Test no targets, no wearable, a genuine zero day, values over target, no network, stale cache, pending offline entries, request failure/retry and midnight rollover in Asia/Kolkata.
- Verify all five tabs, per-tab nested state, reselect-to-root, drag tab selection, swipe-back, modal drag dismissal, Android hardware back and keyboard hide/show.
- Verify Coach chat, history, voice entry and action blocks; complete meal-photo/barcode/voice and workout logging smoke checks.

No APK or native Android build was triggered for this task.

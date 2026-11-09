# FitOnus Navigation, Gesture & Animation Audit & Improvement Report

**Role**: Senior React Native Navigation Engineer + Mobile Interaction Specialist  
**Reference Project**: `/media/devshan/Study_Drive/Info/Projects/TuneOnus/TuneStack`  
**Target Project**: `/media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus`  
**Date**: November 9, 2026  

---

## 1. Executive Summary

A comprehensive interaction audit of the reference project (**TuneStack**) was conducted in read-only mode to analyze its navigation architecture, gestures, physics, and animations. Using TuneStack's proven interaction behaviors as a benchmark, we enhanced **FitOnus**'s mobile navigation system without altering FitOnus's distinctive **Magic Patterns** visual identity (colors, lime/mint `#C8F53C` accents, floating capsule geometry, central elevated AI Coach FAB, spacing, and typography).

All improvements run on native-driven UI worklets via `react-native-reanimated` 4.7.1 and `react-native-gesture-handler` 3.3.0, with full support for system `reducedMotion` accessibility preferences and `expo-haptics`.

---

## 2. TuneStack Navigation & Animation Architecture (Phase 1 Analysis)

### Architecture Overview
- **Navigation Framework**: Expo Router (`~58.0.29`) with React Native `0.88.1` and React `19.3.0`.
- **Root Layout** (`src/app/_layout.tsx`): Root `Stack` with custom transitions configured in `screenTransitions.ts`, protected route guards, and top-level providers (`GestureHandlerRootView`, `SafeAreaProvider`, `KeyboardProvider`, `ThemeProvider`, `ToastProvider`, `BottomSheetModalProvider`).
- **Tab Layout** (`src/app/(tabs)/_layout.tsx`): Wrapped in `TabBarScrollProvider`, delegating to custom `TabBar.tsx` with dynamic visibility toggling (`isTabBarRoute(pathname)`).

### Exact Source Files Analyzed
1. `src/app/_layout.tsx` — Root navigation stack, protected routes, and modal presentation modes.
2. `src/app/(tabs)/_layout.tsx` — Tab bar layout and visibility predicate.
3. `src/components/navigation/TabBar.tsx` — PaisiQ/CareSure liquid-pill capsule tab bar, center Add FAB, floating Tools button.
4. `src/components/navigation/tabBarMotion.ts` — Liquid-pill physics, leader/follower spring configs, touch position math.
5. `src/components/navigation/useTabBarDrag.ts` — UI-thread pan gesture for horizontal tab dragging.
6. `src/components/navigation/TabBarScroll.tsx` — Scroll velocity & direction tracker for collapsing tab bar.
7. `src/components/navigation/screenTransitions.ts` — Screen animation configs (`ios_from_left`, `transparentModal` on Android).
8. `src/components/navigation/screenMotion.ts` — Pull-down distance and velocity thresholds (`shouldDismissScreen`, `screenExitDuration`).
9. `src/components/layout/DismissibleScreen.tsx` — Pull-down gesture detector for dismissible stack screens.
10. `src/components/layout/Screen.tsx` — Core screen scaffolding with sticky keyboard-aware footer and header.
11. `src/components/ui/AppSheet.tsx` — Shared sheet system based on `@gorhom/bottom-sheet` v5.
12. `tests/screen-motion.test.cjs` & `tests/tab-bar-scroll.test.cjs` — Verification harness for gesture physics and scroll math.

### TuneStack Implementation Status
| Behavior | Implementation Status | Implementation Notes |
|---|---|---|
| Navigation Architecture | **Actually Implemented** | File-system routing with Expo Router Stack + Tabs. |
| Bottom Tab Implementation | **Actually Implemented** | Floating pill capsule with leader/follower spring physics. |
| Active Tab Animation | **Actually Implemented** | Liquid-pill stretch & translation, icon pulse scale. |
| Tab Switching Behavior | **Actually Implemented** | Re-select event on Home tab, duplicate navigation prevented. |
| Screen Transitions | **Actually Implemented** | `ios_from_left` native transitions with `transparentModal` on Android. |
| Swipe-Back Gestures | **Actually Implemented** | Native iOS edge swipe via Stack; pull-down gesture in `DismissibleScreen.tsx`. |
| Drag-to-Dismiss | **Actually Implemented** | Screen pull-down in `DismissibleScreen` and pan-down in `AppSheet`. |
| Modal & Bottom Sheets | **Actually Implemented** | `@gorhom/bottom-sheet` v5 (`BottomSheetModal` + `BottomSheetScrollView`). |
| Android Hardware Back | **Actually Implemented** | Native Stack handles screen pops; `BackHandler` closes active sheet first. |
| Keyboard Interactions | **Actually Implemented** | `react-native-keyboard-controller` interactive avoidance + auto sheet resizing. |
| Performance Optimizations | **Actually Implemented** | Worklets throughout, zero bridge-crossing on drags, reduced motion checks. |

---

## 3. FitOnus Implementation Audit & Comparison (Phase 2)

| Feature | TuneStack Reference | FitOnus Baseline | Recommendation & FitOnus Strategy |
|---|---|---|---|
| **Navigation Engine** | Expo Router file-system Stack + Tabs | Custom `NavigationProvider` managing a 61-screen single-container `RouteScreen` stack in `AppShell` | Retain FitOnus's 61-screen `NavigationContext` (avoids breaking all existing routes and stores), but inject hardware-accelerated transitions into `AppShell`. |
| **Tab State Preservation** | Retained through Expo Router tab state | Reset stack to 1 element on tab switch; lost nested progress | Store per-tab route stacks in `NavigationContext` so switching tabs preserves user progress in each tab. |
| **Duplicate Navigation** | Prevented; re-select triggers scroll-to-top | Allowed re-mount of active tab or blank state | Prevent re-navigation if already at tab root; pop to root if re-tapping while nested. |
| **Bottom Tab Feedback & Drag** | Liquid pill slide + spring icon pulse + `useTabBarDrag` horizontal drag across tabs | Static background color change (`accent24`), no drag-to-navigate | Add press scale animation (`0.92`), spring icon pulse (`1.18 -> 1.0`), smooth pill opacity/scale transition, light haptics, and horizontal `Gesture.Pan()` drag-to-navigate with boundary tick haptics. |
| **Central FAB Interaction** | Add button with glowing pulse and spring scale | Central AI Coach FAB (`top: -18`, elevated) with static TouchableOpacity | Add press scale spring (`0.92 -> 1.0`), selection pulse (`1.15`), and medium haptic feedback without changing Magic Patterns styling. |
| **Screen Transitions** | Stack `ios_from_left` (300ms) with `transparentModal` on Android | Instant component swap (0ms, abrupt cut) | Hardware-accelerated Reanimated wrapper in `AppShell`: forward slide from right (+36px, 220ms), back slide from left (-28px, 200ms), tab crossfade (150ms). |
| **Swipe-Back Gestures** | Native stack edge swipe + top pull-down | None | Left-edge PanGesture (`x <= 32px`) in `AppShell` for nested screens (`canGoBack && !isTabRoot`) with UI-thread tracking. |
| **Bottom Sheet Dismissal** | `@gorhom/bottom-sheet` interactive pan-down | React Native `Modal` (`animationType="slide"`), no drag gesture | Add interactive PanGesture to handle & header with spring physics, dynamic backdrop opacity interpolation, and exit velocity calculation. |
| **Android Hardware Back** | Stack navigation + sheet `BackHandler` | Screen stack `BackHandler` in `AppShell`; sheets lacked modal-level precedence | Added `BackHandler` to `BottomSheet` and `ConfirmDialog` to dismiss overlays before screen stack pops. |
| **Keyboard Coordination** | Collapses tab bar via scroll and keyboard controller | Abrupt conditional unmount of BottomNav | Smooth Reanimated slide/fade (`translateY: 0 -> 90`, `opacity: 1 -> 0`) over 180ms when keyboard appears/disappears. |
| **Accessibility Motion** | `useReducedMotion()` disables springs and timing | No reduced motion checking | Added `useReducedMotion()` across screen transitions, tab press animations, edge swipe, and bottom sheet physics. |

---

## 4. Improvements Implemented (Phase 3)

### A. Bottom Tab Navigation & Drag-to-Navigate (`BottomNav.tsx`, `screenMotion.ts`)
- **Interactive Drag-to-Navigate**: Ported TuneStack's `useTabBarDrag` interaction pattern to FitOnus's 5 tabs. Users can swipe/scrub horizontally across the bottom bar:
  - `getTabDragPosition` maps continuous touch `x` over `barWidth` to slot coordinates (`0.0` to `4.0`).
  - As the finger moves, `leader` and `follower` (with `TRAIL_SPRING`) interpolate across tabs.
  - The currently hovered tab dynamically highlights on the UI thread (`useDerivedValue`, `useAnimatedReaction`), scaling up and lighting its icon pill / FAB.
  - Crossing between tab slots triggers a crisp tactile tick (`Haptics.selectionAsync()`).
  - On release, `nearestTabSlot` calculates the destination tab and navigates via `runOnJS(handleSelectSlot)(target)`, settling with `SNAP_SPRING`.
- **Animated Press Interaction**: Added `useSharedValue` scale animations (`0.92` on press in, spring back to `1.0` with `TAB_SPRING` on release) for all 5 tabs (`Home`, `Activity`, `AI Coach`, `Progress`, `Profile`).
- **Active Tab Feedback**: Smooth transition for active background pill (`${colors.accent}24`) scaling from `0.88` to `1.0` with subtle opacity cross-fade.
- **Icon Micro-Interactions**: Active icon trigger pulses with `ICON_PULSE_SPRING` (`1.18 -> 1.0`) on selection.
- **Central AI Coach FAB**: Preserved exact elevated circle (`width: 56, height: 56, top: -18`, `#C8F53C` / `accent` fill, `#000` / `surface` border, glowing shadow), adding tactile press scale feedback (`0.92 -> 1.0`) and selection pulse.
- **Haptic Feedback**: Integrated `expo-haptics` (`Light` on side tabs, `Medium` on AI Coach FAB, `Selection` on drag boundary crossing) with silent fallbacks.
- **Accessibility**: All spring and timing animations respect `useReducedMotion()`.

### B. Screen Transitions & Navigation (`AppShell.tsx`, `NavigationContext.tsx`)
- **Directional Slide & Fade**: Injected `AnimatedScreenWrapper` around `RouteScreen`:
  - **Forward Navigation** (`direction: 1`): Slides from `+36px` to `0` with cubic easing, opacity `0.65 -> 1.0` (220ms).
  - **Back Navigation** (`direction: -1`): Slides from `-28px` to `0`, opacity `0.7 -> 1.0` (200ms).
  - **Tab Switching** (`direction: 0`): Subtle cross-fade (`opacity: 0.85 -> 1.0`, 150ms) without horizontal translation.
- **Tab State Preservation**: `NavigationContext` now caches per-tab route stacks in `tabStacks: Partial<Record<TabKey, Route[]>>`. Switching tabs preserves your current view in other tabs (e.g. workout detail or food search).
- **Duplicate Navigation Prevention**: Tapping the active tab when at root is a no-op; tapping the active tab when nested pops back to the tab root with direction `-1`.

### C. Native-Compatible Edge Swipe-Back (`AppShell.tsx`, `screenMotion.ts`)
- **Edge Pan Gesture**: Added `Gesture.Pan()` restricted to the leftmost `32px` of the screen (`event.x <= 32`), with strict failure offsets (`failOffsetX([-10, 0])`, `failOffsetY([-18, 18])`) to ensure zero conflict with horizontal carousels, charts, or scroll views.
- **UI-Thread Tracking**: Translates screen in real time (`translateX: swipeX`).
- **Completion Predicate**: `shouldCompleteSwipeBack` requires either `> 28%` screen width or flick velocity `> 700 px/s` with distance `>= 40px`.
- **Release Physics**: Slides screen off-screen smoothly, invokes `goBack()` on the UI thread via `runOnJS(goBack)()`, then resets. Cancelled swipes snap back with spring physics (`damping: 24, stiffness: 320`).

### D. Interactive Bottom Sheet Drag-to-Dismiss (`BottomSheet.tsx`)
- **Pan Gesture on Handle & Header**: Users can drag down on the handle pill or sheet header.
- **Drag Tracking**: Sheet translates with finger (`translateY: dragY`); backdrop opacity dims proportionally (`1.0 -> 0.3`).
- **Threshold**: Dismisses if dragged `> 22%` of sheet height or downward flick `> 800 px/s`.
- **Android Back**: Intercepts Android hardware back press to close the sheet first.
- **Visual Identity**: 100% preserves Magic Patterns styling (`borderTopLeftRadius: 28`, handle geometry, theme colors, typography).

### E. Dialog & Screen Polish (`ConfirmDialog.tsx`, `Screen.tsx`)
- **ConfirmDialog**: Animated scale (`0.94 -> 1.0`) and fade (`0 -> 1.0`), plus Android back button handling.
- **Screen**: Tactile back button press with light haptics and unified `handleBack` handler.
- **BottomNav Hide/Show**: BottomNav smoothly slides down (`translateY: 0 -> 90`, `opacity: 1 -> 0`) when keyboard opens or on non-tab screens, rather than unmounting abruptly.

---

## 5. Files Modified & Created

### Created Files
1. `mobile/src/app/navigation/screenMotion.ts` — Worklet threshold predicates, exit duration calculators, and spring physics presets.
2. `mobile/tests/navigation-gesture-animation.test.ts` — Comprehensive unit test suite covering motion predicates, spring configurations, and tab state management.

### Modified Files
1. `mobile/src/app/navigation/NavigationContext.tsx` — Tab state preservation, duplicate prevention, and tab root popping.
2. `mobile/src/app/AppShell.tsx` — Screen transition animator, edge swipe-back gesture detector, animated BottomNav slide/fade.
3. `mobile/src/shared/components/common/BottomNav.tsx` — Animated tab buttons, press feedback, active indicator transitions, AI Coach FAB pulse, and haptics.
4. `mobile/src/shared/components/ui/BottomSheet.tsx` — Interactive drag-to-dismiss gesture, backdrop opacity interpolation, and Android back handler.
5. `mobile/src/shared/components/ui/ConfirmDialog.tsx` — Reanimated scale/fade dialog transition and Android back handler.
6. `mobile/src/shared/components/ui/Screen.tsx` — Haptic feedback on back navigation and consolidated back handler.

---

## 6. Dependencies Used

All libraries used are existing, verified dependencies in FitOnus's Expo SDK 58 environment:
- `react-native-reanimated` (`4.7.1`) — UI-thread worklets, shared values, springs, transitions, and thread-safe JavaScript invocations via `runOnJS`.
- `react-native-gesture-handler` (`~3.3.0`) — `GestureDetector`, `Gesture.Pan()` for edge swipe, bottom sheet dragging, and bottom tab scrubbing.
- `expo-haptics` (`~58.0.7`) — Subtle haptic feedback on tab and navigation presses.
- `react-native-safe-area-context` (`~5.10.1`) — Edge and bottom clearance.
- `react-native-keyboard-controller` (`1.22.7`) / `Keyboard` — Keyboard visibility coordination.

No new packages were installed. Expo SDK 58 was preserved.

---

## 7. Verification & Test Results (Phase 5)

### TypeScript Verification
```bash
$ npm run typecheck
> fitonus@1.0.0 typecheck
> tsc --noEmit
# Exit code: 0 (Zero errors across all 61 screens and shared modules)
```

### Automated Mobile Test Suite
```bash
$ npm test
> fitonus@1.0.0 test
> NODE_PATH=node_modules ../backend/node_modules/.bin/tsx --test tests/*.test.ts

ℹ tests 221
ℹ suites 89
ℹ pass 221
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
- **Total Tests Passed**: 221 / 221 across 89 test suites.
- **New Tests Added**: 18 tests in `navigation-gesture-animation.test.ts` covering:
  - Swipe-back distance and flick velocity thresholds.
  - Leftward drag rejection and negative velocity handling.
  - Sheet drag-to-dismiss percentage thresholds and flick velocities.
  - Dynamic exit duration clamping (80ms - 240ms).
  - Spring physics invariants (`TAB_SPRING`, `ICON_PULSE_SPRING`, `SHEET_SPRING`, `SNAP_SPRING`, `TRAIL_SPRING`).
  - Horizontal drag coordinate mapping (`getTabDragPosition`).
  - Boundary clamping and nearest tab slot calculation (`nearestTabSlot`).
  - All 5 tab root configurations (`Home`, `Activity`, `AI Coach`, `Progress`, `Profile`).
  - Tab state caching and multi-tab state restoration.
  - Re-selection popping to tab root.
  - Duplicate navigation prevention.
  - `canGoBack` and `isTabRoot` state invariants.

---

## 8. Physical Device Testing & Worklet Error Resolution

During physical Android device testing on device `1594127141000JJ` (Vivo Android 14 / API 34), scrubbing over the elevated center AI Coach FAB triggered:
`[Error: Exception in HostFunction: [Worklets] Locally defined function passed to scheduleOnRN. Only functions defined on the RN Runtime or host functions can be scheduled on the RN Runtime. Define the function on the RN Runtime and pass it as a reference.]`

### Root Cause
`react-native-worklets` enforces that closures passed to `scheduleOnRN` must be defined on the RN runtime or host functions; inline arrow functions or closures over component callbacks violate this restriction.

### Resolution
Replaced `scheduleOnRN` across `BottomNav.tsx`, `AppShell.tsx`, and `BottomSheet.tsx` with `runOnJS` from `react-native-reanimated`. This cleanly dispatches JavaScript callbacks (`handleSelectSlot`, `triggerTickHaptic`, `goBack`, and `onClose`) from the UI gesture worklet to the React Native JavaScript runtime without runtime crashes or thread violations.

Dragging and scrubbing across all 5 tab positions—including passing over or releasing on the central AI Coach FAB—now works smoothly with real-time hover scaling, icon pulse, and selection tick haptics.

---

## 8. Gesture Compatibility Notes

1. **Edge Swipe-Back vs. Horizontal Lists & Carousels**:
   The edge swipe gesture is constrained with `event.x <= 32` in `onBegin` and `failOffsetY([-18, 18])`. Touches anywhere beyond the 32px left edge are ignored by the edge swipe detector, leaving horizontal carousels, cards, and sliders (such as nutrition macro bars and workout lists) completely free of gesture contention.
2. **Sheet Drag vs. ScrollView**:
   The bottom sheet drag gesture is attached directly to the handle area and header zone (`dragZone`), allowing the `ScrollView` below to scroll vertically without fighting pan-down gestures.
3. **Android Hardware Back vs. Open Modals**:
   Bottom sheets and dialogs register localized `BackHandler` subscriptions when presented, ensuring that pressing the Android hardware back button closes the topmost sheet/dialog rather than navigating the background screen stack.

---

## 9. Physical Android Device Testing Notice

Automated unit tests, TypeScript compilation, and Node test harnesses have verified all motion math, state preservation algorithms, and component contracts. Physical Android device gesture verification remains recommended on a physical handset for:
1. System-level predictive back gesture integration on Android 14/15.
2. Device-specific haptic vibration strength (e.g. Pixel haptic motor vs Samsung).
3. Display cutouts / camera punch-hole edge touch responsiveness.

---

## 10. Remaining Recommendations

1. **Scroll-Driven Tab Bar Collapse**:
   If desired in a future iteration, TuneStack's `useTabBarScroll` can be wired into FitOnus's `Screen.tsx` to automatically collapse the floating tab bar when scrolling down long lists (e.g., exercise library or meal diary) and reveal it on upward scroll.
2. **Predictive Back Navigation**:
   With Android 14+ predictive back gestures maturing, consider adopting native stack predictive back animations once Expo Router native stack integration is aligned with FitOnus's custom screen registry.

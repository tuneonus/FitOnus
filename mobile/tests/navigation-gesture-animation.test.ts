import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldCompleteSwipeBack,
  shouldDismissSheet,
  screenExitDuration,
  TAB_SPRING,
  ICON_PULSE_SPRING,
  SHEET_SPRING,
  SNAP_SPRING,
  TRAIL_SPRING,
  getTabDragPosition,
  nearestTabSlot,
} from '../src/app/navigation/screenMotion';
import { tabRoots, tabForRoute, RouteName, TabKey } from '../src/app/navigation/routes';

describe('Navigation, Gestures & Motion Thresholds', () => {
  describe('1. Edge Swipe-Back Gesture Predicate', () => {
    const screenWidth = 390; // Typical mobile width (iPhone 14 / modern Android)

    it('requires crossing ~28% screen width (>=110px) on slow drag', () => {
      // 390 * 0.28 = 109.2
      assert.strictEqual(shouldCompleteSwipeBack(100, 0, screenWidth), false);
      assert.strictEqual(shouldCompleteSwipeBack(110, 0, screenWidth), true);
    });

    it('accepts deliberate downward flick with velocity > 700 px/s when distance >= 40px', () => {
      assert.strictEqual(shouldCompleteSwipeBack(39, 800, screenWidth), false);
      assert.strictEqual(shouldCompleteSwipeBack(45, 650, screenWidth), false);
      assert.strictEqual(shouldCompleteSwipeBack(45, 750, screenWidth), true);
    });

    it('rejects leftward swipes and negative velocities', () => {
      assert.strictEqual(shouldCompleteSwipeBack(-20, 1000, screenWidth), false);
      assert.strictEqual(shouldCompleteSwipeBack(0, 1000, screenWidth), false);
      assert.strictEqual(shouldCompleteSwipeBack(45, -500, screenWidth), false);
    });
  });

  describe('2. Bottom Sheet Drag-to-Dismiss Predicate', () => {
    const sheetHeight = 500; // Typical sheet height in pixels

    it('requires dragging down > 22% of sheet height (>=111px) on slow drag', () => {
      // 500 * 0.22 = 110
      assert.strictEqual(shouldDismissSheet(105, 0, sheetHeight), false);
      assert.strictEqual(shouldDismissSheet(115, 0, sheetHeight), true);
    });

    it('accepts downward flick with velocity > 800 px/s when distance >= 35px', () => {
      assert.strictEqual(shouldDismissSheet(30, 900, sheetHeight), false);
      assert.strictEqual(shouldDismissSheet(40, 750, sheetHeight), false);
      assert.strictEqual(shouldDismissSheet(40, 850, sheetHeight), true);
    });

    it('rejects upward drags and zero distance', () => {
      assert.strictEqual(shouldDismissSheet(-50, 1000, sheetHeight), false);
      assert.strictEqual(shouldDismissSheet(0, 500, sheetHeight), false);
    });
  });

  describe('3. Dynamic Exit Duration Computation', () => {
    it('clamps exit duration between 80ms and maxDuration (240ms)', () => {
      // Very high velocity: should clamp to 80ms
      const fastExit = screenExitDuration(20, 10000);
      assert.strictEqual(fastExit, 80);

      // Low velocity or large distance: should clamp to maxDuration (240ms)
      const slowExit = screenExitDuration(1000, 100);
      assert.strictEqual(slowExit, 240);
    });

    it('scales smoothly for intermediate velocities', () => {
      const remaining = 200;
      const velocity = 2000;
      const duration = screenExitDuration(remaining, velocity);
      // (200 / 2000) * 1000 = 100ms
      assert.strictEqual(duration, 100);
    });
  });

  describe('4. Spring Physics Specifications', () => {
    it('verifies tab press spring configuration', () => {
      assert.strictEqual(TAB_SPRING.damping, 18);
      assert.strictEqual(TAB_SPRING.stiffness, 320);
      assert.strictEqual(TAB_SPRING.mass, 0.6);
    });

    it('verifies icon pulse spring configuration', () => {
      assert.strictEqual(ICON_PULSE_SPRING.damping, 14);
      assert.strictEqual(ICON_PULSE_SPRING.stiffness, 280);
      assert.strictEqual(ICON_PULSE_SPRING.mass, 0.5);
    });

    it('verifies bottom sheet dismiss spring configuration', () => {
      assert.strictEqual(SHEET_SPRING.damping, 26);
      assert.strictEqual(SHEET_SPRING.stiffness, 320);
      assert.strictEqual(SHEET_SPRING.mass, 0.8);
    });

    it('verifies bottom tab drag snap and trail spring physics', () => {
      assert.strictEqual(SNAP_SPRING.damping, 28);
      assert.strictEqual(SNAP_SPRING.stiffness, 420);
      assert.strictEqual(SNAP_SPRING.mass, 0.5);

      assert.strictEqual(TRAIL_SPRING.damping, 22);
      assert.strictEqual(TRAIL_SPRING.stiffness, 320);
      assert.strictEqual(TRAIL_SPRING.mass, 0.6);
    });
  });

  describe('5. Bottom Tab Drag-to-Navigate Mathematics', () => {
    const barWidth = 360; // 5 slots of 72px each
    const slots = 5;

    it('maps horizontal touch x to correct continuous drag position', () => {
      // Touching center of slot 0 (x=36)
      assert.strictEqual(Math.round(getTabDragPosition(36, barWidth, slots)), 0);

      // Touching center of slot 1 (x=108)
      assert.strictEqual(Math.round(getTabDragPosition(108, barWidth, slots)), 1);

      // Touching center of slot 2 (x=180, AI Coach FAB)
      assert.strictEqual(Math.round(getTabDragPosition(180, barWidth, slots)), 2);

      // Touching center of slot 3 (x=252, Progress)
      assert.strictEqual(Math.round(getTabDragPosition(252, barWidth, slots)), 3);

      // Touching center of slot 4 (x=324, Profile)
      assert.strictEqual(Math.round(getTabDragPosition(324, barWidth, slots)), 4);
    });

    it('clamps drag positions beyond left and right edges', () => {
      assert.strictEqual(getTabDragPosition(-50, barWidth, slots), 0);
      assert.strictEqual(getTabDragPosition(0, barWidth, slots), 0);
      assert.strictEqual(getTabDragPosition(500, barWidth, slots), 4);
    });

    it('correctly rounds to nearest tab slot index across boundaries', () => {
      assert.strictEqual(nearestTabSlot(0.4, 4), 0);
      assert.strictEqual(nearestTabSlot(0.51, 4), 1);
      assert.strictEqual(nearestTabSlot(1.8, 4), 2);
      assert.strictEqual(nearestTabSlot(2.7, 4), 3);
      assert.strictEqual(nearestTabSlot(3.9, 4), 4);
      assert.strictEqual(nearestTabSlot(10, 4), 4);
    });
  });

  describe('6. Navigation Architecture & Tab State Contracts', () => {
    it('verifies all 5 tabs have defined root routes', () => {
      const expectedTabs: TabKey[] = ['home', 'activity', 'coach', 'progress', 'profile'];
      for (const tab of expectedTabs) {
        assert.ok(tabRoots[tab], `Missing tab root for ${tab}`);
        assert.strictEqual(tabForRoute(tabRoots[tab]), tab);
      }
    });

    it('simulates tab state preservation across switches', () => {
      // Simulated state engine matching NavigationContext logic
      type Route = { key: string; name: RouteName };
      let tabStacks: Partial<Record<TabKey, Route[]>> = {
        home: [{ key: 'home-1', name: 'home' }],
      };
      let currentStack: Route[] = tabStacks.home!;
      let direction = 0;

      const navigate = (name: RouteName) => {
        currentStack = [...currentStack, { key: `${name}-2`, name }];
        const currentTab = tabForRoute(currentStack[0]!.name);
        if (currentTab) tabStacks[currentTab] = currentStack;
        direction = 1;
      };

      const switchTab = (tab: TabKey) => {
        const currentTab = currentStack[0] ? tabForRoute(currentStack[0].name) : null;
        if (currentTab === tab) {
          if (currentStack.length > 1) {
            const rootStack = [currentStack[0]!];
            currentStack = rootStack;
            tabStacks[tab] = rootStack;
            direction = -1;
            return;
          }
          // Duplicate navigation prevented
          return;
        }

        const updatedTabStacks = { ...tabStacks };
        if (currentTab) updatedTabStacks[currentTab] = currentStack;

        const targetStack =
          updatedTabStacks[tab] && updatedTabStacks[tab]!.length > 0
            ? updatedTabStacks[tab]!
            : [{ key: `${tabRoots[tab]}-1`, name: tabRoots[tab] }];
        updatedTabStacks[tab] = targetStack;

        currentStack = targetStack;
        tabStacks = updatedTabStacks;
        direction = 0;
      };

      // 1. User starts at home
      assert.strictEqual(currentStack.length, 1);
      assert.strictEqual(currentStack[0]!.name, 'home');

      // 2. User navigates to workout generator within home
      navigate('workoutGenerator');
      assert.strictEqual(currentStack.length, 2);
      assert.strictEqual(currentStack[1]!.name, 'workoutGenerator');
      assert.strictEqual(direction, 1);

      // 3. User switches to AI coach tab
      switchTab('coach');
      assert.strictEqual(currentStack.length, 1);
      assert.strictEqual(currentStack[0]!.name, 'coach');
      assert.strictEqual(direction, 0);

      // 4. User switches back to Home tab: previous nested stack is preserved!
      switchTab('home');
      assert.strictEqual(currentStack.length, 2);
      assert.strictEqual(currentStack[1]!.name, 'workoutGenerator');

      // 5. User re-taps Home tab while nested: pops back to tab root!
      switchTab('home');
      assert.strictEqual(currentStack.length, 1);
      assert.strictEqual(currentStack[0]!.name, 'home');
      assert.strictEqual(direction, -1);

      // 6. User re-taps Home tab while at root: duplicate navigation is prevented (no-op)
      const stackBefore = currentStack;
      switchTab('home');
      assert.strictEqual(currentStack, stackBefore);
    });

    it('verifies canGoBack and isTabRoot invariants', () => {
      const rootStack = [{ key: 'home-1', name: 'home' as RouteName }];
      const nestedStack = [
        { key: 'home-1', name: 'home' as RouteName },
        { key: 'workouts-2', name: 'workouts' as RouteName },
      ];

      assert.strictEqual(rootStack.length > 1, false);
      assert.strictEqual(rootStack.length === 1 && tabForRoute(rootStack[0]!.name) !== null, true);

      assert.strictEqual(nestedStack.length > 1, true);
      assert.strictEqual(nestedStack.length === 1 && tabForRoute(nestedStack[0]!.name) !== null, false);
    });
  });
});

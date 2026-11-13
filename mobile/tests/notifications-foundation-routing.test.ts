import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeNative, tapResponse } from './helpers/fake-notifications-native';
import {
  NAVIGATION_BLOCKED_ROUTES,
  ROUTABLE_NOTIFICATION_KINDS,
  createPendingNavigation,
  destinationFromNotificationData,
  parseNotificationPayload,
  performNotificationNavigation,
  resolveNotificationDestination,
  type NotificationDestination,
} from '../src/features/notifications/services/notification-routing';
import {
  DEFAULT_ACTION_IDENTIFIER,
  startNotificationListeners,
} from '../src/features/notifications/services/notification-listeners';
import { tabForRoute, tabRoots, type RouteName } from '../src/app/navigation/routes';

const readSource = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('Notification payload validation', () => {
  it('accepts every known kind', () => {
    for (const kind of ROUTABLE_NOTIFICATION_KINDS) {
      assert.deepEqual(parseNotificationPayload({ kind }), { kind });
    }
  });

  it('accepts the payloads the existing local reminders already send', () => {
    // From notificationService.ts: workout -> { route: 'workoutPlan', kind: 'workout' }, water -> { route: 'home', kind: 'water' }
    assert.deepEqual(parseNotificationPayload({ route: 'workoutPlan', kind: 'workout' }), { kind: 'workout' });
    assert.deepEqual(parseNotificationPayload({ route: 'home', kind: 'water' }), { kind: 'water' });
  });

  it('rejects anything that is not a plain object', () => {
    for (const bad of [null, undefined, 'workout', 42, true, [], [{ kind: 'workout' }], () => ({ kind: 'workout' })]) {
      assert.equal(parseNotificationPayload(bad), null, `${String(bad)} must be rejected`);
    }
  });

  it('rejects unknown, missing or non-string kinds', () => {
    for (const bad of [
      {},
      { kind: 'admin' },
      { kind: 'WORKOUT' },
      { kind: ' workout' },
      { kind: 7 },
      { kind: null },
      { kind: ['workout'] },
      { kind: { toString: () => 'workout' } },
      { kind: '__proto__' },
      { kind: 'constructor' },
    ]) {
      assert.equal(parseNotificationPayload(bad), null, `${JSON.stringify(bad)} must be rejected`);
    }
  });

  it('ignores route names, screens and URLs supplied by the payload', () => {
    const destination = destinationFromNotificationData({
      kind: 'workout',
      route: 'settings',
      screen: 'changePassword',
      url: 'https://evil.example/phish',
      deepLink: 'fitonus://account',
    });
    assert.deepEqual(destination, { type: 'screen', route: 'workoutPlan' });
  });

  it('refuses a payload whose only routing hint is an arbitrary route or URL', () => {
    assert.equal(destinationFromNotificationData({ route: 'changePassword' }), null);
    assert.equal(destinationFromNotificationData({ url: 'https://evil.example' }), null);
    assert.equal(destinationFromNotificationData({ kind: 'https://evil.example' }), null);
  });

  it('accepts only well-formed goal ids', () => {
    assert.deepEqual(parseNotificationPayload({ kind: 'goal', goalId: 'a1B2_c3-d4' }), { kind: 'goal', goalId: 'a1B2_c3-d4' });
    for (const bad of ['', 'has space', '../etc/passwd', 'a'.repeat(65), 'goal/1', '<script>', 123, null, {}]) {
      assert.deepEqual(parseNotificationPayload({ kind: 'goal', goalId: bad }), { kind: 'goal' });
    }
  });

  it('does not carry a goalId for non-goal kinds', () => {
    assert.deepEqual(parseNotificationPayload({ kind: 'workout', goalId: 'abc' }), { kind: 'workout' });
  });
});

describe('Notification route mapping', () => {
  const expected: Record<string, NotificationDestination> = {
    workout: { type: 'screen', route: 'workoutPlan' },
    water: { type: 'tab', tab: 'home' },
    goal: { type: 'screen', route: 'goals' },
    streak: { type: 'screen', route: 'goals' },
    protein: { type: 'screen', route: 'nutrition' },
    achievement: { type: 'screen', route: 'personalRecords' },
    sleep: { type: 'screen', route: 'sleep' },
    report: { type: 'screen', route: 'weeklyReport' },
    walking: { type: 'tab', tab: 'activity' },
  };

  it('maps every supported kind to an existing destination', () => {
    for (const kind of ROUTABLE_NOTIFICATION_KINDS) {
      assert.deepEqual(resolveNotificationDestination({ kind }), expected[kind], `kind ${kind}`);
    }
  });

  it('opens goal detail for a validated goal id', () => {
    assert.deepEqual(resolveNotificationDestination({ kind: 'goal', goalId: 'goal_42' }), {
      type: 'screen',
      route: 'goalDetail',
      params: { id: 'goal_42' },
    });
  });

  it('only ever targets routes that exist in the navigator and are registered as screens', () => {
    const routesSource = readSource('../src/app/navigation/routes.ts');
    const registrySource = readSource('../src/app/routes/screenRegistry.tsx');

    for (const kind of ROUTABLE_NOTIFICATION_KINDS) {
      const destination = resolveNotificationDestination({ kind, ...(kind === 'goal' ? { goalId: 'g1' } : {}) });
      const route: RouteName =
        destination.type === 'tab' ? tabRoots[destination.tab] : destination.route;
      assert.match(routesSource, new RegExp(`\\| '${route}'`), `${route} missing from the RouteName union`);
      assert.match(registrySource, new RegExp(`\\b${route}:`), `${route} has no entry in screenRegistry`);
    }
  });

  it('opens tab destinations with switchTab and screen destinations with navigate', () => {
    const calls: string[] = [];
    const navigator = {
      navigate: (name: RouteName, params?: Record<string, string>) =>
        calls.push(`navigate:${name}${params ? `:${JSON.stringify(params)}` : ''}`),
      switchTab: (tab: string) => calls.push(`switchTab:${tab}`),
    };

    performNotificationNavigation(navigator, { type: 'tab', tab: 'home' });
    performNotificationNavigation(navigator, { type: 'screen', route: 'workoutPlan' });
    performNotificationNavigation(navigator, { type: 'screen', route: 'goalDetail', params: { id: 'g1' } });

    assert.deepEqual(calls, ['switchTab:home', 'navigate:workoutPlan', 'navigate:goalDetail:{"id":"g1"}']);
  });

  it('tab destinations really are tab roots in the navigator', () => {
    assert.equal(tabForRoute('home'), 'home');
    assert.equal(tabForRoute('activity'), 'activity');
    assert.equal(tabForRoute('workoutPlan'), null);
  });

  it('blocks navigation during auth and onboarding routes', () => {
    for (const route of ['splash', 'welcome', 'login', 'signup', 'onboarding'] as RouteName[]) {
      assert.ok(NAVIGATION_BLOCKED_ROUTES.has(route), route);
    }
    assert.ok(!NAVIGATION_BLOCKED_ROUTES.has('home'));
  });
});

describe('Pending notification navigation', () => {
  const makeNavigator = () => {
    const calls: string[] = [];
    return {
      calls,
      navigator: {
        navigate: (name: RouteName) => calls.push(`navigate:${name}`),
        switchTab: (tab: string) => calls.push(`switchTab:${tab}`),
      },
    };
  };

  it('holds a tap until navigation is allowed, then performs it exactly once', () => {
    const pending = createPendingNavigation();
    const { calls, navigator } = makeNavigator();

    pending.set({ type: 'screen', route: 'workoutPlan' });
    assert.equal(pending.flush(false, navigator), false, 'auth/onboarding not ready yet');
    assert.equal(pending.hasPending(), true);

    assert.equal(pending.flush(true, navigator), true);
    assert.equal(pending.flush(true, navigator), false, 'must not replay');
    assert.deepEqual(calls, ['navigate:workoutPlan']);
  });

  it('keeps only the most recent tap', () => {
    const pending = createPendingNavigation();
    const { calls, navigator } = makeNavigator();
    pending.set({ type: 'screen', route: 'workoutPlan' });
    pending.set({ type: 'tab', tab: 'home' });
    pending.flush(true, navigator);
    assert.deepEqual(calls, ['switchTab:home']);
  });

  it('can be cleared (e.g. on logout) so a stale tap never navigates the next user', () => {
    const pending = createPendingNavigation();
    const { calls, navigator } = makeNavigator();
    pending.set({ type: 'screen', route: 'goals' });
    pending.clear();
    assert.equal(pending.flush(true, navigator), false);
    assert.deepEqual(calls, []);
  });
});

describe('Notification listeners', () => {
  const collect = () => {
    const destinations: NotificationDestination[] = [];
    return { destinations, onDestination: (d: NotificationDestination) => destinations.push(d) };
  };

  it('keeps the SDK default-action identifier in sync with expo-notifications', () => {
    const declaration = readSource('../node_modules/expo-notifications/build/NotificationsEmitter.d.ts');
    assert.match(declaration, new RegExp(`DEFAULT_ACTION_IDENTIFIER = "${DEFAULT_ACTION_IDENTIFIER}"`));
  });

  it('routes a notification tap to its destination', () => {
    const native = createFakeNative();
    const { destinations, onDestination } = collect();
    startNotificationListeners(native, { onDestination });

    native.emitResponse(tapResponse({ kind: 'workout' }));
    assert.deepEqual(destinations, [{ type: 'screen', route: 'workoutPlan' }]);
  });

  it('routes taps from locally scheduled reminders and from remote pushes the same way', () => {
    const native = createFakeNative();
    const { destinations, onDestination } = collect();
    startNotificationListeners(native, { onDestination });

    native.emitResponse(tapResponse({ route: 'home', kind: 'water' }, { identifier: 'fitonus-reminder-water-0' }));
    native.emitResponse(tapResponse({ kind: 'goal', goalId: 'g-1' }, { identifier: 'remote-1', date: 1 }));
    assert.deepEqual(destinations, [
      { type: 'tab', tab: 'home' },
      { type: 'screen', route: 'goalDetail', params: { id: 'g-1' } },
    ]);
  });

  it('ignores dismiss/custom actions, unknown payloads and hostile route payloads', () => {
    const native = createFakeNative();
    const { destinations, onDestination } = collect();
    startNotificationListeners(native, { onDestination });

    native.emitResponse(tapResponse({ kind: 'workout' }, { actionIdentifier: 'expo.modules.notifications.actions.DISMISS' }));
    native.emitResponse(tapResponse({ kind: 'workout' }, { actionIdentifier: 'custom-action' }));
    native.emitResponse(tapResponse({ kind: 'nope' }));
    native.emitResponse(tapResponse(undefined));
    native.emitResponse(tapResponse({ route: 'changePassword', url: 'https://evil.example' }));
    assert.deepEqual(destinations, []);
  });

  it('de-duplicates the same delivery seen twice, but not separate deliveries of a repeating reminder', () => {
    const native = createFakeNative();
    const { destinations, onDestination } = collect();
    startNotificationListeners(native, { onDestination });

    native.emitResponse(tapResponse({ kind: 'workout' }, { date: 100 }));
    native.emitResponse(tapResponse({ kind: 'workout' }, { date: 100 })); // duplicate event
    native.emitResponse(tapResponse({ kind: 'workout' }, { date: 86_500 })); // next day's delivery
    native.emitResponse(tapResponse({ kind: 'workout' })); // no timestamp: never deduped
    native.emitResponse(tapResponse({ kind: 'workout' }));
    assert.equal(destinations.length, 4);
  });

  it('forwards foreground arrivals and device-token rotations', () => {
    const native = createFakeNative();
    const received: string[] = [];
    const tokens: string[] = [];
    startNotificationListeners(native, {
      onDestination: () => {},
      onForegroundNotification: (n) => received.push(n.request.identifier),
      onDeviceTokenChanged: (t) => tokens.push(String(t.data)),
    });

    native.emitReceived({ request: { identifier: 'n-1', content: {} } });
    native.emitToken({ type: 'android', data: 'fcm-2' });
    assert.deepEqual(received, ['n-1']);
    assert.deepEqual(tokens, ['fcm-2']);
  });

  it('only subscribes to what the caller asked for', () => {
    const native = createFakeNative();
    startNotificationListeners(native, { onDestination: () => {} });
    assert.equal(native.count('addNotificationResponseReceivedListener'), 1);
    assert.equal(native.count('addNotificationReceivedListener'), 0);
    assert.equal(native.count('addPushTokenListener'), 0);
  });

  it('removes every subscription on stop() and stops delivering', async () => {
    const native = createFakeNative();
    const { destinations, onDestination } = collect();
    const received: string[] = [];
    const handle = startNotificationListeners(native, {
      onDestination,
      onForegroundNotification: (n) => received.push(n.request.identifier),
      onDeviceTokenChanged: () => received.push('token'),
    });
    await handle.ready;

    assert.equal(native.listeners.response.size, 1);
    assert.equal(native.listeners.received.size, 1);
    assert.equal(native.listeners.token.size, 1);

    handle.stop();

    assert.equal(native.removedSubscriptions, 3);
    assert.equal(native.listeners.response.size + native.listeners.received.size + native.listeners.token.size, 0);

    native.emitResponse(tapResponse({ kind: 'workout' }));
    native.emitReceived({ request: { identifier: 'late', content: {} } });
    native.emitToken({ type: 'android', data: 'late' });
    assert.deepEqual(destinations, []);
    assert.deepEqual(received, []);
  });

  it('stop() is idempotent and survives a subscription whose remove() throws', async () => {
    const native = createFakeNative();
    const original = native.addNotificationReceivedListener;
    native.addNotificationReceivedListener = (listener) => {
      const subscription = original(listener);
      return {
        remove: () => {
          subscription.remove();
          throw new Error('already removed');
        },
      };
    };
    const handle = startNotificationListeners(native, {
      onDestination: () => {},
      onForegroundNotification: () => {},
      onDeviceTokenChanged: () => {},
    });
    await handle.ready;

    assert.doesNotThrow(() => handle.stop());
    assert.doesNotThrow(() => handle.stop());
    assert.equal(native.removedSubscriptions, 3, 'one throwing remove() must not leak the other subscriptions');
  });

  it('survives a runtime that throws for push-token events (Expo Go on Android) and keeps the other listeners', async () => {
    const native = createFakeNative();
    native.addPushTokenListener = () => {
      throw new Error('expo-notifications: Android Push notifications were removed from Expo Go');
    };
    const { destinations, onDestination } = collect();
    const received: string[] = [];

    let handle: ReturnType<typeof startNotificationListeners> | undefined;
    assert.doesNotThrow(() => {
      handle = startNotificationListeners(native, {
        onDestination,
        onForegroundNotification: (n) => received.push(n.request.identifier),
        onDeviceTokenChanged: () => {},
      });
    });
    await handle?.ready;

    assert.deepEqual(handle?.unavailable, ['token']);
    native.emitResponse(tapResponse({ kind: 'workout' }));
    native.emitReceived({ request: { identifier: 'still-works', content: {} } });
    assert.equal(destinations.length, 1);
    assert.deepEqual(received, ['still-works']);

    handle?.stop();
    assert.equal(native.removedSubscriptions, 2, 'the two subscriptions that did succeed are removed');
  });

  it('reports an unavailable tap listener instead of crashing the app', async () => {
    const native = createFakeNative();
    native.addNotificationResponseReceivedListener = () => {
      throw new Error('emitter unavailable on this platform');
    };
    const handle = startNotificationListeners(native, { onDestination: () => {} });
    await handle.ready;
    assert.deepEqual(handle.unavailable, ['response']);
    assert.doesNotThrow(() => handle.stop());
  });

  it('reports no unavailable listeners on a normal runtime', async () => {
    const native = createFakeNative();
    const handle = startNotificationListeners(native, {
      onDestination: () => {},
      onForegroundNotification: () => {},
      onDeviceTokenChanged: () => {},
    });
    await handle.ready;
    assert.deepEqual(handle.unavailable, []);
  });

  it('can be started again after stop() without leaking the first set of listeners', async () => {
    const native = createFakeNative();
    const first = startNotificationListeners(native, { onDestination: () => {} });
    await first.ready;
    first.stop();
    const second = startNotificationListeners(native, { onDestination: () => {} });
    await second.ready;
    assert.equal(native.listeners.response.size, 1);
    second.stop();
    assert.equal(native.listeners.response.size, 0);
  });

  it('handles the tap that cold-started the app and consumes it so it cannot replay', async () => {
    const native = createFakeNative();
    native.lastResponse = tapResponse({ kind: 'goal' }, { date: 5 });
    const { destinations, onDestination } = collect();

    const handle = startNotificationListeners(native, { onDestination });
    await handle.ready;

    assert.deepEqual(destinations, [{ type: 'screen', route: 'goals' }]);
    assert.equal(native.lastResponse, null, 'the stored response must be cleared');

    const again = startNotificationListeners(native, { onDestination });
    await again.ready;
    assert.equal(destinations.length, 1, 'a remount must not replay the cold-start tap');
  });

  it('does not deliver the same cold-start tap twice when the live listener also fires', async () => {
    const native = createFakeNative();
    const response = tapResponse({ kind: 'workout' }, { date: 9 });
    native.lastResponse = response;
    const { destinations, onDestination } = collect();

    const handle = startNotificationListeners(native, { onDestination });
    native.emitResponse(response); // native replays the buffered tap through the live listener
    await handle.ready;

    assert.equal(destinations.length, 1);
  });

  it('delivers nothing from an in-flight cold-start lookup after stop()', async () => {
    const native = createFakeNative();
    let release: () => void = () => {};
    native.getLastNotificationResponseAsync = () =>
      new Promise((resolve) => {
        release = () => resolve(tapResponse({ kind: 'workout' }));
      });
    const { destinations, onDestination } = collect();

    const handle = startNotificationListeners(native, { onDestination });
    handle.stop();
    release();
    await handle.ready;

    assert.deepEqual(destinations, []);
  });

  it('tolerates a failing cold-start lookup', async () => {
    const native = createFakeNative();
    native.getLastNotificationResponseAsync = async () => {
      throw new Error('native module unavailable');
    };
    const handle = startNotificationListeners(native, { onDestination: () => {} });
    await assert.doesNotReject(() => handle.ready);
  });
});

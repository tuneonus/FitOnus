// Android push end-to-end policy: launch-time permission offer, channel configuration, FCM token
// registration, foreground presentation and tap routing. Runs in node against fakes (no native modules).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED,
  DENIED,
  GRANTED,
  UNDETERMINED,
  VALID_TOKEN,
  createEnv,
  createFakeHttp,
  createFakeNative,
  createMemoryStore,
  httpError,
  networkError,
  tapResponse,
} from './helpers/fake-notifications-native';
import {
  CHANNEL_DEFINITIONS,
  EXPO_ANDROID_IMPORTANCE,
  PUSH_CHANNELS,
  ensureNotificationChannels,
} from '../src/features/notifications/services/notification-channels';
import {
  createNotificationCoordinator,
  describePushState,
  type PushState,
} from '../src/features/notifications/services/notification-coordinator';
import { createPushRegistrationApi } from '../src/features/notifications/services/notification-api';
import { PUSH_BACKEND_CONFIG } from '../src/features/notifications/services/notification-backend-config';
import { getNotificationPermission } from '../src/features/notifications/services/notification-permissions';
import { normalizeBehavior } from '../src/features/notifications/services/notification-engine-adapter';
import {
  PERMISSION_PROMPT_KEY,
  hasAnsweredPermissionPrompt,
  markPermissionPromptAnswered,
  shouldOfferPermissionPrompt,
  type PermissionPromptInput,
} from '../src/features/notifications/services/notification-permission-prompt';
import { startNotificationListeners } from '../src/features/notifications/services/notification-listeners';
import type { NotificationPermissionState } from '../src/features/notifications/types/push';

const read = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

const NOTIFICATION_ID = '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const state = (overrides: Partial<NotificationPermissionState>): NotificationPermissionState => ({
  status: 'undetermined',
  granted: false,
  canAskAgain: true,
  requiresSystemSettings: false,
  ...overrides,
});

const offerInput = (overrides: Partial<PermissionPromptInput> = {}): PermissionPromptInput => ({
  permission: state({}),
  alreadyAnswered: false,
  signedIn: true,
  blocked: false,
  ...overrides,
});

describe('Launch-time permission offer', () => {
  it('offers exactly once: signed in, on a usable screen, permission never asked', () => {
    assert.equal(shouldOfferPermissionPrompt(offerInput()), true);
  });

  it('never offers when permission is already granted (Android < 13 reports granted)', () => {
    assert.equal(
      shouldOfferPermissionPrompt(offerInput({ permission: state({ status: 'granted', granted: true }) })),
      false,
    );
  });

  it('never re-offers after a denial, whether or not Android would still show its dialog', () => {
    assert.equal(shouldOfferPermissionPrompt(offerInput({ permission: state({ status: 'denied' }) })), false);
    assert.equal(
      shouldOfferPermissionPrompt(
        offerInput({ permission: state({ status: 'denied', canAskAgain: false, requiresSystemSettings: true }) }),
      ),
      false,
    );
  });

  it('does not offer before the permission is known, when signed out, on a blocked screen or once answered', () => {
    assert.equal(shouldOfferPermissionPrompt(offerInput({ permission: null })), false);
    assert.equal(shouldOfferPermissionPrompt(offerInput({ signedIn: false })), false);
    assert.equal(shouldOfferPermissionPrompt(offerInput({ blocked: true })), false);
    assert.equal(shouldOfferPermissionPrompt(offerInput({ alreadyAnswered: true })), false);
    assert.equal(
      shouldOfferPermissionPrompt(offerInput({ permission: state({ status: 'unsupported', canAskAgain: false }) })),
      false,
    );
  });

  it('remembers the answer on the device, and fails closed if storage is broken', async () => {
    const store = createMemoryStore();
    assert.equal(await hasAnsweredPermissionPrompt(store), false);
    await markPermissionPromptAnswered(store, 'dismissed', () => 42);
    assert.equal(await hasAnsweredPermissionPrompt(store), true);
    assert.deepEqual(JSON.parse(store.data.get(PERMISSION_PROMPT_KEY)!), { outcome: 'dismissed', at: 42 });

    const broken = {
      get: async () => {
        throw new Error('secure store unavailable');
      },
      set: async () => {
        throw new Error('secure store unavailable');
      },
      remove: async () => undefined,
    };
    assert.equal(await hasAnsweredPermissionPrompt(broken), true, 'a storage error must never cause a prompt loop');
    await assert.doesNotReject(markPermissionPromptAnswered(broken, 'accepted'));
  });

  it('is mounted by the app shell, and the system dialog is only opened from the button press', () => {
    assert.match(read('src/app/AppShell.tsx'), /<NotificationPermissionPrompt \/>/);
    const component = read('src/features/notifications/components/NotificationPermissionPrompt.tsx');
    // The only call that can reach the OS dialog is inside the confirm handler.
    assert.equal(component.match(/enablePushFromUserAction/g)?.length, 1);
    assert.match(component, /const onConfirm = useCallback\(\(\) => \{[\s\S]*enablePushFromUserAction/);
  });
});

describe('Android notification channels', () => {
  it('creates the server-push channel with HIGH importance and vibration', async () => {
    const native = createFakeNative();
    const result = await ensureNotificationChannels(native, createEnv());
    assert.equal(result.ok, true);

    const remote = native.channels.get(PUSH_CHANNELS.REMOTE);
    assert.ok(remote, 'remote-updates must exist before the first push arrives');
    assert.equal(remote.importance, EXPO_ANDROID_IMPORTANCE.HIGH);
    assert.equal(remote.sound, undefined, 'system default sound = no `sound` key');
    assert.ok(remote.vibrationPattern && remote.vibrationPattern.length > 1);
  });

  it("never passes sound: 'default' (SDK 58 reads `sound` as a raw-resource file name, so it logs 'Custom sound not found')", () => {
    for (const [id, channel] of Object.entries(CHANNEL_DEFINITIONS)) {
      assert.notEqual(channel.sound, 'default', `${id}: omit \`sound\` for the system default sound`);
      // No custom sound files are shipped, so the only valid values are "absent" (system default) and null (silent).
      assert.ok(channel.sound === undefined || channel.sound === null, `${id}: unexpected sound ${String(channel.sound)}`);
    }
    // Loud channels keep the system default sound by leaving the key out entirely.
    assert.equal('sound' in CHANNEL_DEFINITIONS[PUSH_CHANNELS.REMOTE]!, false);
    assert.equal(CHANNEL_DEFINITIONS['system-reminders']?.sound, null);

    const appJson = JSON.parse(read('app.json'));
    const plugin = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications');
    assert.deepEqual(plugin[1].sounds, [], 'no custom sound files are bundled');

    for (const file of ['src/services/notificationService.ts', 'src/features/notifications/services/notification-channels.ts']) {
      assert.doesNotMatch(read(file), /sound:\s*'default'/, `${file} must not request a sound named 'default'`);
    }
  });

  it('keeps HIGH importance and vibration on the server-push channel after the sound fix', () => {
    const remote = CHANNEL_DEFINITIONS[PUSH_CHANNELS.REMOTE]!;
    assert.equal(remote.importance, EXPO_ANDROID_IMPORTANCE.HIGH);
    assert.deepEqual(remote.vibrationPattern, [0, 250, 250, 250]);
  });

  it('uses one channel id across the backend payload, the manifest default and the app', () => {
    assert.equal(PUSH_CHANNELS.REMOTE, 'remote-updates');
    const dispatcher = read('../backend/src/modules/notifications/application/services/notification-dispatcher.ts');
    assert.match(dispatcher, /channelId: 'remote-updates'/);
    const appJson = JSON.parse(read('app.json'));
    const plugin = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications');
    assert.equal(plugin[1].defaultChannel, PUSH_CHANNELS.REMOTE);
    assert.equal(appJson.expo.android.package, 'com.tuneonus.onusfit');
    assert.ok(appJson.expo.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));
  });

  it('creates channels at launch without needing permission, and does not touch iOS', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    await ensureNotificationChannels(native, createEnv());
    assert.equal(native.channels.has(PUSH_CHANNELS.REMOTE), true);
    assert.equal(native.count('requestPermissionsAsync'), 0);

    const ios = createFakeNative();
    await ensureNotificationChannels(ios, createEnv({ platform: 'ios' }));
    assert.equal(ios.channels.size, 0);
  });

  it('app launch wires channel creation and the foreground re-sync into the bridge', () => {
    const bridge = read('src/features/notifications/components/NotificationBridge.tsx');
    assert.match(bridge, /ensureNotificationChannels\(native, env\)/);
    assert.match(bridge, /coordinator\.syncOnAuthReady\(userId\)/);
  });
});

describe('Permission flow and FCM token registration', () => {
  const build = (permission = UNDETERMINED, promptAnswer = GRANTED) => {
    const native = createFakeNative({ permission });
    native.promptAnswer = promptAnswer;
    const http = createFakeHttp();
    const store = createMemoryStore();
    const coordinator = createNotificationCoordinator({
      native,
      env: createEnv(),
      api: createPushRegistrationApi({ http, config: PUSH_BACKEND_CONFIG }),
      store,
      cancelLocalReminders: async () => undefined,
      newInstallationId: () => 'install-android-1',
    });
    return { native, http, store, coordinator };
  };

  it('allow: shows the OS dialog once, then registers the native FCM token for the signed-in user', async () => {
    const t = build();
    const result = await t.coordinator.enablePushFromUserAction('user-1');

    assert.equal(t.native.count('requestPermissionsAsync'), 1);
    assert.equal(result.state.status, 'registered');
    assert.equal(t.native.count('getDevicePushTokenAsync'), 1, 'a native FCM token, never an Expo push token');
    assert.equal(t.http.calls.length, 1);
    const [call] = t.http.calls;
    assert.equal(call?.method, 'PUT');
    assert.equal(call?.url, '/notifications/devices/install-android-1');
    assert.deepEqual(call?.body, {
      installationId: 'install-android-1',
      pushToken: VALID_TOKEN,
      platform: 'android',
      appVersion: '1.0.0',
      timeZone: 'Asia/Kolkata',
    });
  });

  it('allow: channels exist before the OS dialog (required by Android 13+)', async () => {
    const t = build();
    const order: string[] = [];
    const original = t.native.setNotificationChannelAsync;
    t.native.setNotificationChannelAsync = async (id, channel) => {
      order.push('channel');
      return original(id, channel);
    };
    const originalRequest = t.native.requestPermissionsAsync;
    t.native.requestPermissionsAsync = async () => {
      order.push('prompt');
      return originalRequest();
    };
    await t.coordinator.enablePushFromUserAction('user-1');
    assert.equal(order[0], 'channel');
    assert.ok(order.indexOf('prompt') > order.lastIndexOf('channel'));
  });

  it('deny: registers nothing, reports permission-required and never blocks the app', async () => {
    const t = build(UNDETERMINED, DENIED);
    const result = await t.coordinator.enablePushFromUserAction('user-1');
    assert.equal(result.state.status, 'permission-required');
    assert.equal(t.native.count('getDevicePushTokenAsync'), 0);
    assert.equal(t.http.calls.length, 0);
  });

  it('permanently denied: no further OS dialog, the UI is pointed at system settings', async () => {
    const t = build(BLOCKED);
    const result = await t.coordinator.enablePushFromUserAction('user-1');
    assert.equal(t.native.count('requestPermissionsAsync'), 0);
    assert.equal(result.permission.requiresSystemSettings, true);
    const synced = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(synced.status, 'permission-required');
    assert.equal(t.native.count('requestPermissionsAsync'), 0, 'auto-sync must never prompt');
  });

  it('Android < 13: permission is already granted, so sign-in registers the token without any prompt', async () => {
    const t = build(GRANTED);
    const synced = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(synced.status, 'registered');
    assert.equal(t.native.count('requestPermissionsAsync'), 0);
    assert.equal(t.http.calls.length, 1);
  });

  it('permission granted later in system settings: the foreground re-sync registers the device', async () => {
    const t = build(BLOCKED);
    assert.equal((await t.coordinator.syncOnAuthReady('user-1')).status, 'permission-required');
    t.native.permission = GRANTED; // user flipped it in Android settings and returned to the app
    assert.equal((await t.coordinator.syncOnAuthReady('user-1')).status, 'registered');
    assert.equal(t.http.calls.length, 1);
  });

  it('does not re-register an unchanged token on every launch', async () => {
    const t = build(GRANTED);
    await t.coordinator.syncOnAuthReady('user-1');
    await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(t.http.calls.length, 1);
    assert.equal(t.native.count('getDevicePushTokenAsync'), 1);
  });

  it('re-registers for a different user on the same install (user switching)', async () => {
    const t = build(GRANTED);
    await t.coordinator.syncOnAuthReady('user-1');
    await t.coordinator.syncOnAuthReady('user-2');
    assert.equal(t.http.calls.length, 2);
    assert.equal(t.http.calls[1]?.url, '/notifications/devices/install-android-1');
  });

  it('logout removes the device from the backend and invalidates the FCM token', async () => {
    const t = build(GRANTED);
    await t.coordinator.syncOnAuthReady('user-1');
    const result = await t.coordinator.logoutCleanup();
    assert.equal(result.backend, 'unregistered');
    assert.equal(result.deviceTokenInvalidated, true);
    assert.equal(t.http.calls.at(-1)?.method, 'DELETE');
  });

  it('a failing token request is reported, not thrown', async () => {
    const t = build(GRANTED);
    t.native.tokenImpl = async () => {
      throw new Error('SERVICE_NOT_AVAILABLE');
    };
    const result = await t.coordinator.syncOnAuthReady('user-1');
    assert.notEqual(result.status, 'registered');
    assert.equal(t.http.calls.length, 0);
  });

  it('reads the permission without prompting', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    const permission = await getNotificationPermission(native, createEnv());
    assert.equal(permission.status, 'undetermined');
    assert.equal(native.count('requestPermissionsAsync'), 0);
  });
});

describe('Foreground presentation and tap handling', () => {
  it('shows a foreground push as a banner and in the tray, with sound', () => {
    // What the launch-time handler in notificationService returns, after the adapter normalizes it.
    assert.deepEqual(normalizeBehavior({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }), {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('opens the allow-listed screen when a server push (as the backend sends it) is tapped', () => {
    const native = createFakeNative();
    const destinations: unknown[] = [];
    const opened: unknown[] = [];
    const handle = startNotificationListeners(native, {
      onDestination: (d) => destinations.push(d),
      onRemoteOpened: (p) => opened.push(p),
    });
    native.emitResponse(
      tapResponse({ notificationId: NOTIFICATION_ID, category: 'announcements', destination: 'notifications' }),
    );
    handle.stop();

    assert.deepEqual(destinations, [{ type: 'screen', route: 'notifications' }]);
    assert.equal(opened.length, 1);
  });

  it('opens a tab for a tab destination and ignores an unknown one', () => {
    const native = createFakeNative();
    const destinations: unknown[] = [];
    const handle = startNotificationListeners(native, { onDestination: (d) => destinations.push(d) });
    native.emitResponse(tapResponse({ notificationId: NOTIFICATION_ID, destination: 'progress' }, { date: 1 }));
    native.emitResponse(tapResponse({ notificationId: NOTIFICATION_ID, destination: 'login' }, { date: 2 }));
    handle.stop();
    assert.deepEqual(destinations, [{ type: 'tab', tab: 'progress' }]);
  });

  it('delivers a tap that cold-started the app', async () => {
    const native = createFakeNative();
    native.lastResponse = tapResponse({ notificationId: NOTIFICATION_ID, destination: 'goals' });
    const destinations: unknown[] = [];
    const handle = startNotificationListeners(native, { onDestination: (d) => destinations.push(d) });
    await handle.ready;
    handle.stop();
    assert.equal(destinations.length, 1);
  });
});

describe('Registration resilience', () => {
  const NO_WAIT = async () => undefined;

  const build = (script: { status?: number; error?: unknown }[], permission = GRANTED) => {
    const native = createFakeNative({ permission });
    const http = createFakeHttp(script);
    const coordinator = createNotificationCoordinator({
      native,
      env: createEnv(),
      api: createPushRegistrationApi({ http, config: PUSH_BACKEND_CONFIG }),
      store: createMemoryStore(),
      cancelLocalReminders: async () => undefined,
      newInstallationId: () => 'install-android-1',
      sleep: NO_WAIT,
    });
    return { native, http, coordinator };
  };

  it('a backend that does not have the endpoint yet (DEV 404) fails without retry storms, then registers on the next foreground once it does', async () => {
    const t = build([{ error: httpError(404) }, { status: 200 }]);

    const first = await t.coordinator.syncOnAuthReady('user-1');
    assert.deepEqual(first.status === 'failed' ? { reason: first.reason, retryable: first.retryable } : null, {
      reason: 'endpoint-missing',
      retryable: false,
    });
    assert.equal(t.http.calls.length, 1, 'a missing endpoint is not hammered with retries');

    // Foreground handler: not retryable, so it calls syncOnAuthReady, which registers again.
    const second = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(second.status, 'registered');
    assert.equal(t.http.calls.length, 2);
  });

  it('retries a network failure with backoff and then registers', async () => {
    const t = build([{ error: networkError() }, { error: httpError(503) }, { status: 200 }]);
    const result = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(result.status, 'registered');
    assert.equal(t.http.calls.length, 3);
  });

  it('after the retry budget is spent it parks as pending-retry, and the next foreground retries', async () => {
    const t = build([{ error: httpError(503) }, { error: httpError(503) }, { error: httpError(503) }, { status: 200 }]);
    const parked = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(parked.status, 'pending-retry');
    const retried = await t.coordinator.retryPending('user-1');
    assert.equal(retried.status, 'registered');
  });

  it('RACE: a foreground sync that read the permission before it was granted cannot swallow the grant', async () => {
    const t = build([{ status: 200 }], UNDETERMINED);
    t.native.promptAnswer = GRANTED;

    // The first permission read (the foreground sync's) is stale and slow: it reports "undetermined" late.
    let releaseStale!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    const read = t.native.getPermissionsAsync;
    let firstRead = true;
    t.native.getPermissionsAsync = async () => {
      if (!firstRead) return read();
      firstRead = false;
      const stale = await read();
      await gate;
      return stale;
    };

    const foreground = t.coordinator.syncOnAuthReady('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const enabled = t.coordinator.enablePushFromUserAction('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseStale();

    assert.equal((await foreground).status, 'permission-required');
    const result = await enabled;
    assert.equal(result.state.status, 'registered', 'granting permission must end in a registered device');
    assert.equal(t.http.calls.length, 1);
  });

  it('never puts the device token in a loggable state description', () => {
    const states: PushState[] = [
      { status: 'idle' },
      { status: 'registered', token: VALID_TOKEN },
      { status: 'token-acquired', token: VALID_TOKEN, backend: 'inactive' },
      { status: 'pending-retry', token: VALID_TOKEN, attempts: 2, kind: 'network' },
      { status: 'failed', reason: 'endpoint-missing', retryable: false },
      { status: 'permission-required', canAskAgain: true, requiresSystemSettings: false },
      { status: 'unsupported', reason: 'expo-go-android' },
    ];
    for (const state of states) {
      const text = JSON.stringify(describePushState(state));
      assert.ok(!text.includes(VALID_TOKEN), `${state.status} leaked the token`);
      assert.ok(!text.includes('APA91b'), `${state.status} leaked part of the token`);
    }
    assert.deepEqual(describePushState({ status: 'failed', reason: 'endpoint-missing', retryable: false }), {
      status: 'failed',
      reason: 'endpoint-missing',
      retryable: false,
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED,
  DENIED,
  GRANTED,
  UNDETERMINED,
  ROTATED_TOKEN,
  VALID_TOKEN,
  createEnv,
  createFakeNative,
} from './helpers/fake-notifications-native';
import {
  getNotificationPermission,
  isExpoGoAndroid,
  requestNotificationPermissionFromUserAction,
  supportsRemotePushApis,
} from '../src/features/notifications/services/notification-permissions';
import {
  CHANNEL_DEFINITIONS,
  EXPO_ANDROID_IMPORTANCE,
  PUSH_CHANNELS,
  ensureNotificationChannels,
  resolveChannelConfig,
} from '../src/features/notifications/services/notification-channels';
import {
  acquireDevicePushToken,
  classifyTokenError,
  isValidDevicePushToken,
} from '../src/features/notifications/services/notification-token';
import {
  createLegacyEngineAdapter,
  createPermissionGate,
  normalizeBehavior,
} from '../src/features/notifications/services/notification-engine-adapter';
import { NOTIFICATION_CHANNELS } from '../src/services/notificationService';

const sdkFile = (name: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../node_modules/expo-notifications/build/${name}`, import.meta.url)), 'utf8');

describe('Notification permissions', () => {
  it('reports granted permission without showing a prompt', async () => {
    const native = createFakeNative({ permission: GRANTED });
    const state = await getNotificationPermission(native, createEnv());
    assert.deepEqual(state, {
      status: 'granted',
      granted: true,
      canAskAgain: true,
      requiresSystemSettings: false,
    });
    assert.equal(native.count('requestPermissionsAsync'), 0);
  });

  it('reports denied permission (can still ask once more)', async () => {
    const state = await getNotificationPermission(createFakeNative({ permission: DENIED }), createEnv());
    assert.equal(state.status, 'denied');
    assert.equal(state.granted, false);
    assert.equal(state.canAskAgain, true);
    assert.equal(state.requiresSystemSettings, false);
  });

  it('reports permanently denied permission as requiring system settings', async () => {
    const state = await getNotificationPermission(createFakeNative({ permission: BLOCKED }), createEnv());
    assert.equal(state.status, 'denied');
    assert.equal(state.requiresSystemSettings, true);
  });

  it('reports undetermined permission before the user was ever asked', async () => {
    const state = await getNotificationPermission(createFakeNative({ permission: UNDETERMINED }), createEnv());
    assert.equal(state.status, 'undetermined');
    assert.equal(state.requiresSystemSettings, false);
  });

  it('treats non-mobile platforms as unsupported without touching the native module', async () => {
    const native = createFakeNative();
    const state = await getNotificationPermission(native, createEnv({ platform: 'web' }));
    assert.equal(state.status, 'unsupported');
    assert.deepEqual(native.calls, []);
  });

  it('degrades to unsupported when the native permission API throws', async () => {
    const native = createFakeNative();
    native.getPermissionsAsync = async () => {
      throw new Error('module unavailable');
    };
    assert.equal((await getNotificationPermission(native, createEnv())).status, 'unsupported');
  });

  it('knows where remote-push APIs may be called (they throw in Expo Go on Android)', () => {
    assert.equal(isExpoGoAndroid(createEnv({ isExpoGo: true })), true);
    assert.equal(isExpoGoAndroid(createEnv({ isExpoGo: true, platform: 'ios' })), false);
    assert.equal(isExpoGoAndroid(createEnv()), false);

    assert.equal(supportsRemotePushApis(createEnv()), true, 'development / release build on Android');
    assert.equal(supportsRemotePushApis(createEnv({ platform: 'ios', isExpoGo: true })), true);
    assert.equal(supportsRemotePushApis(createEnv({ isExpoGo: true })), false, 'Expo Go on Android');
    assert.equal(supportsRemotePushApis(createEnv({ platform: 'web' })), false);
  });

  it('refuses to prompt unless the call is explicitly marked as a user action', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    await assert.rejects(
      () => requestNotificationPermissionFromUserAction(native, createEnv(), {} as never),
      /explicit user action/,
    );
    await assert.rejects(
      () => requestNotificationPermissionFromUserAction(native, createEnv(), { trigger: 'app-launch' } as never),
      /explicit user action/,
    );
    assert.equal(native.count('requestPermissionsAsync'), 0);
  });

  it('creates the Android channels BEFORE showing the prompt (SDK 58: the Android 13+ prompt needs a channel)', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    native.promptAnswer = GRANTED;

    const state = await requestNotificationPermissionFromUserAction(native, createEnv(), {
      trigger: 'user-action',
    });

    assert.equal(state.status, 'granted');
    const firstChannel = native.calls.indexOf('setNotificationChannelAsync');
    const prompt = native.calls.indexOf('requestPermissionsAsync');
    assert.ok(firstChannel >= 0 && prompt >= 0, 'both channel creation and the prompt must happen');
    assert.ok(firstChannel < prompt, 'channels must exist before the prompt is shown');
    assert.equal(native.count('requestPermissionsAsync'), 1);
  });

  it('returns the denied state when the user declines the prompt', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    native.promptAnswer = BLOCKED;
    const state = await requestNotificationPermissionFromUserAction(native, createEnv(), {
      trigger: 'user-action',
    });
    assert.equal(state.granted, false);
    assert.equal(state.status, 'denied');
    assert.equal(state.requiresSystemSettings, true);
  });

  it('does not re-prompt when permission is already granted', async () => {
    const native = createFakeNative({ permission: GRANTED });
    const state = await requestNotificationPermissionFromUserAction(native, createEnv(), {
      trigger: 'user-action',
    });
    assert.equal(state.granted, true);
    assert.equal(native.count('requestPermissionsAsync'), 0);
  });

  it('does not attempt a prompt that the OS will never show (permanently denied)', async () => {
    const native = createFakeNative({ permission: BLOCKED });
    const state = await requestNotificationPermissionFromUserAction(native, createEnv(), {
      trigger: 'user-action',
    });
    assert.equal(state.requiresSystemSettings, true);
    assert.equal(native.count('requestPermissionsAsync'), 0);
  });

  it('falls back to the current state when the prompt call throws', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    native.requestPermissionsAsync = async () => {
      throw new Error('boom');
    };
    const state = await requestNotificationPermissionFromUserAction(native, createEnv(), {
      trigger: 'user-action',
    });
    assert.equal(state.status, 'undetermined');
  });
});

describe('Android notification channels', () => {
  it('creates every owned channel on Android', async () => {
    const native = createFakeNative();
    const result = await ensureNotificationChannels(native, createEnv());

    assert.equal(result.ok, true);
    assert.deepEqual(
      [...native.channels.keys()].sort(),
      [
        NOTIFICATION_CHANNELS.WORKOUT,
        NOTIFICATION_CHANNELS.WATER,
        NOTIFICATION_CHANNELS.SYSTEM,
        PUSH_CHANNELS.GOAL,
        PUSH_CHANNELS.REMOTE,
      ].sort(),
    );
  });

  it("uses Expo's importance numbering and never blocks a channel", async () => {
    const native = createFakeNative();
    await ensureNotificationChannels(native, createEnv());

    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.WORKOUT)?.importance, EXPO_ANDROID_IMPORTANCE.HIGH);
    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.WATER)?.importance, EXPO_ANDROID_IMPORTANCE.DEFAULT);
    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.SYSTEM)?.importance, EXPO_ANDROID_IMPORTANCE.LOW);
    for (const [id, channel] of native.channels) {
      assert.ok(channel.importance > EXPO_ANDROID_IMPORTANCE.NONE, `${id} must not be IMPORTANCE_NONE (blocked)`);
    }
  });

  it('keeps importance constants in sync with the installed expo-notifications SDK', () => {
    const declaration = sdkFile('NotificationChannelManager.types.d.ts');
    const body = declaration.match(/export declare enum AndroidImportance \{([\s\S]*?)\}/)?.[1];
    assert.ok(body, 'AndroidImportance enum not found in the SDK typings');

    const sdk: Record<string, number> = {};
    for (const [, name, value] of body.matchAll(/(\w+)\s*=\s*(\d+)/g)) {
      sdk[name as string] = Number(value);
    }
    for (const key of Object.keys(EXPO_ANDROID_IMPORTANCE) as (keyof typeof EXPO_ANDROID_IMPORTANCE)[]) {
      assert.equal(EXPO_ANDROID_IMPORTANCE[key], sdk[key], `AndroidImportance.${key} drifted from the SDK`);
    }
  });

  it('does nothing off Android', async () => {
    const native = createFakeNative();
    const result = await ensureNotificationChannels(native, createEnv({ platform: 'ios' }));
    assert.deepEqual(result, { ok: true, created: [], failed: [] });
    assert.equal(native.count('setNotificationChannelAsync'), 0);
  });

  it('is idempotent per native instance', async () => {
    const native = createFakeNative();
    const env = createEnv();
    await ensureNotificationChannels(native, env);
    const afterFirst = native.count('setNotificationChannelAsync');
    await ensureNotificationChannels(native, env);
    assert.equal(native.count('setNotificationChannelAsync'), afterFirst);
  });

  it('retries after a partial failure instead of memoizing it forever', async () => {
    const native = createFakeNative();
    native.failChannels.add(PUSH_CHANNELS.GOAL);
    const env = createEnv();

    const first = await ensureNotificationChannels(native, env);
    assert.equal(first.ok, false);
    assert.deepEqual(first.failed, [PUSH_CHANNELS.GOAL]);

    native.failChannels.clear();
    // Let the memo-eviction microtask run, as it would between user interactions.
    await new Promise((resolve) => setImmediate(resolve));
    const second = await ensureNotificationChannels(native, env);
    assert.equal(second.ok, true);
    assert.ok(native.channels.has(PUSH_CHANNELS.GOAL));
  });

  it('applies canonical definitions to known channels and passes unknown ones through', () => {
    const legacy = { name: 'Workout Reminders', importance: 4 };
    assert.equal(resolveChannelConfig(NOTIFICATION_CHANNELS.WORKOUT, legacy), CHANNEL_DEFINITIONS[NOTIFICATION_CHANNELS.WORKOUT]);
    const custom = { name: 'Custom', importance: 3 };
    assert.equal(resolveChannelConfig('some-other-channel', custom), custom);
  });
});

describe('Device (FCM) push token acquisition', () => {
  it('acquires and validates a token for a granted, development-build device', async () => {
    const native = createFakeNative({ permission: GRANTED });
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.deepEqual(result, { ok: true, token: VALID_TOKEN });
    assert.equal(native.count('getDevicePushTokenAsync'), 1);
  });

  it('never needs an EAS project id: the backend talks to FCM directly, not the Expo push service', async () => {
    const native = createFakeNative();
    const result = await acquireDevicePushToken({ native, env: createEnv({ projectId: null }) });
    assert.equal(result.ok, true);
  });

  it('never prompts: without permission it fails with permission-not-granted', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'permission-not-granted');
    assert.equal(native.count('requestPermissionsAsync'), 0);
    assert.equal(native.count('getDevicePushTokenAsync'), 0);
  });

  it('reports unsupported platforms', async () => {
    const result = await acquireDevicePushToken({ native: createFakeNative(), env: createEnv({ platform: 'web' }) });
    assert.equal(!result.ok && result.reason, 'unsupported-platform');
  });

  it('creates the Android channels before requesting the token (SDK 58 reference requirement)', async () => {
    const native = createFakeNative();
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(result.ok, true);
    const lastChannel = native.calls.lastIndexOf('setNotificationChannelAsync');
    const tokenCall = native.calls.indexOf('getDevicePushTokenAsync');
    assert.ok(lastChannel >= 0, 'channels must be created');
    assert.ok(lastChannel < tokenCall, 'every channel must exist before the token is requested');
  });

  it('does not create channels on iOS', async () => {
    const native = createFakeNative();
    await acquireDevicePushToken({ native, env: createEnv({ platform: 'ios' }) });
    assert.equal(native.count('setNotificationChannelAsync'), 0);
  });

  it('does not hard-block emulators (Expo documents push on Android emulators with Google Play services)', async () => {
    const native = createFakeNative();
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(result.ok, true);
    assert.equal(native.count('getDevicePushTokenAsync'), 1);
  });

  it('classifies missing Google Play services as a permanent, non-retryable failure', async () => {
    const native = createFakeNative();
    native.tokenImpl = async () => {
      throw new Error('Google Play services is not available on this device');
    };
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(!result.ok && result.reason, 'play-services-unavailable');
    assert.equal(!result.ok && result.retryable, false);
  });

  it('maps expo-notifications "no project id" rejection to missing-project-id (classifier kept for other callers)', () => {
    const failure = classifyTokenError(
      Object.assign(new Error('No "projectId" found.'), { code: 'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID' }),
    );
    assert.equal(failure.reason, 'missing-project-id');
    assert.equal(failure.retryable, false);
  });

  it('reports Expo Go on Android as unsupported (remote push was removed in SDK 53)', async () => {
    const native = createFakeNative();
    const result = await acquireDevicePushToken({ native, env: createEnv({ isExpoGo: true }) });
    assert.equal(!result.ok && result.reason, 'expo-go-android');
    assert.equal(native.count('getDevicePushTokenAsync'), 0);
  });

  it('does not block Expo Go on iOS', async () => {
    const result = await acquireDevicePushToken({
      native: createFakeNative(),
      env: createEnv({ platform: 'ios', isExpoGo: true }),
    });
    assert.equal(result.ok, true);
  });

  it('classifies a missing Firebase/FCM setup as a non-retryable configuration problem', async () => {
    const native = createFakeNative();
    native.tokenImpl = async () => {
      throw new Error('Default FirebaseApp is not initialized in this process com.tuneonus.onusfit.');
    };
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'fcm-not-configured');
    assert.equal(!result.ok && result.retryable, false);
  });

  it('classifies network failures as retryable', async () => {
    const native = createFakeNative();
    native.tokenImpl = async () => {
      throw new Error('Network request failed: timeout');
    };
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(!result.ok && result.reason, 'network-error');
    assert.equal(!result.ok && result.retryable, true);
  });

  it('classifies unknown failures as retryable token-unavailable', () => {
    const failure = classifyTokenError(new Error('something odd'));
    assert.equal(failure.reason, 'token-unavailable');
    assert.equal(failure.retryable, true);
  });

  it('rejects a malformed token returned by the device', async () => {
    const native = createFakeNative();
    native.tokenImpl = async () => ({ type: 'android', data: 'short token with spaces' });
    const result = await acquireDevicePushToken({ native, env: createEnv() });
    assert.equal(!result.ok && result.reason, 'invalid-token');
  });

  it('uses a rotated device token as-is instead of asking again (avoids a refetch loop)', async () => {
    const native = createFakeNative();
    const result = await acquireDevicePushToken({
      native,
      env: createEnv(),
      devicePushToken: { type: 'android', data: ROTATED_TOKEN },
    });
    assert.deepEqual(result, { ok: true, token: ROTATED_TOKEN });
    assert.equal(native.count('getDevicePushTokenAsync'), 0);
  });

  it('rejects a malformed rotated token', async () => {
    const result = await acquireDevicePushToken({
      native: createFakeNative(),
      env: createEnv(),
      devicePushToken: { type: 'android', data: { nested: true } },
    });
    assert.equal(!result.ok && result.reason, 'invalid-token');
  });

  it('validates the FCM token format (what the backend accepts)', () => {
    assert.equal(isValidDevicePushToken(VALID_TOKEN), true);
    assert.equal(isValidDevicePushToken('a'.repeat(163)), true);
    for (const bad of [
      '',
      'too-short',
      'has space in it 0123456789012345',
      'bad/char/0123456789012345678',
      '<script>alert(1)</script>0123',
      'a'.repeat(4097),
      'ExponentPushToken[abc-123_XYZ]',
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(isValidDevicePushToken(bad), false, `${String(bad)} must be rejected`);
    }
  });
});

describe('Legacy engine adapter (seam for the existing notificationService)', () => {
  it('applies canonical channel importance even though the service passes raw 4/3/2', async () => {
    const native = createFakeNative();
    const engine = createLegacyEngineAdapter({ native, gate: createPermissionGate(native, createEnv()) });

    // These are the exact values the existing service sends.
    await engine.setNotificationChannelAsync(NOTIFICATION_CHANNELS.WORKOUT, { name: 'Workout Reminders', importance: 4 });
    await engine.setNotificationChannelAsync(NOTIFICATION_CHANNELS.WATER, { name: 'Water', importance: 3 });
    await engine.setNotificationChannelAsync(NOTIFICATION_CHANNELS.SYSTEM, { name: 'System', importance: 2 });

    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.WORKOUT)?.importance, EXPO_ANDROID_IMPORTANCE.HIGH);
    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.WATER)?.importance, EXPO_ANDROID_IMPORTANCE.DEFAULT);
    assert.equal(native.channels.get(NOTIFICATION_CHANNELS.SYSTEM)?.importance, EXPO_ANDROID_IMPORTANCE.LOW);
  });

  it('passes unknown channels through unchanged', async () => {
    const native = createFakeNative();
    const engine = createLegacyEngineAdapter({ native, gate: createPermissionGate(native, createEnv()) });
    await engine.setNotificationChannelAsync('custom', { name: 'Custom', importance: 3 });
    assert.equal(native.channels.get('custom')?.importance, 3);
  });

  it('maps the deprecated shouldShowAlert onto shouldShowBanner/shouldShowList', async () => {
    const native = createFakeNative();
    const engine = createLegacyEngineAdapter({ native, gate: createPermissionGate(native, createEnv()) });
    engine.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
    });

    const behavior = await native.handler?.handleNotification({
      request: { identifier: 'x', content: {} },
    });
    assert.deepEqual(behavior, {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    assert.ok(!('shouldShowAlert' in (behavior ?? {})));
  });

  it('normalizeBehavior respects explicit modern flags over the deprecated one', () => {
    assert.deepEqual(normalizeBehavior({ shouldShowAlert: true, shouldShowBanner: false, shouldShowList: true }), {
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('removes the handler when the service passes null', () => {
    const native = createFakeNative();
    const engine = createLegacyEngineAdapter({ native, gate: createPermissionGate(native, createEnv()) });
    engine.setNotificationHandler({ handleNotification: async () => ({}) });
    engine.setNotificationHandler(null);
    assert.equal(native.handler, null);
  });

  const reminderRequest = {
    identifier: 'fitonus-reminder-workout',
    content: { title: 't', body: 'b' },
    trigger: { type: 'daily', hour: 7, minute: 0 },
  };

  it('quietly skips scheduling while notification permission is not granted (no throw, no native call)', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    const engine = createLegacyEngineAdapter({ native, gate: createPermissionGate(native, createEnv()) });

    // The existing service would log a console.error (a LogBox error in dev) if this threw.
    const id = await engine.scheduleNotificationAsync(reminderRequest);

    assert.equal(id, '', 'an empty id means "nothing was scheduled"');
    assert.equal(native.count('scheduleNotificationAsync'), 0);
    assert.equal(native.count('requestPermissionsAsync'), 0, 'scheduling must never prompt');
  });

  it('schedules once permission is granted', async () => {
    const native = createFakeNative({ permission: GRANTED });
    const engine = createLegacyEngineAdapter({ native, gate: createPermissionGate(native, createEnv()) });
    const id = await engine.scheduleNotificationAsync(reminderRequest);
    assert.equal(id, 'fitonus-reminder-workout');
    assert.equal(native.count('scheduleNotificationAsync'), 1);
  });

  it('does not schedule while signed out, even with permission granted', async () => {
    const native = createFakeNative({ permission: GRANTED });
    let signedIn = false;
    const gate = createPermissionGate(native, createEnv(), { isSignedIn: () => signedIn });
    const engine = createLegacyEngineAdapter({ native, gate });

    assert.equal(await engine.scheduleNotificationAsync(reminderRequest), '');
    assert.equal(native.count('scheduleNotificationAsync'), 0);
    assert.equal(native.count('getPermissionsAsync'), 0, 'sign-in is checked before asking the OS');

    signedIn = true;
    assert.equal(await engine.scheduleNotificationAsync(reminderRequest), 'fitonus-reminder-workout');
    assert.equal(native.count('scheduleNotificationAsync'), 1);
  });

  it('reports why a reminder was refused', async () => {
    const native = createFakeNative({ permission: DENIED });
    let signedIn = false;
    const gate = createPermissionGate(native, createEnv(), { isSignedIn: () => signedIn });

    assert.deepEqual(await gate.check(), { allowed: false, reason: 'signed-out' });
    signedIn = true;
    assert.deepEqual(await gate.check(), { allowed: false, reason: 'permission-not-granted' });
    native.permission = GRANTED;
    gate.invalidate();
    assert.deepEqual(await gate.check(), { allowed: true });
  });

  it('caches the permission lookup and refreshes it after a permission request', async () => {
    const native = createFakeNative({ permission: UNDETERMINED });
    let clock = 0;
    const gate = createPermissionGate(native, createEnv(), { ttlMs: 1000, now: () => clock });
    const engine = createLegacyEngineAdapter({ native, gate });

    assert.equal((await gate.check()).allowed, false);
    assert.equal((await gate.check()).allowed, false);
    assert.equal(native.count('getPermissionsAsync'), 1, 'second check within the TTL is served from cache');

    // The user grants permission through the existing preferences flow.
    native.promptAnswer = GRANTED;
    await engine.requestPermissionsAsync();
    assert.equal((await gate.check()).allowed, true, 'cache must be invalidated by a permission request');

    clock = 5000;
    native.permission = DENIED; // revoked in system settings
    assert.equal((await gate.check()).allowed, false, 'cache expires after the TTL');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLOCKED, GRANTED, UNDETERMINED, VALID_TOKEN, createEnv, createFakeNative } from './helpers/fake-notifications-native';
import { copyDeviceTokenForDev } from '../src/features/notifications/services/notification-dev-token';

const read = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

const setup = (permission = GRANTED) => {
  const native = createFakeNative({ permission });
  const copied: string[] = [];
  const copyToClipboard = async (text: string) => {
    copied.push(text);
  };
  return { native, copied, copyToClipboard };
};

describe('Dev-only FCM token copy', () => {
  it('creates channels, reads the native FCM token, copies it, and reports a fixed message', async () => {
    const t = setup();
    const result = await copyDeviceTokenForDev({ native: t.native, env: createEnv(), copyToClipboard: t.copyToClipboard, isDev: true });

    assert.deepEqual(result, { ok: true, message: 'FCM token copied to clipboard' });
    assert.deepEqual(t.copied, [VALID_TOKEN]);
    assert.equal(t.native.count('getDevicePushTokenAsync'), 1);
    assert.equal(t.native.channels.size > 0, true, 'channels exist before the token is requested');
    const firstChannel = t.native.calls.indexOf('setNotificationChannelAsync');
    assert.ok(firstChannel >= 0 && firstChannel < t.native.calls.indexOf('getDevicePushTokenAsync'));
    assert.ok(!JSON.stringify(result).includes(VALID_TOKEN), 'the token is never part of the result');
  });

  it('does nothing outside development builds', async () => {
    const t = setup();
    const result = await copyDeviceTokenForDev({ native: t.native, env: createEnv(), copyToClipboard: t.copyToClipboard, isDev: false });
    assert.equal(result.ok, false);
    assert.equal(t.native.calls.length, 0);
    assert.deepEqual(t.copied, []);
  });

  it('never prompts: without permission it explains what to do and copies nothing', async () => {
    for (const permission of [UNDETERMINED, BLOCKED]) {
      const t = setup(permission);
      const result = await copyDeviceTokenForDev({ native: t.native, env: createEnv(), copyToClipboard: t.copyToClipboard, isDev: true });
      assert.equal(result.ok, false);
      assert.match(result.message, /Allow notifications first/);
      assert.equal(t.native.count('requestPermissionsAsync'), 0);
      assert.deepEqual(t.copied, []);
    }
  });

  it('turns token and clipboard failures into safe messages that never echo native error text', async () => {
    const failing = setup();
    failing.native.tokenImpl = async () => {
      throw new Error(`SERVICE_NOT_AVAILABLE ${VALID_TOKEN}`);
    };
    const tokenFailure = await copyDeviceTokenForDev({ native: failing.native, env: createEnv(), copyToClipboard: failing.copyToClipboard, isDev: true });
    assert.equal(tokenFailure.ok, false);
    assert.ok(!tokenFailure.message.includes(VALID_TOKEN));

    const noClipboard = setup();
    const clipboardFailure = await copyDeviceTokenForDev({
      native: noClipboard.native,
      env: createEnv(),
      isDev: true,
      copyToClipboard: async () => {
        throw new Error(`Cannot find native module ExpoClipboard ${VALID_TOKEN}`);
      },
    });
    assert.deepEqual(clipboardFailure, { ok: false, message: 'Could not copy to the clipboard.' });
  });

  it('is wired behind __DEV__ only, and never logs or sends the token', () => {
    const screen = read('src/features/notifications/screens/NotificationPreferencesScreen.tsx');
    assert.match(screen, /\{__DEV__ \? <DevFcmTokenButton \/> : null\}/);

    const component = read('src/features/notifications/components/DevFcmTokenButton.tsx');
    assert.match(component, /if \(!__DEV__\) return null;/);
    const service = read('src/features/notifications/services/notification-dev-token.ts');
    for (const source of [component, service]) {
      assert.doesNotMatch(source, /console\.|logger\.|apiClient|fetch\(|axios/, 'no logging or network use');
    }
  });
});

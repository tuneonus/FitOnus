import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKED,
  DENIED,
  GRANTED,
  UNDETERMINED,
  ROTATED_TOKEN,
  VALID_TOKEN,
  createEnv,
  createFakeHttp,
  createFakeNative,
  createMemoryStore,
  httpError,
  networkError,
} from './helpers/fake-notifications-native';
import {
  classifyRegistrationError,
  createPushRegistrationApi,
  registerDeviceWithRetry,
  type PushRegistrationApi,
} from '../src/features/notifications/services/notification-api';
import {
  PUSH_REGISTRATION_KEY,
  createNotificationCoordinator,
} from '../src/features/notifications/services/notification-coordinator';
import {
  registerSessionEndCleanup,
  runSessionEndCleanups,
} from '../src/features/notifications/services/notification-logout-hook';
import type { PushBackendConfig, PushDeviceRegistrationRequest } from '../src/features/notifications/types/push-contract';

const CONFIG: PushBackendConfig = {
  upsertDevicePath: (id) => `/test-only/devices/${id}`,
  deleteDevicePath: (id) => `/test-only/devices/${id}`,
};

const REQUEST: PushDeviceRegistrationRequest = {
  installationId: 'install-1',
  pushToken: VALID_TOKEN,
  platform: 'android',
  appVersion: '1.0.0',
  timeZone: 'Asia/Kolkata',
};

const noSleep = async () => {};

describe('Remote registration adapter', () => {
  it('is inactive without a backend config and sends no network requests', async () => {
    const http = createFakeHttp();
    const api = createPushRegistrationApi({ http });

    assert.equal(api.isActive, false);
    assert.deepEqual(await api.register(REQUEST), { status: 'inactive' });
    assert.deepEqual(await api.unregister('install-1'), { status: 'inactive' });
    assert.equal(http.calls.length, 0);
  });

  it('treats an explicit null config as inactive too', async () => {
    const http = createFakeHttp();
    const api = createPushRegistrationApi({ http, config: null });
    assert.equal(api.isActive, false);
    await api.register(REQUEST);
    assert.equal(http.calls.length, 0);
  });

  it('sends the contract body to the configured path when active', async () => {
    const http = createFakeHttp();
    const api = createPushRegistrationApi({ http, config: CONFIG });

    const outcome = await api.register(REQUEST);
    assert.equal(outcome.status, 'registered');
    assert.deepEqual(http.calls, [{ method: 'PUT', url: '/test-only/devices/install-1', body: REQUEST }]);
  });

  it('deregisters via the configured path and treats an already-missing row as success', async () => {
    const http = createFakeHttp([{ status: 204 }, { error: httpError(404) }]);
    const api = createPushRegistrationApi({ http, config: CONFIG });
    assert.deepEqual(await api.unregister('install-1'), { status: 'unregistered' });
    assert.deepEqual(await api.unregister('install-1'), { status: 'unregistered' });
    assert.equal(http.calls[0]?.method, 'DELETE');
  });

  it('classifies failures into retryable and permanent kinds', () => {
    assert.deepEqual(classifyRegistrationError(httpError(503)), { kind: 'server', retryable: true, httpStatus: 503 });
    assert.deepEqual(classifyRegistrationError(httpError(429)), { kind: 'rate-limited', retryable: true, httpStatus: 429 });
    assert.deepEqual(classifyRegistrationError(httpError(401)), { kind: 'auth', retryable: false, httpStatus: 401 });
    assert.deepEqual(classifyRegistrationError(httpError(404)), { kind: 'endpoint-missing', retryable: false, httpStatus: 404 });
    assert.deepEqual(classifyRegistrationError(httpError(422)), { kind: 'rejected', retryable: false, httpStatus: 422 });
    assert.deepEqual(classifyRegistrationError(networkError()), { kind: 'network', retryable: true });
    assert.deepEqual(classifyRegistrationError({ name: 'SessionChangedError' }), { kind: 'auth', retryable: false });
    assert.deepEqual(classifyRegistrationError(new Error('???')), { kind: 'unknown', retryable: false });
    assert.deepEqual(classifyRegistrationError(undefined), { kind: 'unknown', retryable: false });
  });
});

describe('Registration retry handling', () => {
  const api = (script: Parameters<typeof createFakeHttp>[0]) => {
    const http = createFakeHttp(script);
    return { http, api: createPushRegistrationApi({ http, config: CONFIG }) };
  };

  it('retries transient failures with exponential backoff, then succeeds', async () => {
    const { http, api: client } = api([{ error: httpError(503) }, { error: networkError() }, { status: 200 }]);
    const delays: number[] = [];

    const outcome = await registerDeviceWithRetry(client, REQUEST, {
      maxAttempts: 4,
      baseDelayMs: 100,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    assert.deepEqual(outcome, { status: 'registered', attempts: 3 });
    assert.deepEqual(delays, [100, 200]);
    assert.equal(http.calls.length, 3);
  });

  it('gives up after maxAttempts and reports a retryable failure', async () => {
    const { http, api: client } = api([{ error: httpError(500) }, { error: httpError(500) }, { error: httpError(500) }]);
    const outcome = await registerDeviceWithRetry(client, REQUEST, { maxAttempts: 3, baseDelayMs: 1, sleep: noSleep });
    assert.deepEqual(outcome, { status: 'failed', kind: 'server', retryable: true, attempts: 3 });
    assert.equal(http.calls.length, 3);
  });

  it('does not retry permanent failures', async () => {
    const { http, api: client } = api([{ error: httpError(400) }]);
    const outcome = await registerDeviceWithRetry(client, REQUEST, { maxAttempts: 5, baseDelayMs: 1, sleep: noSleep });
    assert.deepEqual(outcome, { status: 'failed', kind: 'rejected', retryable: false, attempts: 1 });
    assert.equal(http.calls.length, 1);
  });

  it('stops retrying as soon as the caller aborts (e.g. the user logged out)', async () => {
    const { http, api: client } = api([{ error: httpError(503) }, { error: httpError(503) }, { status: 200 }]);
    let aborted = false;
    const outcome = await registerDeviceWithRetry(client, REQUEST, {
      maxAttempts: 5,
      baseDelayMs: 1,
      sleep: async () => {
        aborted = true;
      },
      shouldAbort: () => aborted,
    });
    assert.equal(outcome.status, 'failed');
    assert.equal(http.calls.length, 1);
  });

  it('returns inactive without sleeping or retrying when the adapter is inactive', async () => {
    const inactive: PushRegistrationApi = createPushRegistrationApi({ http: createFakeHttp() });
    let slept = false;
    const outcome = await registerDeviceWithRetry(inactive, REQUEST, {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: async () => {
        slept = true;
      },
    });
    assert.deepEqual(outcome, { status: 'inactive' });
    assert.equal(slept, false);
  });
});

function setup(options: {
  active?: boolean;
  script?: Parameters<typeof createFakeHttp>[0];
  permission?: typeof GRANTED;
  env?: Parameters<typeof createEnv>[0];
  sleep?: (ms: number) => Promise<void>;
  cleanupTimeoutMs?: number;
  refreshIntervalMs?: number;
} = {}) {
  const native = createFakeNative({ permission: options.permission ?? GRANTED });
  const http = createFakeHttp(options.script);
  const store = createMemoryStore();
  const env = createEnv(options.env);
  let cancelled = 0;
  let ids = 0;
  let clock = 1_000_000;

  const coordinator = createNotificationCoordinator({
    native,
    env,
    api: createPushRegistrationApi({ http, config: options.active === false ? null : CONFIG }),
    store,
    cancelLocalReminders: async () => {
      cancelled += 1;
    },
    newInstallationId: () => `install-${++ids}`,
    now: () => clock,
    sleep: options.sleep ?? noSleep,
    retry: { maxAttempts: 3, baseDelayMs: 10 },
    ...(options.cleanupTimeoutMs !== undefined ? { cleanupTimeoutMs: options.cleanupTimeoutMs } : {}),
    ...(options.refreshIntervalMs !== undefined ? { refreshIntervalMs: options.refreshIntervalMs } : {}),
  });

  return {
    native,
    http,
    store,
    env,
    coordinator,
    cancelledCount: () => cancelled,
    advance: (ms: number) => {
      clock += ms;
    },
    stored: () => {
      const raw = store.data.get(PUSH_REGISTRATION_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    },
  };
}

describe('Push registration lifecycle', () => {
  it('with the backend inactive it reports token-acquired, never "registered", and sends nothing', async () => {
    const t = setup({ active: false });
    const state = await t.coordinator.syncOnAuthReady('user-1');

    assert.deepEqual(state, { status: 'token-acquired', token: VALID_TOKEN, backend: 'inactive' });
    assert.equal(t.http.calls.length, 0);
    assert.equal(t.stored()?.backendRegistered, false);
  });

  it('registers with the backend, persists the result, and skips redundant work afterwards', async () => {
    const t = setup();
    const first = await t.coordinator.syncOnAuthReady('user-1');

    assert.deepEqual(first, { status: 'registered', token: VALID_TOKEN });
    assert.equal(t.http.calls.length, 1);
    assert.equal(t.stored()?.backendRegistered, true);
    const body = t.http.calls[0]?.body as PushDeviceRegistrationRequest;
    assert.equal(body.pushToken, VALID_TOKEN);
    assert.equal(body.platform, 'android');
    assert.equal(body.timeZone, 'Asia/Kolkata');
    assert.equal(body.installationId, 'install-1');

    // Within the refresh interval nothing is re-fetched or re-sent (saves network and battery).
    t.advance(60_000);
    const second = await t.coordinator.syncOnAuthReady('user-1');
    assert.deepEqual(second, { status: 'registered', token: VALID_TOKEN });
    assert.equal(t.native.count('getDevicePushTokenAsync'), 1);
    assert.equal(t.http.calls.length, 1);
  });

  it('re-checks the token after the refresh interval but does not re-send an unchanged token', async () => {
    const t = setup({ refreshIntervalMs: 1000 });
    await t.coordinator.syncOnAuthReady('user-1');
    t.advance(5000);
    const state = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(state.status, 'registered');
    assert.equal(t.native.count('getDevicePushTokenAsync'), 2);
    assert.equal(t.http.calls.length, 1, 'same user + same token must not be re-registered');
  });

  it('retries a transient registration failure, then registers', async () => {
    const delays: number[] = [];
    const t = setup({
      script: [{ error: httpError(503) }, { error: networkError() }, { status: 200 }],
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    const state = await t.coordinator.syncOnAuthReady('user-1');
    assert.deepEqual(state, { status: 'registered', token: VALID_TOKEN });
    assert.deepEqual(delays, [10, 20]);
    assert.equal(t.http.calls.length, 3);
  });

  it('surfaces pending-retry after exhausting retries and recovers on retryPending', async () => {
    const t = setup({
      script: [{ error: httpError(500) }, { error: httpError(500) }, { error: httpError(500) }],
    });
    const failed = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(failed.status, 'pending-retry');
    assert.equal(failed.status === 'pending-retry' && failed.attempts, 3);
    assert.equal(t.stored()?.backendRegistered, false, 'a failed registration must not be recorded as done');

    // Backend recovers (script is exhausted, so the default answer is 200).
    const recovered = await t.coordinator.retryPending('user-1');
    assert.deepEqual(recovered, { status: 'registered', token: VALID_TOKEN });
    assert.equal(t.stored()?.backendRegistered, true);
  });

  it('does not retry a permanent registration failure and reports it as failed', async () => {
    const t = setup({ script: [{ error: httpError(400) }] });
    const state = await t.coordinator.syncOnAuthReady('user-1');
    assert.deepEqual(state, { status: 'failed', reason: 'rejected', retryable: false });
    assert.equal(t.http.calls.length, 1);

    const again = await t.coordinator.retryPending('user-1');
    assert.equal(again.status, 'failed');
    assert.equal(t.http.calls.length, 1, 'retryPending must not hammer a permanently failing endpoint');
  });

  it('reports a missing backend endpoint (404) as failed without retrying', async () => {
    const t = setup({ script: [{ error: httpError(404) }] });
    const state = await t.coordinator.syncOnAuthReady('user-1');
    assert.deepEqual(state, { status: 'failed', reason: 'endpoint-missing', retryable: false });
    assert.equal(t.http.calls.length, 1);
  });

  it('NEVER prompts for permission when syncing after sign-in', async () => {
    const t = setup({ permission: UNDETERMINED });
    const state = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(state.status, 'permission-required');
    assert.equal(t.native.count('requestPermissionsAsync'), 0);
    assert.equal(t.native.count('getDevicePushTokenAsync'), 0);
    assert.equal(t.http.calls.length, 0);
  });

  it('prompts only through the explicit user-action path, then registers', async () => {
    const t = setup({ permission: UNDETERMINED });
    t.native.promptAnswer = GRANTED;

    const result = await t.coordinator.enablePushFromUserAction('user-1');
    assert.equal(result.permission.granted, true);
    assert.deepEqual(result.state, { status: 'registered', token: VALID_TOKEN });
    assert.equal(t.native.count('requestPermissionsAsync'), 1);
  });

  it('handles a user who denies permission without acquiring a token', async () => {
    const t = setup({ permission: UNDETERMINED });
    t.native.promptAnswer = BLOCKED;

    const result = await t.coordinator.enablePushFromUserAction('user-1');
    assert.equal(result.permission.granted, false);
    assert.deepEqual(result.state, {
      status: 'permission-required',
      canAskAgain: false,
      requiresSystemSettings: true,
    });
    assert.equal(t.native.count('getDevicePushTokenAsync'), 0);
  });

  it('keeps asking-again possible after a first denial', async () => {
    const t = setup({ permission: UNDETERMINED });
    t.native.promptAnswer = DENIED;
    const result = await t.coordinator.enablePushFromUserAction('user-1');
    assert.deepEqual(result.state, {
      status: 'permission-required',
      canAskAgain: true,
      requiresSystemSettings: false,
    });
  });

  it('reports unsupported devices without prompting or calling the backend', async () => {
    const noPlayServices = setup();
    noPlayServices.native.tokenImpl = async () => {
      throw new Error('Google Play services is not available on this device');
    };
    assert.deepEqual(await noPlayServices.coordinator.syncOnAuthReady('user-1'), {
      status: 'unsupported',
      reason: 'play-services-unavailable',
    });

    const expoGo = setup({ env: { isExpoGo: true } });
    assert.deepEqual(await expoGo.coordinator.syncOnAuthReady('user-1'), {
      status: 'unsupported',
      reason: 'expo-go-android',
    });

    const noFcm = setup();
    noFcm.native.tokenImpl = async () => {
      throw new Error('Default FirebaseApp is not initialized');
    };
    assert.deepEqual(await noFcm.coordinator.syncOnAuthReady('user-1'), {
      status: 'unsupported',
      reason: 'fcm-not-configured',
    });

    for (const t of [noPlayServices, expoGo, noFcm]) {
      assert.equal(t.native.count('requestPermissionsAsync'), 0);
      assert.equal(t.http.calls.length, 0);
    }
  });

  it('re-registers with the rotated device token (token refresh lifecycle)', async () => {
    const t = setup();
    await t.coordinator.syncOnAuthReady('user-1');

    // The OS already reports the new token in the rotation event; asking for it again would re-trigger the listener.
    const tokenCallsBefore = t.native.count('getDevicePushTokenAsync');
    const rotated = { type: 'android', data: ROTATED_TOKEN };
    const state = await t.coordinator.handleDeviceTokenChanged('user-1', rotated);

    assert.deepEqual(state, { status: 'registered', token: ROTATED_TOKEN });
    assert.equal(t.native.count('getDevicePushTokenAsync'), tokenCallsBefore);
    assert.equal(t.http.calls.length, 2);
    const body = t.http.calls[1]?.body as PushDeviceRegistrationRequest;
    assert.equal(body.pushToken, ROTATED_TOKEN);
    assert.equal(body.installationId, 'install-1', 'the installation id survives token rotation');
    assert.equal(t.stored()?.token, ROTATED_TOKEN);
  });

  it('coalesces overlapping triggers into a single registration', async () => {
    const t = setup();
    const [a, b, c] = await Promise.all([
      t.coordinator.syncOnAuthReady('user-1'),
      t.coordinator.syncOnAuthReady('user-1'),
      t.coordinator.retryPending('user-1'),
    ]);
    assert.equal(a.status, 'registered');
    assert.equal(b.status, 'registered');
    assert.equal(c.status === 'registered' || c.status === 'idle', true);
    assert.equal(t.native.count('getDevicePushTokenAsync'), 1);
    assert.equal(t.http.calls.length, 1);
  });

  it('re-registers when a different user signs in on the same device', async () => {
    const t = setup();
    await t.coordinator.syncOnAuthReady('user-a');
    const state = await t.coordinator.syncOnAuthReady('user-b');

    assert.equal(state.status, 'registered');
    assert.equal(t.http.calls.length, 2);
    assert.equal(t.stored()?.userId, 'user-b');
  });

  it('notifies subscribers of state changes and stops after unsubscribe', async () => {
    const t = setup({ active: false });
    const seen: string[] = [];
    const unsubscribe = t.coordinator.subscribe((state) => seen.push(state.status));
    await t.coordinator.syncOnAuthReady('user-1');
    unsubscribe();
    await t.coordinator.logoutCleanup();
    assert.deepEqual(seen, ['token-acquired']);
  });
});

describe('Logout cleanup', () => {
  it('deregisters on the backend, invalidates the device token, clears local data and cancels reminders', async () => {
    const t = setup();
    await t.coordinator.syncOnAuthReady('user-1');
    assert.ok(t.stored());

    const result = await t.coordinator.logoutCleanup();

    assert.deepEqual(result, {
      backend: 'unregistered',
      deviceTokenInvalidated: true,
      localRegistrationCleared: true,
      remindersCancelled: true,
    });
    const deletion = t.http.calls.find((call) => call.method === 'DELETE');
    assert.equal(deletion?.url, '/test-only/devices/install-1');
    assert.equal(t.native.count('unregisterForNotificationsAsync'), 1);
    assert.equal(t.stored(), null);
    assert.equal(t.cancelledCount(), 1);
    assert.deepEqual(t.coordinator.getState(), { status: 'idle' });
  });

  it('still clears everything locally when the backend is unreachable', async () => {
    const t = setup();
    await t.coordinator.syncOnAuthReady('user-1');
    t.http.script.push({ error: networkError() });

    const result = await t.coordinator.logoutCleanup();

    assert.equal(result.backend, 'failed');
    assert.equal(result.deviceTokenInvalidated, true, 'the FCM token is invalidated so a stale backend row is useless');
    assert.equal(result.localRegistrationCleared, true);
    assert.equal(result.remindersCancelled, true);
    assert.equal(t.stored(), null);
  });

  it('does not call the backend when the adapter is inactive, but still cleans up locally', async () => {
    const t = setup({ active: false });
    await t.coordinator.syncOnAuthReady('user-1');

    const result = await t.coordinator.logoutCleanup();

    assert.equal(result.backend, 'inactive');
    assert.equal(t.http.calls.length, 0);
    assert.equal(result.localRegistrationCleared, true);
    assert.equal(t.stored(), null);
  });

  it('still deregisters when the registration response was lost (server may hold an orphan row)', async () => {
    const t = setup({
      script: [{ error: httpError(500) }, { error: httpError(500) }, { error: httpError(500) }],
    });
    const state = await t.coordinator.syncOnAuthReady('user-1');
    assert.equal(state.status, 'pending-retry');
    assert.equal(t.stored()?.backendRegistered, false);

    const result = await t.coordinator.logoutCleanup();

    assert.equal(result.backend, 'unregistered');
    assert.equal(t.http.calls.filter((call) => call.method === 'DELETE').length, 1);
  });

  it('cancels reminders but leaves the push token alone when push was never enabled', async () => {
    const t = setup({ permission: UNDETERMINED });
    const result = await t.coordinator.logoutCleanup();

    assert.equal(result.backend, 'skipped');
    assert.equal(result.remindersCancelled, true);
    assert.equal(t.cancelledCount(), 1);
    assert.equal(t.native.count('unregisterForNotificationsAsync'), 0, 'no FCM calls for users who never enabled push');
  });

  it('survives every step failing and still reports what happened', async () => {
    const t = setup();
    await t.coordinator.syncOnAuthReady('user-1');
    t.native.unregisterForNotificationsAsync = async () => {
      throw new Error('FCM unavailable');
    };
    t.store.remove = async () => {
      throw new Error('storage unavailable');
    };
    t.http.script.push({ error: httpError(500) });
    const coordinator = createNotificationCoordinator({
      native: t.native,
      env: t.env,
      api: createPushRegistrationApi({ http: t.http, config: CONFIG }),
      store: t.store,
      cancelLocalReminders: async () => {
        throw new Error('scheduler unavailable');
      },
      newInstallationId: () => 'x',
    });

    const result = await coordinator.logoutCleanup();
    assert.deepEqual(result, {
      backend: 'failed',
      deviceTokenInvalidated: false,
      localRegistrationCleared: false,
      remindersCancelled: false,
    });
  });

  it('is bounded: a hanging backend cannot block logout', async () => {
    const t = setup({ cleanupTimeoutMs: 25 });
    await t.coordinator.syncOnAuthReady('user-1');
    t.http.delete = () => new Promise(() => {}); // never settles

    const started = Date.now();
    const result = await t.coordinator.logoutCleanup();

    assert.equal(result.backend, 'failed');
    assert.ok(Date.now() - started < 1000, 'cleanup must return promptly despite the hung request');
    assert.equal(t.stored(), null);
  });

  it('aborts an in-flight registration retry loop when the user logs out', async () => {
    const releases: (() => void)[] = [];
    const t = setup({
      script: [{ error: httpError(503) }, { error: httpError(503) }, { status: 200 }],
      sleep: () => new Promise<void>((resolve) => releases.push(resolve)),
    });

    const pending = t.coordinator.syncOnAuthReady('user-1');
    // Wait until the first attempt failed and the loop is sleeping before its retry.
    while (releases.length === 0) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.http.calls.length, 1);

    await t.coordinator.logoutCleanup(); // user logs out mid-backoff
    releases.forEach((release) => release());
    await pending;

    assert.equal(t.http.calls.filter((call) => call.method === 'PUT').length, 1, 'no further registration attempts');
    assert.equal(t.stored(), null, 'a logged-out session must not leave a registration behind');
    assert.deepEqual(t.coordinator.getState(), { status: 'idle' });
  });

  it('runs through the session-end hook that AuthService.logout will call', async () => {
    const t = setup();
    await t.coordinator.syncOnAuthReady('user-1');

    const unregister = registerSessionEndCleanup(async () => {
      await t.coordinator.logoutCleanup();
    });
    try {
      await runSessionEndCleanups();
    } finally {
      unregister();
    }

    assert.equal(t.stored(), null);
    assert.equal(t.cancelledCount(), 1);
    assert.equal(t.native.count('unregisterForNotificationsAsync'), 1);
  });
});

describe('Session-end cleanup registry', () => {
  it('is a no-op when nothing is registered', async () => {
    await assert.doesNotReject(() => runSessionEndCleanups());
  });

  it('runs every cleanup, never rejects, and stops running removed cleanups', async () => {
    const ran: string[] = [];
    const offA = registerSessionEndCleanup(async () => {
      ran.push('a');
    });
    const offB = registerSessionEndCleanup(async () => {
      ran.push('b');
      throw new Error('cleanup b failed');
    });
    const offC = registerSessionEndCleanup(() => {
      throw new Error('synchronous failure');
    });

    await assert.doesNotReject(() => runSessionEndCleanups());
    assert.deepEqual(ran.sort(), ['a', 'b']);

    offA();
    offB();
    offC();
    ran.length = 0;
    await runSessionEndCleanups();
    assert.deepEqual(ran, []);
  });

  it('is bounded by the timeout so a stuck cleanup cannot block logout', async () => {
    const off = registerSessionEndCleanup(() => new Promise(() => {}));
    try {
      const started = Date.now();
      await runSessionEndCleanups(25);
      assert.ok(Date.now() - started < 1000);
    } finally {
      off();
    }
  });
});

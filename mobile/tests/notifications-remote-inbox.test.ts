import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeNative, tapResponse } from './helpers/fake-notifications-native';
import {
  createInboxApi,
  parsePreferences,
  parseRemoteNotification,
  type InboxApi,
  type InboxHttpClient,
  type PreferenceSnapshot,
} from '../src/features/notifications/services/notification-inbox-api';
import {
  REMOTE_DESTINATION_ROUTES,
  groupFor,
  routeForRemoteDestination,
  timeLabel,
  toAppNotification,
} from '../src/features/notifications/services/notification-inbox-mapper';
import {
  destinationFromNotificationData,
  parseNotificationPayload,
  parseRemotePushPayload,
} from '../src/features/notifications/services/notification-routing';
import { startNotificationListeners } from '../src/features/notifications/services/notification-listeners';
import { createRemoteHandlers } from '../src/features/notifications/services/notification-remote-handlers';
import {
  ALL_ENABLED,
  createCategoryPreferenceController,
} from '../src/features/notifications/services/notification-category-preferences';
import { useNotificationsStore } from '../src/features/notifications/store/notificationsStore';
import type { RouteName } from '../src/app/navigation/routes';

const ID = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';
const ID2 = '9a5c4b75-2e2d-4d4f-9f7a-6e4e3a0d8b12';

const remoteRow = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  category: 'announcements',
  title: 'Hello',
  body: 'World',
  destination: 'goals',
  read: false,
  readAt: null,
  createdAt: '2026-11-13T10:30:00.000Z',
  ...overrides,
});

interface Call {
  method: string;
  url: string;
  body?: unknown;
  params?: Record<string, unknown> | undefined;
}

function fakeHttp(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const respond = (method: string, url: string) => {
    const key = `${method} ${url}`;
    if (!(key in responses)) return { data: { success: true, data: {} } };
    const value = responses[key];
    if (value instanceof Error) throw value;
    return { data: value };
  };
  const http: InboxHttpClient = {
    get: async (url, config) => {
      calls.push({ method: 'GET', url, params: config?.params });
      return respond('GET', url);
    },
    post: async (url, body) => {
      calls.push({ method: 'POST', url, body });
      return respond('POST', url);
    },
    put: async (url, body) => {
      calls.push({ method: 'PUT', url, body });
      return respond('PUT', url);
    },
    delete: async (url) => {
      calls.push({ method: 'DELETE', url });
      return respond('DELETE', url);
    },
  };
  return { http, calls };
}

describe('Inbox API client', () => {
  it('unwraps the backend envelope and pagination meta', async () => {
    const { http, calls } = fakeHttp({
      'GET /notifications': {
        success: true,
        data: { items: [remoteRow()], unreadCount: 3 },
        meta: { page: 1, limit: 30, total: 31, totalPages: 2 },
      },
    });
    const page = await createInboxApi(http).list();
    assert.equal(page.items.length, 1);
    assert.equal(page.unreadCount, 3);
    assert.equal(page.totalPages, 2);
    assert.deepEqual(calls[0]?.params, { page: 1, limit: 30, unreadOnly: false });
  });

  it('drops a malformed row instead of failing the whole inbox', async () => {
    const { http } = fakeHttp({
      'GET /notifications': {
        success: true,
        data: {
          items: [remoteRow(), remoteRow({ id: 'not-a-uuid' }), remoteRow({ category: 'unknown' }), { junk: true }, null],
          unreadCount: 1,
        },
      },
    });
    const page = await createInboxApi(http).list();
    assert.deepEqual(page.items.map((n) => n.id), [ID]);
  });

  it('treats an unexpected response shape as an error rather than an empty inbox', async () => {
    const { http } = fakeHttp({ 'GET /notifications': { oops: true } });
    await assert.rejects(createInboxApi(http).list(), /Unexpected notifications response/);
  });

  it('hits the documented endpoints', async () => {
    const { http, calls } = fakeHttp({
      'GET /notifications/unread-count': { success: true, data: { unreadCount: 4 } },
    });
    const api = createInboxApi(http);
    assert.equal(await api.unreadCount(), 4);
    await api.markRead(ID);
    await api.markAllRead();
    await api.remove(ID);
    await api.confirmReceived(ID);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url}`),
      [
        'GET /notifications/unread-count',
        `POST /notifications/${ID}/read`,
        'POST /notifications/read-all',
        `DELETE /notifications/${ID}`,
        `POST /notifications/${ID}/received`,
      ],
    );
  });

  it('refuses a non-UUID id before any request is made (the id ends up in a URL path)', async () => {
    const { http, calls } = fakeHttp();
    const api = createInboxApi(http);
    for (const bad of ['../admin/notifications', `${ID}/../x`, '', 'abc', `${ID}?x=1`]) {
      await assert.rejects(api.markRead(bad), /Invalid notification id/);
      await assert.rejects(api.remove(bad), /Invalid notification id/);
      await assert.rejects(api.confirmReceived(bad), /Invalid notification id/);
    }
    assert.equal(calls.length, 0);
  });

  it('reads and saves category preferences', async () => {
    const snapshot = {
      success: true,
      data: { pushEnabled: true, categories: { announcements: false, challenges: true, coach_insights: true, goal_updates: true, workout_reminders: true, habit_reminders: true }, updatedAt: null },
    };
    const { http, calls } = fakeHttp({ 'GET /notifications/preferences': snapshot, 'PUT /notifications/preferences': snapshot });
    const api = createInboxApi(http);
    const prefs = await api.getPreferences();
    assert.equal(prefs.categories.announcements, false);
    assert.equal(prefs.categories.challenges, true);
    await api.updatePreferences({ categories: { announcements: false } });
    assert.deepEqual(calls[1]?.body, { categories: { announcements: false } });
  });

  it('parses preferences defensively: anything not explicitly false counts as enabled', () => {
    const prefs = parsePreferences({ pushEnabled: false, categories: { announcements: false, challenges: 'no', extra: false } });
    assert.equal(prefs.pushEnabled, false);
    assert.deepEqual(prefs.categories, { announcements: false, challenges: true, coach_insights: true, goal_updates: true });
    assert.throws(() => parsePreferences('nope'));
  });

  it('parseRemoteNotification validates every field', () => {
    assert.ok(parseRemoteNotification(remoteRow()));
    assert.equal(parseRemoteNotification(remoteRow({ title: 5 })), null);
    assert.equal(parseRemoteNotification(remoteRow({ createdAt: 'yesterday' })), null);
    assert.equal(parseRemoteNotification(remoteRow({ read: 'yes' }))?.read, false);
    assert.equal(parseRemoteNotification(remoteRow({ destination: 7 }))?.destination, null);
  });
});

describe('Remote destination allow-list and inbox mapping', () => {
  it('maps every allow-listed key to a real route, and nothing else', () => {
    assert.equal(routeForRemoteDestination('weekly_report'), 'weeklyReport');
    assert.equal(routeForRemoteDestination('goals'), 'goals');
    for (const bad of [null, undefined, '', 'login', 'settings', 'https://evil.example', '/admin', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(routeForRemoteDestination(bad), null, `${String(bad)} must not resolve`);
    }
  });

  it('never allow-lists auth, onboarding or account screens', () => {
    const forbidden: RouteName[] = ['login', 'signup', 'splash', 'onboarding', 'resetPassword', 'changePassword', 'account', 'settings'];
    for (const route of Object.values(REMOTE_DESTINATION_ROUTES)) assert.ok(!forbidden.includes(route), route);
  });

  it('turns a server row into an inbox item with an Open action only for known destinations', () => {
    const now = new Date('2026-11-13T12:00:00');
    const known = toAppNotification(parseRemoteNotification(remoteRow({ createdAt: '2026-11-13T04:00:00' }))!, now);
    assert.equal(known.remote, true);
    assert.equal(known.actionRoute, 'goals');
    assert.equal(known.actionLabel, 'Open');
    assert.equal(known.group, 'Today');

    const unknown = toAppNotification(parseRemoteNotification(remoteRow({ destination: 'something-else' }))!, now);
    assert.equal(unknown.actionRoute, undefined);
  });

  it('groups by local calendar day and formats time labels', () => {
    const now = new Date(2026, 10, 13, 12, 0);
    assert.equal(groupFor(new Date(2026, 10, 13, 0, 5), now), 'Today');
    assert.equal(groupFor(new Date(2026, 10, 12, 23, 59), now), 'Yesterday');
    assert.equal(groupFor(new Date(2026, 10, 1, 9, 0), now), 'Earlier');
    assert.equal(timeLabel(new Date(2026, 10, 13, 0, 5), now), '12:05 AM');
    assert.equal(timeLabel(new Date(2026, 10, 13, 15, 30), now), '3:30 PM');
    assert.equal(timeLabel(new Date(2026, 10, 1, 9, 0), now), 'Nov 1');
  });
});

describe('Remote push payloads and navigation', () => {
  it('parses a server push (string-only data) and rejects anything without a valid notificationId', () => {
    assert.deepEqual(parseRemotePushPayload({ notificationId: ID, category: 'announcements', destination: 'goals' }), {
      notificationId: ID,
      category: 'announcements',
      destination: 'goals',
    });
    assert.deepEqual(parseRemotePushPayload({ notificationId: ID }), { notificationId: ID, category: null, destination: null });
    for (const bad of [null, [], 'x', {}, { notificationId: 'nope' }, { notificationId: 42 }, { destination: 'goals' }]) {
      assert.equal(parseRemotePushPayload(bad), null);
    }
  });

  it('opens an allow-listed screen from a server push', () => {
    assert.deepEqual(destinationFromNotificationData({ notificationId: ID, destination: 'challenges' }), { type: 'screen', route: 'challenges' });
    assert.deepEqual(destinationFromNotificationData({ notificationId: ID, destination: 'progress' }), { type: 'tab', tab: 'progress' });
    assert.deepEqual(destinationFromNotificationData({ notificationId: ID, destination: 'weekly_report' }), { type: 'screen', route: 'weeklyReport' });
  });

  it('ignores a server push that names no destination, an unknown one, or tries to name a route/url/screen', () => {
    assert.equal(destinationFromNotificationData({ notificationId: ID }), null);
    assert.equal(destinationFromNotificationData({ notificationId: ID, destination: 'login' }), null);
    assert.equal(destinationFromNotificationData({ notificationId: ID, route: 'settings' }), null);
    assert.equal(destinationFromNotificationData({ notificationId: ID, url: 'https://evil.example', screen: 'account' }), null);
  });

  it('does not let a payload without a notificationId steer navigation (spoofed local-looking data)', () => {
    assert.equal(destinationFromNotificationData({ destination: 'profile' }), null);
    assert.equal(destinationFromNotificationData({ destination: 'goals', category: 'announcements' }), null);
  });

  it('keeps local reminders and server pushes distinguishable so one never counts as the other', () => {
    const reminder = { route: 'workoutPlan', kind: 'workout' };
    assert.equal(parseRemotePushPayload(reminder), null, 'a local reminder is never treated as a server push');
    assert.equal(parseNotificationPayload({ notificationId: ID, destination: 'goals' }), null, 'a server push has no local kind');
    assert.deepEqual(destinationFromNotificationData(reminder), { type: 'screen', route: 'workoutPlan' });
  });
});

describe('Listeners: foreground and tap handling of server pushes', () => {
  const received = (data: unknown, identifier = 'r1') => ({ request: { identifier, content: { title: 't', body: 'b', data } } });

  it('reports a foreground server push exactly once, even if the OS redelivers it', () => {
    const native = createFakeNative();
    const seen: string[] = [];
    startNotificationListeners(native, { onDestination: () => {}, onRemoteReceived: (p) => seen.push(p.notificationId) });
    native.emitReceived(received({ notificationId: ID }));
    native.emitReceived(received({ notificationId: ID }, 'r2'));
    native.emitReceived(received({ notificationId: ID2 }, 'r3'));
    assert.deepEqual(seen, [ID, ID2]);
  });

  it('does not report local reminders as server pushes', () => {
    const native = createFakeNative();
    const seen: string[] = [];
    startNotificationListeners(native, { onDestination: () => {}, onRemoteReceived: (p) => seen.push(p.notificationId) });
    native.emitReceived(received({ kind: 'workout', route: 'workoutPlan' }));
    native.emitReceived(received(undefined, 'r9'));
    assert.deepEqual(seen, []);
  });

  it('a tap on a server push reports it as opened AND navigates to its destination', () => {
    const native = createFakeNative();
    const opened: string[] = [];
    const destinations: unknown[] = [];
    startNotificationListeners(native, {
      onDestination: (d) => destinations.push(d),
      onRemoteOpened: (p) => opened.push(p.notificationId),
    });
    native.emitResponse(tapResponse({ notificationId: ID, destination: 'goals' }));
    assert.deepEqual(opened, [ID]);
    assert.deepEqual(destinations, [{ type: 'screen', route: 'goals' }]);
  });

  it('a tap on a server push without a destination is still reported as opened but navigates nowhere', () => {
    const native = createFakeNative();
    const opened: string[] = [];
    const destinations: unknown[] = [];
    startNotificationListeners(native, {
      onDestination: (d) => destinations.push(d),
      onRemoteOpened: (p) => opened.push(p.notificationId),
    });
    native.emitResponse(tapResponse({ notificationId: ID }));
    assert.deepEqual(opened, [ID]);
    assert.deepEqual(destinations, []);
  });

  it('handles a cold start from a notification tap (terminated app)', async () => {
    const native = createFakeNative();
    native.lastResponse = tapResponse({ notificationId: ID, destination: 'nutrition' });
    const opened: string[] = [];
    const destinations: unknown[] = [];
    const handle = startNotificationListeners(native, {
      onDestination: (d) => destinations.push(d),
      onRemoteOpened: (p) => opened.push(p.notificationId),
    });
    await handle.ready;
    assert.deepEqual(opened, [ID]);
    assert.deepEqual(destinations, [{ type: 'screen', route: 'nutrition' }]);
  });

  it('ignores dismiss and custom actions', () => {
    const native = createFakeNative();
    const opened: string[] = [];
    startNotificationListeners(native, { onDestination: () => {}, onRemoteOpened: (p) => opened.push(p.notificationId) });
    native.emitResponse(tapResponse({ notificationId: ID }, { actionIdentifier: 'expo.modules.notifications.actions.DISMISS' }));
    assert.deepEqual(opened, []);
  });

  it('stops everything after stop()', () => {
    const native = createFakeNative();
    const seen: string[] = [];
    const handle = startNotificationListeners(native, { onDestination: () => {}, onRemoteReceived: (p) => seen.push(p.notificationId) });
    handle.stop();
    native.emitReceived(received({ notificationId: ID }));
    assert.deepEqual(seen, []);
  });
});

describe('Remote handlers', () => {
  const setup = (api: Partial<InboxApi> = {}) => {
    const events: string[] = [];
    const full: InboxApi = {
      list: async () => ({ items: [], unreadCount: 0, page: 1, totalPages: 1 }),
      unreadCount: async () => 0,
      markRead: async (id) => void events.push(`read:${id}`),
      markAllRead: async () => {},
      remove: async () => {},
      confirmReceived: async (id) => void events.push(`received:${id}`),
      getPreferences: async () => ({ pushEnabled: true, categories: { ...ALL_ENABLED } }),
      updatePreferences: async () => ({ pushEnabled: true, categories: { ...ALL_ENABLED } }),
      ...api,
    };
    const handlers = createRemoteHandlers({
      api: full,
      syncInbox: async () => void events.push('sync'),
      markReadLocally: (id) => void events.push(`local:${id}`),
    });
    return { handlers, events };
  };

  it('a foreground push confirms receipt and refreshes the inbox', () => {
    const { handlers, events } = setup();
    handlers.onReceived({ notificationId: ID, destination: null, category: null });
    assert.deepEqual(events, [`received:${ID}`, 'sync']);
  });

  it('a tap marks it read locally, confirms receipt, marks it read on the server and refreshes', () => {
    const { handlers, events } = setup();
    handlers.onOpened({ notificationId: ID, destination: 'goals', category: null });
    assert.deepEqual(events, [`local:${ID}`, `received:${ID}`, `read:${ID}`, 'sync']);
  });

  it('server failures never throw into the notification listener', async () => {
    const boom = async () => {
      throw new Error('offline');
    };
    const { handlers } = setup({ confirmReceived: boom, markRead: boom });
    handlers.onReceived({ notificationId: ID, destination: null, category: null });
    handlers.onOpened({ notificationId: ID, destination: null, category: null });
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('Category preference controller', () => {
  const snapshot = (overrides: Partial<PreferenceSnapshot['categories']> = {}): PreferenceSnapshot => ({
    pushEnabled: true,
    categories: { ...ALL_ENABLED, ...overrides },
  });

  it('is not interactive until the server answered once', async () => {
    const api = { getPreferences: async () => snapshot(), updatePreferences: async () => snapshot() } as unknown as InboxApi;
    const controller = createCategoryPreferenceController(api);
    assert.equal(controller.getState().loaded, false);
    assert.equal(await controller.toggle('announcements'), false);
    await controller.load();
    assert.equal(controller.getState().loaded, true);
  });

  it('loads what the server has', async () => {
    const api = { getPreferences: async () => snapshot({ challenges: false }), updatePreferences: async () => snapshot() } as unknown as InboxApi;
    const controller = createCategoryPreferenceController(api);
    await controller.load();
    assert.equal(controller.getState().categories.challenges, false);
    assert.equal(controller.getState().categories.announcements, true);
  });

  it('toggles optimistically and sends only the changed category', async () => {
    const sent: unknown[] = [];
    const api = {
      getPreferences: async () => snapshot(),
      updatePreferences: async (patch: unknown) => {
        sent.push(patch);
        return snapshot({ announcements: false });
      },
    } as unknown as InboxApi;
    const controller = createCategoryPreferenceController(api);
    await controller.load();
    const pending = controller.toggle('announcements');
    assert.equal(controller.getState().categories.announcements, false, 'flipped immediately');
    assert.equal(await pending, true);
    assert.deepEqual(sent, [{ categories: { announcements: false } }]);
  });

  it('rolls back and flags an error when the server refuses', async () => {
    const api = {
      getPreferences: async () => snapshot(),
      updatePreferences: async () => {
        throw new Error('offline');
      },
    } as unknown as InboxApi;
    const controller = createCategoryPreferenceController(api);
    await controller.load();
    assert.equal(await controller.toggle('challenges'), false);
    assert.equal(controller.getState().categories.challenges, true);
    assert.equal(controller.getState().error, true);
  });

  it('applies quick successive taps in order', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = {
      getPreferences: async () => snapshot(),
      updatePreferences: async (patch: { categories: Record<string, boolean> }) => {
        const [key, value] = Object.entries(patch.categories)[0]!;
        if (order.length === 0) await gate;
        order.push(`${key}=${value}`);
        return snapshot(patch.categories);
      },
    } as unknown as InboxApi;
    const controller = createCategoryPreferenceController(api);
    await controller.load();
    const first = controller.toggle('announcements');
    const second = controller.toggle('challenges');
    release();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['announcements=false', 'challenges=false']);
  });

  it('a failed load can be retried', async () => {
    let fail = true;
    const api = {
      getPreferences: async () => {
        if (fail) throw new Error('down');
        return snapshot();
      },
      updatePreferences: async () => snapshot(),
    } as unknown as InboxApi;
    const controller = createCategoryPreferenceController(api);
    await controller.load();
    assert.deepEqual([controller.getState().loaded, controller.getState().error], [false, true]);
    fail = false;
    await controller.load();
    assert.deepEqual([controller.getState().loaded, controller.getState().error], [true, false]);
  });
});

describe('Inbox store', () => {
  const calls: string[] = [];
  let listImpl: () => Promise<{ items: ReturnType<typeof parseRemoteNotification>[]; unreadCount: number; page: number; totalPages: number }>;

  const api = (): InboxApi => ({
    list: (() => listImpl()) as unknown as InboxApi['list'],
    unreadCount: async () => 0,
    markRead: async (id) => void calls.push(`read:${id}`),
    markAllRead: async () => void calls.push('read-all'),
    remove: async (id) => void calls.push(`remove:${id}`),
    confirmReceived: async () => {},
    getPreferences: async () => ({ pushEnabled: true, categories: { ...ALL_ENABLED } }),
    updatePreferences: async () => ({ pushEnabled: true, categories: { ...ALL_ENABLED } }),
  });

  beforeEach(() => {
    calls.length = 0;
    useNotificationsStore.getState().resetStore();
    useNotificationsStore.getState().attachInboxApi(api());
    listImpl = async () => ({
      items: [parseRemoteNotification(remoteRow())!, parseRemoteNotification(remoteRow({ id: ID2, read: true, title: 'Older' }))!],
      unreadCount: 1,
      page: 1,
      totalPages: 1,
    });
  });

  it('replaces the list with the server inbox and tracks unread items', async () => {
    await useNotificationsStore.getState().syncInbox();
    const state = useNotificationsStore.getState();
    assert.equal(state.inboxLoaded, true);
    assert.equal(state.items.length, 2);
    assert.equal(state.items.filter((n) => !n.read).length, 1);
    assert.ok(state.items.every((n) => n.remote));
  });

  it('marks read optimistically and tells the server once', async () => {
    await useNotificationsStore.getState().syncInbox();
    useNotificationsStore.getState().markRead(ID);
    assert.equal(useNotificationsStore.getState().items.find((n) => n.id === ID)?.read, true);
    useNotificationsStore.getState().markRead(ID); // already read: no second call
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [`read:${ID}`]);
  });

  it('mark-all and remove reach the server', async () => {
    await useNotificationsStore.getState().syncInbox();
    useNotificationsStore.getState().markAllRead();
    useNotificationsStore.getState().remove(ID2);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ['read-all', `remove:${ID2}`]);
    assert.deepEqual(useNotificationsStore.getState().items.map((n) => n.id), [ID]);
  });

  it('keeps what it has and flags an error when the server cannot be reached', async () => {
    await useNotificationsStore.getState().syncInbox();
    listImpl = async () => {
      throw new Error('offline');
    };
    await useNotificationsStore.getState().syncInbox();
    const state = useNotificationsStore.getState();
    assert.equal(state.items.length, 2);
    assert.equal(state.inboxError, true);
    assert.equal(state.inboxSyncing, false);
  });

  it('a response that arrives after sign-out does not repopulate the next user\'s inbox', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = listImpl;
    listImpl = async () => {
      await gate;
      return original();
    };
    const pending = useNotificationsStore.getState().syncInbox();
    useNotificationsStore.getState().resetStore(); // logout
    release();
    await pending;
    assert.deepEqual(useNotificationsStore.getState().items, []);
    assert.equal(useNotificationsStore.getState().inboxLoaded, false);
  });

  it('does nothing (and does not crash) while no API is attached', async () => {
    useNotificationsStore.getState().attachInboxApi(null);
    await useNotificationsStore.getState().syncInbox();
    assert.equal(useNotificationsStore.getState().inboxLoaded, false);
  });
});

describe('Device registration endpoints', () => {
  it('registers and removes a device on the documented paths, with the token in the body only', async () => {
    const { PUSH_BACKEND_CONFIG } = await import('../src/features/notifications/services/notification-backend-config');
    const { createPushRegistrationApi } = await import('../src/features/notifications/services/notification-api');
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const api = createPushRegistrationApi({
      config: PUSH_BACKEND_CONFIG,
      http: {
        put: async (url, body) => {
          calls.push({ method: 'PUT', url, body });
          return { status: 200, data: {} };
        },
        delete: async (url) => {
          calls.push({ method: 'DELETE', url });
          return { status: 200, data: {} };
        },
      },
    });
    assert.equal(api.isActive, true);
    await api.register({ installationId: ID, pushToken: 'tok'.repeat(10), platform: 'android', appVersion: '1.0.0', timeZone: 'Asia/Kolkata' });
    await api.unregister(ID);
    assert.equal(calls[0]?.url, `/notifications/devices/${ID}`);
    assert.equal(calls[1]?.url, `/notifications/devices/${ID}`);
    assert.ok(!calls.some((c) => c.url.includes('tok'.repeat(10))), 'a token must never appear in a URL');
  });

  it('encodes an unexpected installation id instead of letting it alter the path', async () => {
    const { PUSH_BACKEND_CONFIG } = await import('../src/features/notifications/services/notification-backend-config');
    assert.equal(PUSH_BACKEND_CONFIG.upsertDevicePath('../x?y=1'), '/notifications/devices/..%2Fx%3Fy%3D1');
  });
});

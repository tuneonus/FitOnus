import { registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import { notificationPreferenceDefaults } from '../data/notificationsMock';
import type { InboxApi } from '../services/notification-inbox-api';
import { toAppNotification } from '../services/notification-inbox-mapper';
import type { AppNotification, NotificationPreference } from '../types/notification';

type NotificationsState = {
  items: AppNotification[];
  preferences: NotificationPreference[];
  /** True once the server inbox has been fetched at least once for this user. */
  inboxLoaded: boolean;
  inboxSyncing: boolean;
  inboxError: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  togglePreference: (key: string) => void;
  setPreferenceTime: (key: string, time: string) => void;
  /** Wires the server API in (kept out of the store so it stays loadable in node tests). */
  attachInboxApi: (api: InboxApi | null) => void;
  /** Replaces the list with the newest page from the server. Safe to call repeatedly. */
  syncInbox: () => Promise<void>;
  resetStore: () => void;
};

let inboxApi: InboxApi | null = null;
// A response that arrives after the user signed out (or a newer sync started) must not repopulate the list.
let syncGeneration = 0;

const quietly = (promise: Promise<unknown> | undefined): void => {
  promise?.catch(() => {
    // The optimistic change stays; the next sync reconciles it with the server.
  });
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  preferences: notificationPreferenceDefaults,
  inboxLoaded: false,
  inboxSyncing: false,
  inboxError: false,
  resetStore: () => {
    syncGeneration += 1;
    set({
      items: [],
      preferences: notificationPreferenceDefaults,
      inboxLoaded: false,
      inboxSyncing: false,
      inboxError: false,
    });
  },
  attachInboxApi: (api) => {
    inboxApi = api;
  },
  syncInbox: async () => {
    const api = inboxApi;
    if (!api) return;
    const generation = ++syncGeneration;
    set({ inboxSyncing: true });
    try {
      const page = await api.list({ page: 1, limit: 50 });
      if (generation !== syncGeneration) return;
      const now = new Date();
      const local = get().items.filter((n) => !n.remote);
      set({
        items: [...page.items.map((n) => toAppNotification(n, now)), ...local],
        inboxLoaded: true,
        inboxSyncing: false,
        inboxError: false,
      });
    } catch {
      if (generation === syncGeneration) set({ inboxSyncing: false, inboxError: true });
    }
  },
  markRead: (id) => {
    const item = get().items.find((n) => n.id === id);
    if (!item || item.read) return;
    set({ items: get().items.map((n) => (n.id === id ? { ...n, read: true } : n)) });
    if (item.remote) quietly(inboxApi?.markRead(id));
  },
  markAllRead: () => {
    const hasRemoteUnread = get().items.some((n) => n.remote && !n.read);
    set({ items: get().items.map((n) => ({ ...n, read: true })) });
    if (hasRemoteUnread) quietly(inboxApi?.markAllRead());
  },
  remove: (id) => {
    const item = get().items.find((n) => n.id === id);
    set({ items: get().items.filter((n) => n.id !== id) });
    if (item?.remote) quietly(inboxApi?.remove(id));
  },
  togglePreference: (key) =>
    set({
      preferences: get().preferences.map((p) =>
        p.key === key ? { ...p, enabled: !p.enabled } : p,
      ),
    }),
  setPreferenceTime: (key, time) =>
    set({
      preferences: get().preferences.map((p) => (p.key === key ? { ...p, time } : p)),
    }),
}));

export const useUnreadCount = () =>
  useNotificationsStore((s) => s.items.filter((n) => !n.read).length);

registerUserStore(useNotificationsStore);

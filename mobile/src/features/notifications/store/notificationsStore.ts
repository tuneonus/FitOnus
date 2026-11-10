import { registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import { notificationPreferenceDefaults } from '../data/notificationsMock';
import type { AppNotification, NotificationPreference } from '../types/notification';

type NotificationsState = {
  items: AppNotification[];
  preferences: NotificationPreference[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  togglePreference: (key: string) => void;
  setPreferenceTime: (key: string, time: string) => void;
  resetStore: () => void;
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  preferences: notificationPreferenceDefaults,
  resetStore: () =>
    set({
      items: [],
      preferences: notificationPreferenceDefaults,
    }),
  markRead: (id) =>
    set({
      items: get().items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }),
  markAllRead: () => set({ items: get().items.map((n) => ({ ...n, read: true })) }),
  remove: (id) => set({ items: get().items.filter((n) => n.id !== id) }),
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

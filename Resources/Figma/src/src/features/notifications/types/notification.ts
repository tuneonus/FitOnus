export type NotificationKind = 'walking' | 'water' | 'protein' | 'workout' | 'sleep' | 'achievement' | 'streak' | 'report';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  group: 'Today' | 'Yesterday' | 'Earlier';
  read: boolean;
  actionLabel?: string;
  actionRoute?: string;
};

export type NotificationPreference = {
  key: NotificationKind;
  label: string;
  description: string;
  enabled: boolean;
  time?: string;
};
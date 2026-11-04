import type { RouteName } from '../../../app/navigation/routes';

export type NotificationKind =
  | 'workout'
  | 'water'
  | 'streak'
  | 'protein'
  | 'achievement'
  | 'sleep'
  | 'report'
  | 'walking';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  group: 'Today' | 'Yesterday' | 'Earlier';
  read: boolean;
  actionLabel?: string;
  actionRoute?: RouteName;
};

export type NotificationPreference = {
  key: NotificationKind;
  label: string;
  description: string;
  enabled: boolean;
  time?: string | undefined;
};

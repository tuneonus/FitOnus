// Mirrors backend/src/modules/notifications. Kept as plain types so the dashboard has no runtime dependency on the API.

export const SERVER_CATEGORIES = ['announcements', 'challenges', 'coach_insights', 'goal_updates'] as const;
export type NotificationCategory = (typeof SERVER_CATEGORIES)[number];

/** Closed list: the app maps each key to a screen. A notification can never carry a route or URL. */
export const NOTIFICATION_DESTINATIONS = [
  'home',
  'activity',
  'coach',
  'progress',
  'profile',
  'workouts',
  'nutrition',
  'goals',
  'challenges',
  'badges',
  'weekly_report',
  'notifications',
] as const;
export type NotificationDestination = (typeof NOTIFICATION_DESTINATIONS)[number];

export type AudienceType = 'all' | 'users' | 'segment';

export interface AudienceFilter {
  primaryGoal?: string[];
  experienceLevel?: string[];
  onboardingCompleted?: boolean;
}

export interface Audience {
  type: AudienceType;
  userIds: string[];
  filter: AudienceFilter;
}

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'partially_failed'
  | 'failed'
  | 'cancelled';

export type DeliveryStatus =
  | 'pending'
  | 'processing'
  | 'accepted'
  | 'dry_run'
  | 'received'
  | 'failed'
  | 'invalid_token';

export interface DeliveryCounts {
  total: number;
  pending: number;
  processing: number;
  accepted: number;
  dryRun: number;
  received: number;
  failed: number;
  invalidToken: number;
}

export interface NotificationCampaign {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  destination: NotificationDestination | null;
  audience: Audience;
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  targetCount: number;
  skippedCount: number;
  lastError: string | null;
  /** Present on the detail endpoint only. */
  deliveries: DeliveryCounts | null;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  userId: string;
  userEmail: string | null;
  deviceId: string | null;
  status: DeliveryStatus;
  attempts: number;
  errorCode: string | null;
  acceptedAt: string | null;
  receivedAt: string | null;
  updatedAt: string;
}

export interface NotificationContent {
  title: string;
  body: string;
  category: NotificationCategory;
  destination: NotificationDestination | null;
  audience: { type: AudienceType; userIds: string[]; filter: AudienceFilter };
}

export type LaunchMode = 'draft' | 'send_now' | 'schedule';

export interface CreateNotificationInput extends NotificationContent {
  mode: LaunchMode;
  scheduledAt: string | null;
  confirmBulk: boolean;
}

export interface UpdateNotificationInput extends NotificationContent {
  version: number;
}

export interface SendNotificationInput {
  scheduledAt: string | null;
  confirmBulk: boolean;
}

export interface NotificationPreview {
  audience: {
    matchedUsers: number;
    eligibleUsers: number;
    pushableUsers: number;
    pushableDevices: number;
  };
  requiresConfirmation: boolean;
  pushAvailable: boolean;
  push: {
    title: string;
    body: string;
    category: NotificationCategory;
    destination: NotificationDestination | null;
  };
}

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
}

export interface ListDeliveriesQuery {
  page?: number;
  limit?: number;
  status?: DeliveryStatus;
}

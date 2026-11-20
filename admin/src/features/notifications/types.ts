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
  /** Object key of the attached image (round-tripped on edit), or null for a text-only notification. */
  imageKey: string | null;
  /** Public URL of the image, derived by the server from the key. Never sent back to the API. */
  imageUrl: string | null;
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
  /** The key returned by the upload endpoint. There is deliberately no URL field: the server builds the URL. */
  imageKey: string | null;
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
    imageUrl: string | null;
  };
}

/** What the upload endpoint returns for an accepted image. */
export interface UploadedNotificationImage {
  imageKey: string;
  /** Public URL of the stored image. */
  imageUrl: string;
  /** Whatever was uploaded, the stored image is an optimized WebP with no metadata. */
  contentType: 'image/webp';
  /** Size of the stored WebP. */
  sizeBytes: number;
  width: number;
  height: number;
  /** What was uploaded, before conversion. */
  source: { format: 'jpeg' | 'png' | 'webp' | 'heic'; bytes: number; width: number; height: number };
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

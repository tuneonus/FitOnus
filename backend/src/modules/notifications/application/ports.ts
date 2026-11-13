import type { Page } from '../../../shared/pagination/pagination.js';
import type {
  Audience,
  CampaignStatus,
  DeliveryCounts,
  DeliveryStatus,
  PreferenceCategory,
  ServerCategory,
} from '../domain/notification-policy.js';

// ---------------------------------------------------------------- push provider

export interface PushMessage {
  /** Provider registration token. Treated as a secret: never logged, never returned to another user. */
  token: string;
  title: string;
  body: string;
  /** FCM data values must be strings. */
  data: Record<string, string>;
  channelId: string;
}

export type PushSendResult =
  | { kind: 'accepted'; messageId: string | null }
  /** The provider says this token can never receive messages again. */
  | { kind: 'invalid_token'; code: string }
  /** Worth another attempt later (outage, quota, network). */
  | { kind: 'retryable'; code: string; retryAfterMs?: number }
  /** A permanent refusal that retrying cannot fix. */
  | { kind: 'failed'; code: string };

export interface PushSender {
  /** True when messages are validated by the provider but never delivered. */
  readonly dryRun: boolean;
  send(message: PushMessage): Promise<PushSendResult>;
}

// ---------------------------------------------------------------- devices

export interface DeviceInput {
  installationId: string;
  pushToken: string;
  platform: 'android' | 'ios';
  appVersion: string | null;
  timezone: string | null;
}

export interface DeviceView {
  id: string;
  installationId: string;
  platform: 'android' | 'ios';
  appVersion: string | null;
  timezone: string | null;
  status: 'active' | 'invalid';
  lastRegisteredAt: string;
}

export interface DeviceRepository {
  /** Upserts by (user, installation) and takes the token away from any other row that held it. */
  upsert(userId: string, input: DeviceInput): Promise<DeviceView>;
  /** Removes only the caller's own device. Returns whether a row was removed. */
  remove(userId: string, installationId: string): Promise<boolean>;
  list(userId: string): Promise<DeviceView[]>;
}

// ---------------------------------------------------------------- preferences

export interface NotificationPreferencesView {
  /** The existing master switch (user_settings.notifications_enabled). */
  pushEnabled: boolean;
  categories: Record<PreferenceCategory, boolean>;
  updatedAt: string | null;
}

export interface PreferenceRepository {
  get(userId: string): Promise<NotificationPreferencesView>;
  update(
    userId: string,
    patch: { pushEnabled?: boolean; categories?: Partial<Record<PreferenceCategory, boolean>> },
  ): Promise<NotificationPreferencesView>;
}

// ---------------------------------------------------------------- inbox

export interface InboxNotificationView {
  id: string;
  category: ServerCategory;
  title: string;
  body: string;
  destination: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface InboxRepository {
  list(
    userId: string,
    query: { page: number; limit: number; unreadOnly: boolean },
  ): Promise<Page<InboxNotificationView>>;
  unreadCount(userId: string): Promise<number>;
  /** All of these only ever touch the caller's own rows; false/0 means "not yours or not found". */
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
  remove(userId: string, id: string): Promise<boolean>;
  /** The app confirms it received a push for this inbox item. */
  confirmReceived(userId: string, id: string): Promise<boolean>;
}

// ---------------------------------------------------------------- campaigns

export interface CampaignContent {
  title: string;
  body: string;
  category: ServerCategory;
  destination: string | null;
  audience: Audience;
}

export interface CampaignRecord extends CampaignContent {
  id: string;
  createdBy: string | null;
  status: CampaignStatus;
  scheduledAt: Date | null;
  startedAt: Date | null;
  fannedOutAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  targetCount: number;
  skippedCount: number;
  lastError: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AudiencePreview {
  /** Active users matching the audience. */
  matchedUsers: number;
  /** Of those, users who have not switched this category off. */
  eligibleUsers: number;
  /** Of those, users who will actually get a push (master switch on, at least one active device). */
  pushableUsers: number;
  /** Active devices a push would be attempted on. */
  pushableDevices: number;
}

export interface FanOutResult {
  targetCount: number;
  skippedCount: number;
  notificationCount: number;
  deliveryCount: number;
}

export interface DeliveryJob {
  id: string;
  notificationId: string;
  campaignId: string;
  attempts: number;
  /** Null when the device row is gone or no longer active. */
  token: string | null;
  deviceId: string | null;
  title: string;
  body: string;
  category: ServerCategory;
  destination: string | null;
}

export type DeliveryOutcome =
  | { kind: 'accepted'; messageId: string | null; dryRun: boolean }
  | { kind: 'retry'; errorCode: string; delayMs: number }
  | { kind: 'failed'; errorCode: string }
  | { kind: 'invalid_token'; errorCode: string };

export interface DeliveryRecord {
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

export interface CampaignRepository {
  insert(
    input: CampaignContent & { createdBy: string; scheduledAt: Date | null; status: 'draft' | 'scheduled' },
  ): Promise<CampaignRecord>;
  findById(id: string): Promise<CampaignRecord | null>;
  list(query: { page: number; limit: number; status?: CampaignStatus }): Promise<Page<CampaignRecord>>;
  /** Edits a draft only. Returns null when the campaign is not a draft (or the version moved). */
  updateDraft(id: string, content: CampaignContent, expectedVersion: number): Promise<CampaignRecord | null>;
  /** Draft → scheduled in one atomic statement. Null when it was not a draft. */
  schedule(id: string, scheduledAt: Date): Promise<CampaignRecord | null>;
  /** Draft/scheduled → cancelled in one atomic statement. Null when it already started or finished. */
  cancel(id: string, adminId: string): Promise<CampaignRecord | null>;
  deliveryCounts(campaignId: string): Promise<DeliveryCounts>;
  listDeliveries(
    campaignId: string,
    query: { page: number; limit: number; status?: DeliveryStatus },
  ): Promise<Page<DeliveryRecord>>;
  previewAudience(audience: Audience, category: ServerCategory): Promise<AudiencePreview>;
}

/** Operations only the dispatcher needs. */
export interface DispatchRepository {
  /** Atomically leases due (or abandoned) campaigns so two workers never process the same one. */
  claimDueCampaigns(limit: number, leaseMs: number): Promise<CampaignRecord[]>;
  /** Idempotent: safe to run again after a crash. */
  fanOut(campaign: CampaignRecord): Promise<FanOutResult>;
  /** Leases a batch of sendable deliveries. Attempts are counted when leased. */
  claimDeliveries(
    campaignId: string,
    limit: number,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<DeliveryJob[]>;
  recordOutcome(deliveryId: string, outcome: DeliveryOutcome): Promise<void>;
  invalidateDevice(deviceId: string, reason: string): Promise<void>;
  deliveryCounts(campaignId: string): Promise<DeliveryCounts>;
  finish(campaignId: string, status: CampaignStatus, lastError: string | null): Promise<void>;
  /** Gives the lease back so another tick can pick the campaign up (deliveries waiting for a retry). */
  releaseLease(campaignId: string): Promise<void>;
}

export interface AdminAuditPort {
  recordAuditLog(entry: {
    adminId: string;
    action: string;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<unknown>;
}

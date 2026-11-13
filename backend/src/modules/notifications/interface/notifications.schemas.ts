import { z } from 'zod';
import {
  idempotencyHeadersSchema,
  idParamsSchema,
  paginationQuerySchema,
} from '../../../shared/http/schemas.js';
import { MAX_AUDIENCE_USERS } from '../domain/audience.js';
import {
  AUDIENCE_TYPES,
  CAMPAIGN_STATUSES,
  DELIVERY_STATUSES,
  NOTIFICATION_DESTINATIONS,
  PREFERENCE_CATEGORIES,
  SERVER_CATEGORIES,
} from '../domain/notification-policy.js';

// ------------------------------------------------------------------ member: devices

// FCM registration tokens are ~150-200 chars of [A-Za-z0-9_-:]. Anything else is not a token.
const pushTokenSchema = z
  .string()
  .min(20)
  .max(4096)
  .regex(/^[A-Za-z0-9_\-:.]+$/, 'Must be a push registration token');

const installationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, 'Must be 8-128 characters of letters, digits, "_" or "-"');

export const upsertDeviceRequest = {
  params: z.object({ installationId: installationIdSchema }),
  body: z.strictObject({
    // The body repeats the id so a client bug (path/body mismatch) is rejected instead of guessed at.
    installationId: installationIdSchema,
    pushToken: pushTokenSchema,
    platform: z.enum(['android', 'ios']).default('android'),
    appVersion: z.string().trim().max(64).nullable().default(null),
    timeZone: z.string().trim().max(64).nullable().default(null),
  }),
};

export const removeDeviceRequest = { params: z.object({ installationId: installationIdSchema }) };

export const deviceViewSchema = z.object({
  id: z.uuid(),
  installationId: z.string(),
  platform: z.enum(['android', 'ios']),
  appVersion: z.string().nullable(),
  timezone: z.string().nullable(),
  status: z.enum(['active', 'invalid']),
  lastRegisteredAt: z.iso.datetime(),
});

export const removedSchema = z.object({ removed: z.boolean() });

// ------------------------------------------------------------------ member: preferences

const categoriesShape = Object.fromEntries(PREFERENCE_CATEGORIES.map((key) => [key, z.boolean()])) as Record<
  (typeof PREFERENCE_CATEGORIES)[number],
  z.ZodBoolean
>;

export const preferencesSchema = z.object({
  pushEnabled: z.boolean(),
  categories: z.object(categoriesShape),
  updatedAt: z.iso.datetime().nullable(),
});

export const updatePreferencesRequest = {
  body: z
    .strictObject({
      pushEnabled: z.boolean().optional(),
      categories: z.strictObject(categoriesShape).partial().optional(),
    })
    .refine((value) => value.pushEnabled !== undefined || value.categories !== undefined, {
      message: 'Provide pushEnabled or categories.',
    }),
};

// ------------------------------------------------------------------ member: inbox

export const listInboxRequest = {
  query: paginationQuerySchema.extend({
    unreadOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  }),
};

export const inboxNotificationSchema = z.object({
  id: z.uuid(),
  category: z.enum(SERVER_CATEGORIES),
  title: z.string(),
  body: z.string(),
  destination: z.string().nullable(),
  read: z.boolean(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const inboxPageSchema = z.object({
  items: z.array(inboxNotificationSchema),
  unreadCount: z.number().int(),
});

export const notificationIdRequest = { params: idParamsSchema };
export const unreadCountSchema = z.object({ unreadCount: z.number().int() });
export const idResultSchema = z.object({ id: z.uuid() });
export const updatedCountSchema = z.object({ updated: z.number().int() });

// ------------------------------------------------------------------ admin: campaigns

const audienceFilterSchema = z.strictObject({
  primaryGoal: z.array(z.string().min(1).max(32)).max(10).optional(),
  experienceLevel: z.array(z.string().min(1).max(32)).max(10).optional(),
  onboardingCompleted: z.boolean().optional(),
});

const audienceSchema = z.strictObject({
  type: z.enum(AUDIENCE_TYPES),
  userIds: z.array(z.uuid()).max(MAX_AUDIENCE_USERS).default([]),
  filter: audienceFilterSchema.default({}),
});

/** C0/C1 control characters (optionally allowing line feeds) have no place in a push notification. */
function hasControlCharacters(value: string, allowNewline: boolean): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (allowNewline && code === 10) continue;
    if (code < 32 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

const campaignContentShape = {
  // Control characters have no place in a push title; trimmed text must still be non-empty.
  title: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => !hasControlCharacters(value, false), 'Must not contain control characters'),
  body: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !hasControlCharacters(value, true), 'Must not contain control characters'),
  category: z.enum(SERVER_CATEGORIES),
  // A closed key list, never a route or URL: the app decides what each key opens.
  destination: z.enum(NOTIFICATION_DESTINATIONS).nullable().default(null),
  audience: audienceSchema,
};

export const createCampaignRequest = {
  headers: idempotencyHeadersSchema,
  body: z
    .strictObject({
      ...campaignContentShape,
      mode: z.enum(['draft', 'send_now', 'schedule']).default('draft'),
      scheduledAt: z.iso.datetime().nullable().default(null),
      confirmBulk: z.boolean().default(false),
    })
    .transform((value) => ({
      ...value,
      scheduledAt: value.scheduledAt ? new Date(value.scheduledAt) : null,
    })),
};

export const previewCampaignRequest = { body: z.strictObject(campaignContentShape) };

export const updateCampaignRequest = {
  params: idParamsSchema,
  body: z.strictObject({ ...campaignContentShape, version: z.number().int().min(1) }),
};

export const sendCampaignRequest = {
  params: idParamsSchema,
  headers: idempotencyHeadersSchema,
  body: z
    .strictObject({
      scheduledAt: z.iso.datetime().nullable().default(null),
      confirmBulk: z.boolean().default(false),
    })
    .transform((value) => ({
      ...value,
      scheduledAt: value.scheduledAt ? new Date(value.scheduledAt) : null,
    })),
};

export const campaignIdRequest = { params: idParamsSchema };

export const listCampaignsRequest = {
  query: paginationQuerySchema.extend({ status: z.enum(CAMPAIGN_STATUSES).optional() }),
};

export const listDeliveriesRequest = {
  params: idParamsSchema,
  query: paginationQuerySchema.extend({ status: z.enum(DELIVERY_STATUSES).optional() }),
};

const deliveryCountsSchema = z.object({
  total: z.number().int(),
  pending: z.number().int(),
  processing: z.number().int(),
  accepted: z.number().int(),
  dryRun: z.number().int(),
  received: z.number().int(),
  failed: z.number().int(),
  invalidToken: z.number().int(),
});

export const campaignViewSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  category: z.enum(SERVER_CATEGORIES),
  destination: z.string().nullable(),
  audience: z.object({
    type: z.enum(AUDIENCE_TYPES),
    userIds: z.array(z.string()),
    filter: z.object({
      primaryGoal: z.array(z.string()).optional(),
      experienceLevel: z.array(z.string()).optional(),
      onboardingCompleted: z.boolean().optional(),
    }),
  }),
  status: z.enum(CAMPAIGN_STATUSES),
  scheduledAt: z.iso.datetime().nullable(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  targetCount: z.number().int(),
  skippedCount: z.number().int(),
  lastError: z.string().nullable(),
  deliveries: deliveryCountsSchema.nullable(),
  version: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const campaignListSchema = z.array(campaignViewSchema);

export const previewSchema = z.object({
  audience: z.object({
    matchedUsers: z.number().int(),
    eligibleUsers: z.number().int(),
    pushableUsers: z.number().int(),
    pushableDevices: z.number().int(),
  }),
  requiresConfirmation: z.boolean(),
  pushAvailable: z.boolean(),
  push: z.object({
    title: z.string(),
    body: z.string(),
    category: z.enum(SERVER_CATEGORIES),
    destination: z.string().nullable(),
  }),
});

export const deliveryRecordSchema = z.object({
  id: z.uuid(),
  notificationId: z.uuid(),
  userId: z.uuid(),
  userEmail: z.string().nullable(),
  deviceId: z.uuid().nullable(),
  status: z.enum(DELIVERY_STATUSES),
  attempts: z.number().int(),
  errorCode: z.string().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  receivedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const deliveryListSchema = z.array(deliveryRecordSchema);

export const dispatchSummarySchema = z.object({
  campaigns: z.number().int(),
  attempted: z.number().int(),
  accepted: z.number().int(),
  retried: z.number().int(),
  failed: z.number().int(),
  invalidTokens: z.number().int(),
});

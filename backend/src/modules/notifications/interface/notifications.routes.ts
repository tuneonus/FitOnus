import type { RequestHandler } from 'express';
import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { NotificationsController } from './notifications.controller.js';
import { requireDispatchSecret } from './notifications.controller.js';
import {
  campaignIdRequest,
  campaignListSchema,
  campaignViewSchema,
  createCampaignRequest,
  deliveryListSchema,
  deviceViewSchema,
  dispatchSummarySchema,
  idResultSchema,
  inboxPageSchema,
  listCampaignsRequest,
  listDeliveriesRequest,
  listInboxRequest,
  notificationIdRequest,
  preferencesSchema,
  previewCampaignRequest,
  previewSchema,
  removeDeviceRequest,
  removedSchema,
  sendCampaignRequest,
  unreadCountSchema,
  updatedCountSchema,
  updateCampaignRequest,
  updatePreferencesRequest,
  upsertDeviceRequest,
} from './notifications.schemas.js';

export interface NotificationRateLimiters {
  /** Reads and small writes from the signed-in app. */
  notificationsMember: RequestHandler;
  /** Device registration is hit on every launch/token refresh; capped tighter than the inbox. */
  notificationDevices: RequestHandler;
  /** Creating, sending and cancelling campaigns. */
  notificationsAdmin: RequestHandler;
  sensitive: RequestHandler;
}

const memberTags = ['Notifications'];
const adminTags = ['Admin Notifications'];

export function createNotificationsMemberRoutes(
  basePath: string,
  controller: NotificationsController,
  limiters: NotificationRateLimiters,
): RouteGroup {
  const member = limiters.notificationsMember;
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'get',
        path: '/',
        summary: 'List my notifications',
        description: "The signed-in user's inbox, newest first, with the unread total.",
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        request: listInboxRequest,
        response: {
          status: 200,
          description: 'Inbox page',
          message: 'Notifications retrieved',
          schema: inboxPageSchema,
          paginated: true,
        },
        handler: controller.listInbox,
      }),
      defineRoute({
        method: 'get',
        path: '/unread-count',
        summary: 'Count my unread notifications',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        response: {
          status: 200,
          description: 'Unread count',
          message: 'Unread count retrieved',
          schema: unreadCountSchema,
        },
        handler: controller.unreadCount,
      }),
      defineRoute({
        method: 'post',
        path: '/read-all',
        summary: 'Mark all my notifications as read',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        response: {
          status: 200,
          description: 'Rows updated',
          message: 'Notifications marked as read',
          schema: updatedCountSchema,
        },
        handler: controller.markAllRead,
      }),
      defineRoute({
        method: 'get',
        path: '/preferences',
        summary: 'Get my notification preferences',
        description:
          'Master push switch plus per-category toggles. Reminder categories are honoured on the device only.',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        response: {
          status: 200,
          description: 'Preferences',
          message: 'Notification preferences retrieved',
          schema: preferencesSchema,
        },
        handler: controller.getPreferences,
      }),
      defineRoute({
        method: 'put',
        path: '/preferences',
        summary: 'Update my notification preferences',
        description: 'Partial update: omitted categories keep their current value.',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        request: updatePreferencesRequest,
        response: {
          status: 200,
          description: 'Updated preferences',
          message: 'Notification preferences updated',
          schema: preferencesSchema,
        },
        errorStatuses: [400],
        handler: controller.updatePreferences,
      }),
      defineRoute({
        method: 'get',
        path: '/devices',
        summary: 'List my registered push devices',
        description: 'Push tokens are never returned.',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        response: {
          status: 200,
          description: 'Devices',
          message: 'Devices retrieved',
          schema: z.array(deviceViewSchema),
        },
        handler: controller.listDevices,
      }),
      defineRoute({
        method: 'put',
        path: '/devices/:installationId',
        summary: 'Register or refresh a push device',
        description:
          'Idempotent upsert keyed by (user, installation). A rotated token replaces the old one; a token already held by ' +
          'another account on the same phone moves to the caller.',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [limiters.notificationDevices],
        request: upsertDeviceRequest,
        response: {
          status: 200,
          description: 'Registered device',
          message: 'Device registered',
          schema: deviceViewSchema,
        },
        errorStatuses: [400, 409],
        handler: controller.upsertDevice,
      }),
      defineRoute({
        method: 'delete',
        path: '/devices/:installationId',
        summary: 'Remove one of my push devices',
        description: 'Used on sign-out. Removing a device that is already gone still succeeds.',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [limiters.notificationDevices],
        request: removeDeviceRequest,
        response: {
          status: 200,
          description: 'Removal result',
          message: 'Device removed',
          schema: removedSchema,
        },
        handler: controller.removeDevice,
      }),
      defineRoute({
        method: 'post',
        path: '/:id/read',
        summary: 'Mark one of my notifications as read',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        request: notificationIdRequest,
        response: {
          status: 200,
          description: 'Marked',
          message: 'Notification marked as read',
          schema: idResultSchema,
        },
        errorStatuses: [404],
        handler: controller.markRead,
      }),
      defineRoute({
        method: 'post',
        path: '/:id/received',
        summary: 'Confirm a push reached this device',
        description: 'Moves the delivery from "accepted by FCM" to "received". Only the owner can confirm.',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        request: notificationIdRequest,
        response: {
          status: 200,
          description: 'Recorded',
          message: 'Receipt recorded',
          schema: idResultSchema,
        },
        errorStatuses: [404],
        handler: controller.confirmReceived,
      }),
      defineRoute({
        method: 'delete',
        path: '/:id',
        summary: 'Delete one of my notifications',
        tags: memberTags,
        access: { kind: 'authenticated' },
        middleware: [member],
        request: notificationIdRequest,
        response: {
          status: 200,
          description: 'Deleted',
          message: 'Notification deleted',
          schema: idResultSchema,
        },
        errorStatuses: [404],
        handler: controller.deleteNotification,
      }),
    ],
  };
}

export function createNotificationsAdminRoutes(
  basePath: string,
  controller: NotificationsController,
  limiters: NotificationRateLimiters,
): RouteGroup {
  const admin = limiters.notificationsAdmin;
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'get',
        path: '/',
        summary: 'Admin list notification campaigns',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:read' },
        request: listCampaignsRequest,
        response: {
          status: 200,
          description: 'Campaigns',
          message: 'Notifications retrieved',
          schema: campaignListSchema,
          paginated: true,
        },
        handler: controller.listCampaigns,
      }),
      defineRoute({
        method: 'post',
        path: '/',
        summary: 'Admin create a notification (draft, send now or schedule)',
        description:
          'Sending to everyone, to a segment, or to more than 25 users requires confirmBulk=true. Supports the ' +
          'Idempotency-Key header so a retried request never queues a second campaign.',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:send' },
        middleware: [admin],
        request: createCampaignRequest,
        response: {
          status: 201,
          description: 'Created campaign',
          message: 'Notification queued',
          schema: campaignViewSchema,
        },
        errorStatuses: [400, 409, 422, 503],
        handler: controller.createCampaign,
      }),
      defineRoute({
        method: 'post',
        path: '/preview',
        summary: 'Admin preview audience size and push content',
        description:
          'Counts who would receive the notification right now, without sending or saving anything.',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:read' },
        middleware: [admin],
        request: previewCampaignRequest,
        response: {
          status: 200,
          description: 'Preview',
          message: 'Notification preview generated',
          schema: previewSchema,
        },
        handler: controller.previewCampaign,
      }),
      defineRoute({
        method: 'get',
        path: '/:id',
        summary: 'Admin get a campaign with delivery totals',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:read' },
        request: campaignIdRequest,
        response: {
          status: 200,
          description: 'Campaign',
          message: 'Notification retrieved',
          schema: campaignViewSchema,
        },
        errorStatuses: [404],
        handler: controller.getCampaign,
      }),
      defineRoute({
        method: 'patch',
        path: '/:id',
        summary: 'Admin edit a draft',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:send' },
        middleware: [admin],
        request: updateCampaignRequest,
        response: {
          status: 200,
          description: 'Updated draft',
          message: 'Notification draft updated',
          schema: campaignViewSchema,
        },
        errorStatuses: [400, 404, 409],
        handler: controller.updateCampaign,
      }),
      defineRoute({
        method: 'post',
        path: '/:id/send',
        summary: 'Admin send or schedule a draft',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:send' },
        middleware: [admin],
        request: sendCampaignRequest,
        response: {
          status: 200,
          description: 'Queued campaign',
          message: 'Notification queued',
          schema: campaignViewSchema,
        },
        errorStatuses: [400, 404, 409, 422, 503],
        handler: controller.sendCampaign,
      }),
      defineRoute({
        method: 'post',
        path: '/:id/cancel',
        summary: 'Admin cancel a draft or scheduled notification',
        description: 'Once a campaign has started sending it can no longer be cancelled.',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:send' },
        middleware: [admin],
        request: campaignIdRequest,
        response: {
          status: 200,
          description: 'Cancelled campaign',
          message: 'Notification cancelled',
          schema: campaignViewSchema,
        },
        errorStatuses: [404, 409],
        handler: controller.cancelCampaign,
      }),
      defineRoute({
        method: 'get',
        path: '/:id/deliveries',
        summary: 'Admin list per-device deliveries of a campaign',
        description:
          'Includes failure codes and attempt counts. "accepted" means FCM took the message, not that it arrived.',
        tags: adminTags,
        access: { kind: 'permission', permission: 'notifications:read' },
        request: listDeliveriesRequest,
        response: {
          status: 200,
          description: 'Deliveries',
          message: 'Deliveries retrieved',
          schema: deliveryListSchema,
          paginated: true,
        },
        errorStatuses: [404],
        handler: controller.listDeliveries,
      }),
    ],
  };
}

/** Optional trigger for an external scheduler (e.g. a Render cron job) when the web process may be asleep. */
export function createNotificationsInternalRoutes(
  basePath: string,
  dispatch: () => Promise<z.infer<typeof dispatchSummarySchema>>,
  options: { secret: string | undefined; limiter: RequestHandler },
): RouteGroup {
  return {
    basePath,
    routes: [
      defineRoute({
        method: 'post',
        path: '/dispatch',
        summary: 'Run one notification dispatch pass',
        description:
          'Machine-to-machine. Requires the X-Dispatch-Secret header; answers 404 when it is wrong or unset.',
        tags: ['Internal'],
        access: { kind: 'public' },
        middleware: [options.limiter, requireDispatchSecret(options.secret)],
        response: {
          status: 200,
          description: 'Run summary',
          message: 'Dispatch run finished',
          schema: dispatchSummarySchema,
        },
        errorStatuses: [404],
        handler: async () => ({ data: await dispatch(), message: 'Dispatch run finished' }),
      }),
    ],
  };
}

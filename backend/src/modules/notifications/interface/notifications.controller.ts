import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { CampaignView } from '../application/views.js';
import type {
  DeviceView,
  DeliveryRecord,
  InboxNotificationView,
  NotificationPreferencesView,
  AudiencePreview,
} from '../application/ports.js';
import type { DispatchSummary } from '../application/services/notification-dispatcher.js';
import type {
  CancelCampaignUseCase,
  CreateCampaignUseCase,
  GetCampaignUseCase,
  ListCampaignsUseCase,
  ListDeliveriesUseCase,
  PreviewCampaignUseCase,
  SendCampaignUseCase,
  UpdateCampaignUseCase,
} from '../application/use-cases/campaigns.js';
import type {
  ConfirmReceivedUseCase,
  DeleteNotificationUseCase,
  GetPreferencesUseCase,
  GetUnreadCountUseCase,
  ListDevicesUseCase,
  ListInboxUseCase,
  MarkAllReadUseCase,
  MarkNotificationReadUseCase,
  RegisterDeviceUseCase,
  RemoveDeviceUseCase,
  UpdatePreferencesUseCase,
} from '../application/use-cases/member-notifications.js';
import type { ServerCategory } from '../domain/notification-policy.js';
import {
  campaignIdRequest,
  createCampaignRequest,
  listCampaignsRequest,
  listDeliveriesRequest,
  listInboxRequest,
  notificationIdRequest,
  previewCampaignRequest,
  removeDeviceRequest,
  sendCampaignRequest,
  updateCampaignRequest,
  updatePreferencesRequest,
  upsertDeviceRequest,
} from './notifications.schemas.js';

export interface NotificationsUseCases {
  registerDevice: RegisterDeviceUseCase;
  removeDevice: RemoveDeviceUseCase;
  listDevices: ListDevicesUseCase;
  getPreferences: GetPreferencesUseCase;
  updatePreferences: UpdatePreferencesUseCase;
  listInbox: ListInboxUseCase;
  getUnreadCount: GetUnreadCountUseCase;
  markRead: MarkNotificationReadUseCase;
  markAllRead: MarkAllReadUseCase;
  deleteNotification: DeleteNotificationUseCase;
  confirmReceived: ConfirmReceivedUseCase;
  createCampaign: CreateCampaignUseCase;
  updateCampaign: UpdateCampaignUseCase;
  sendCampaign: SendCampaignUseCase;
  cancelCampaign: CancelCampaignUseCase;
  previewCampaign: PreviewCampaignUseCase;
  getCampaign: GetCampaignUseCase;
  listCampaigns: ListCampaignsUseCase;
  listDeliveries: ListDeliveriesUseCase;
}

const clientMeta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });

export type NotificationsController = ReturnType<typeof createNotificationsController>;

export function createNotificationsController(useCases: NotificationsUseCases) {
  return {
    // ------------------------------------------------------------ member
    upsertDevice: async (req: Request): Promise<RouteResult<DeviceView>> => {
      const { params, body } = getValidated(req, upsertDeviceRequest);
      if (params.installationId !== body.installationId) {
        throw new AppError('validation', 'VALIDATION_FAILED', 'The request is invalid.', [
          { location: 'body', path: 'installationId', message: 'Must match the installation id in the URL.' },
        ]);
      }
      const data = await useCases.registerDevice.execute(requireActor(req), {
        installationId: body.installationId,
        pushToken: body.pushToken,
        platform: body.platform,
        appVersion: body.appVersion,
        timezone: body.timeZone,
      });
      return { data, message: 'Device registered' };
    },

    removeDevice: async (req: Request): Promise<RouteResult<{ removed: boolean }>> => {
      const { params } = getValidated(req, removeDeviceRequest);
      return {
        data: await useCases.removeDevice.execute(requireActor(req), params.installationId),
        message: 'Device removed',
      };
    },

    listDevices: async (req: Request): Promise<RouteResult<DeviceView[]>> => ({
      data: await useCases.listDevices.execute(requireActor(req)),
      message: 'Devices retrieved',
    }),

    getPreferences: async (req: Request): Promise<RouteResult<NotificationPreferencesView>> => ({
      data: await useCases.getPreferences.execute(requireActor(req)),
      message: 'Notification preferences retrieved',
    }),

    updatePreferences: async (req: Request): Promise<RouteResult<NotificationPreferencesView>> => {
      const { body } = getValidated(req, updatePreferencesRequest);
      const patch: Parameters<UpdatePreferencesUseCase['execute']>[1] = {};
      if (body.pushEnabled !== undefined) patch.pushEnabled = body.pushEnabled;
      if (body.categories) {
        patch.categories = Object.fromEntries(
          Object.entries(body.categories).filter(([, value]) => value !== undefined),
        );
      }
      return {
        data: await useCases.updatePreferences.execute(requireActor(req), patch),
        message: 'Notification preferences updated',
      };
    },

    listInbox: async (
      req: Request,
    ): Promise<RouteResult<{ items: InboxNotificationView[]; unreadCount: number }>> => {
      const { query } = getValidated(req, listInboxRequest);
      const { items, unreadCount, meta } = await useCases.listInbox.execute(requireActor(req), query);
      return { data: { items, unreadCount }, meta, message: 'Notifications retrieved' };
    },

    unreadCount: async (req: Request): Promise<RouteResult<{ unreadCount: number }>> => ({
      data: await useCases.getUnreadCount.execute(requireActor(req)),
      message: 'Unread count retrieved',
    }),

    markRead: async (req: Request): Promise<RouteResult<{ id: string }>> => {
      const { params } = getValidated(req, notificationIdRequest);
      return {
        data: await useCases.markRead.execute(requireActor(req), params.id),
        message: 'Notification marked as read',
      };
    },

    markAllRead: async (req: Request): Promise<RouteResult<{ updated: number }>> => ({
      data: await useCases.markAllRead.execute(requireActor(req)),
      message: 'Notifications marked as read',
    }),

    deleteNotification: async (req: Request): Promise<RouteResult<{ id: string }>> => {
      const { params } = getValidated(req, notificationIdRequest);
      return {
        data: await useCases.deleteNotification.execute(requireActor(req), params.id),
        message: 'Notification deleted',
      };
    },

    confirmReceived: async (req: Request): Promise<RouteResult<{ id: string }>> => {
      const { params } = getValidated(req, notificationIdRequest);
      return {
        data: await useCases.confirmReceived.execute(requireActor(req), params.id),
        message: 'Receipt recorded',
      };
    },

    // ------------------------------------------------------------ admin
    listCampaigns: async (req: Request): Promise<RouteResult<CampaignView[]>> => {
      const { query } = getValidated(req, listCampaignsRequest);
      const { items, meta } = await useCases.listCampaigns.execute(requireActor(req), query);
      return { data: items, meta, message: 'Notifications retrieved' };
    },

    getCampaign: async (req: Request): Promise<RouteResult<CampaignView>> => {
      const { params } = getValidated(req, campaignIdRequest);
      return {
        data: await useCases.getCampaign.execute(requireActor(req), params.id),
        message: 'Notification retrieved',
      };
    },

    createCampaign: async (req: Request): Promise<RouteResult<CampaignView>> => {
      const { body, headers } = getValidated(req, createCampaignRequest);
      const result = await useCases.createCampaign.execute(
        requireActor(req),
        body,
        clientMeta(req),
        headers['idempotency-key'],
      );
      return {
        data: result.value,
        message: body.mode === 'draft' ? 'Notification draft saved' : 'Notification queued',
        ...(result.replayed ? { headers: { 'Idempotent-Replayed': 'true' } } : {}),
      };
    },

    updateCampaign: async (req: Request): Promise<RouteResult<CampaignView>> => {
      const { params, body } = getValidated(req, updateCampaignRequest);
      return {
        data: await useCases.updateCampaign.execute(requireActor(req), params.id, body, clientMeta(req)),
        message: 'Notification draft updated',
      };
    },

    sendCampaign: async (req: Request): Promise<RouteResult<CampaignView>> => {
      const { params, body, headers } = getValidated(req, sendCampaignRequest);
      const result = await useCases.sendCampaign.execute(
        requireActor(req),
        params.id,
        body,
        clientMeta(req),
        headers['idempotency-key'],
      );
      return {
        data: result.value,
        message: 'Notification queued',
        ...(result.replayed ? { headers: { 'Idempotent-Replayed': 'true' } } : {}),
      };
    },

    cancelCampaign: async (req: Request): Promise<RouteResult<CampaignView>> => {
      const { params } = getValidated(req, campaignIdRequest);
      return {
        data: await useCases.cancelCampaign.execute(requireActor(req), params.id, clientMeta(req)),
        message: 'Notification cancelled',
      };
    },

    previewCampaign: async (
      req: Request,
    ): Promise<
      RouteResult<{
        audience: AudiencePreview;
        requiresConfirmation: boolean;
        pushAvailable: boolean;
        push: { title: string; body: string; category: ServerCategory; destination: string | null };
      }>
    > => {
      const { body } = getValidated(req, previewCampaignRequest);
      return {
        data: await useCases.previewCampaign.execute(requireActor(req), body),
        message: 'Notification preview generated',
      };
    },

    listDeliveries: async (req: Request): Promise<RouteResult<DeliveryRecord[]>> => {
      const { params, query } = getValidated(req, listDeliveriesRequest);
      const { items, meta } = await useCases.listDeliveries.execute(requireActor(req), params.id, query);
      return { data: items, meta, message: 'Deliveries retrieved' };
    },
  };
}

/**
 * Guard for the machine-to-machine dispatch trigger (external cron). The shared secret is compared in constant
 * time. When no secret is configured the route does not exist as far as callers can tell.
 */
export function requireDispatchSecret(secret: string | undefined): RequestHandler {
  return (req, _res, next) => {
    const provided = req.get('x-dispatch-secret') ?? '';
    const expected = secret ?? '';
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    // Length is not secret here (it is the format of the env var), but the content comparison must not leak.
    const ok = expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      next(new AppError('not_found', 'ROUTE_NOT_FOUND', 'Route not found.'));
      return;
    }
    next();
  };
}

export type { DispatchSummary };

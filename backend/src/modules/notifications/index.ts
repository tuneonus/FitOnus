import type { SqlExecutor } from '../../database/transaction.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.js';
import {
  DEFAULT_DISPATCHER_OPTIONS,
  NotificationDispatcher,
  type DispatcherLogger,
  type DispatcherOptions,
} from './application/services/notification-dispatcher.js';
import {
  CancelCampaignUseCase,
  CreateCampaignUseCase,
  GetCampaignUseCase,
  ListCampaignsUseCase,
  ListDeliveriesUseCase,
  PreviewCampaignUseCase,
  SendCampaignUseCase,
  UpdateCampaignUseCase,
} from './application/use-cases/campaigns.js';
import {
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
} from './application/use-cases/member-notifications.js';
import type { AdminAuditPort, PushSender } from './application/ports.js';
import { DEFAULT_RETRY_POLICY } from './domain/notification-policy.js';
import { PgCampaignRepository, PgDispatchRepository } from './infrastructure/pg-campaign-repository.js';
import {
  PgDeviceRepository,
  PgInboxRepository,
  PgPreferenceRepository,
} from './infrastructure/pg-member-repositories.js';
import { createNotificationsController } from './interface/notifications.controller.js';
import {
  createNotificationsAdminRoutes,
  createNotificationsInternalRoutes,
  createNotificationsMemberRoutes,
  type NotificationRateLimiters,
} from './interface/notifications.routes.js';

export { FcmHttpV1Sender, classifyFcmError } from './infrastructure/fcm-push-sender.js';
export type { PushMessage, PushSender, PushSendResult } from './application/ports.js';
export { NotificationDispatcher } from './application/services/notification-dispatcher.js';

export interface NotificationsModule {
  memberRoutes: RouteGroup;
  adminRoutes: RouteGroup;
  internalRoutes: RouteGroup;
  /** Null when push delivery is not configured. */
  dispatcher: NotificationDispatcher | null;
}

export interface NotificationsModuleDeps {
  memberBasePath: string;
  adminBasePath: string;
  internalBasePath: string;
  db: SqlExecutor;
  uow: UnitOfWork;
  idempotency: IdempotencyService;
  auditLogger: AdminAuditPort;
  limiters: NotificationRateLimiters;
  /** Null disables sending (the inbox, preferences and device registration keep working). */
  sender: PushSender | null;
  dispatchSecret?: string | undefined;
  dispatcher?: { maxAttempts?: number; pollIntervalMs?: number } & Partial<DispatcherOptions>;
  logger?: DispatcherLogger | undefined;
}

export function createNotificationsModule(deps: NotificationsModuleDeps): NotificationsModule {
  const devices = new PgDeviceRepository(deps.db);
  const preferences = new PgPreferenceRepository(deps.db);
  const inbox = new PgInboxRepository(deps.db);
  const campaigns = new PgCampaignRepository(deps.db);
  const dispatchRepo = new PgDispatchRepository(deps.db, deps.uow);

  const options: DispatcherOptions = {
    ...DEFAULT_DISPATCHER_OPTIONS,
    ...deps.dispatcher,
    retry: {
      ...DEFAULT_RETRY_POLICY,
      maxAttempts: deps.dispatcher?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
    },
  };
  const dispatcher = deps.sender
    ? new NotificationDispatcher(
        { repo: dispatchRepo, sender: deps.sender, ...(deps.logger ? { logger: deps.logger } : {}) },
        options,
      )
    : null;

  const campaignDeps = {
    campaigns,
    audit: deps.auditLogger,
    uow: deps.uow,
    idempotency: deps.idempotency,
    isPushAvailable: () => deps.sender !== null,
    onLaunched: () => dispatcher?.kick(),
  };

  const controller = createNotificationsController({
    registerDevice: new RegisterDeviceUseCase({ devices, uow: deps.uow }),
    removeDevice: new RemoveDeviceUseCase({ devices }),
    listDevices: new ListDevicesUseCase({ devices }),
    getPreferences: new GetPreferencesUseCase({ preferences }),
    updatePreferences: new UpdatePreferencesUseCase({ preferences }),
    listInbox: new ListInboxUseCase({ inbox }),
    getUnreadCount: new GetUnreadCountUseCase({ inbox }),
    markRead: new MarkNotificationReadUseCase({ inbox }),
    markAllRead: new MarkAllReadUseCase({ inbox }),
    deleteNotification: new DeleteNotificationUseCase({ inbox }),
    confirmReceived: new ConfirmReceivedUseCase({ inbox }),
    createCampaign: new CreateCampaignUseCase(campaignDeps),
    updateCampaign: new UpdateCampaignUseCase(campaignDeps),
    sendCampaign: new SendCampaignUseCase(campaignDeps),
    cancelCampaign: new CancelCampaignUseCase(campaignDeps),
    previewCampaign: new PreviewCampaignUseCase(campaignDeps),
    getCampaign: new GetCampaignUseCase(campaignDeps),
    listCampaigns: new ListCampaignsUseCase(campaignDeps),
    listDeliveries: new ListDeliveriesUseCase(campaignDeps),
  });

  return {
    memberRoutes: createNotificationsMemberRoutes(deps.memberBasePath, controller, deps.limiters),
    adminRoutes: createNotificationsAdminRoutes(deps.adminBasePath, controller, deps.limiters),
    internalRoutes: createNotificationsInternalRoutes(
      deps.internalBasePath,
      async () =>
        dispatcher
          ? dispatcher.runOnce()
          : { campaigns: 0, attempted: 0, accepted: 0, retried: 0, failed: 0, invalidTokens: 0 },
      { secret: deps.dispatchSecret, limiter: deps.limiters.sensitive },
    ),
    dispatcher,
  };
}

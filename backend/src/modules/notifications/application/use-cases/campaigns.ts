import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { AppError, notFound } from '../../../../shared/errors/app-error.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type {
  CompleteIdempotentWork,
  IdempotencyService,
  IdempotentResult,
} from '../../../../shared/idempotency/idempotency.js';
import {
  toPaginationMeta,
  type PageRequest,
  type PaginationMeta,
} from '../../../../shared/pagination/pagination.js';
import {
  isBulkAudience,
  MAX_SCHEDULE_HORIZON_MS,
  MIN_SCHEDULE_LEAD_MS,
  type Audience,
  type CampaignStatus,
  type DeliveryStatus,
  type ServerCategory,
} from '../../domain/notification-policy.js';
import { normalizeAudience } from '../../domain/audience.js';
import { NO_IMAGE_URLS, requiredObjectKeys } from '../../domain/notification-image.js';
import {
  assertImageObjectsExist,
  assertImageStorageConfigured,
} from '../../../../shared/images/public-image-check.js';
import type {
  AdminAuditPort,
  AudiencePreview,
  CampaignContent,
  CampaignRecord,
  CampaignRepository,
  DeliveryRecord,
  NotificationImages,
} from '../ports.js';
import type { DispatcherLogger } from '../services/notification-dispatcher.js';
import { toCampaignView, type CampaignView } from '../views.js';

export type LaunchMode = 'draft' | 'send_now' | 'schedule';

export interface CampaignInput {
  title: string;
  body: string;
  category: ServerCategory;
  destination: string | null;
  /** Key returned by the image upload endpoint. Omitted or null = a text-only notification. */
  imageKey?: string | null;
  audience: { type: Audience['type']; userIds?: string[]; filter?: Audience['filter'] };
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

interface Deps {
  campaigns: CampaignRepository;
  audit: AdminAuditPort;
  uow: UnitOfWork;
  idempotency: IdempotencyService;
  /** False when no push provider is configured: nothing may be queued that could never be sent. */
  isPushAvailable: () => boolean;
  /** Wakes the dispatcher so a "send now" does not wait for the next poll. */
  onLaunched: () => void;
  /** Image support. Omitted = images are off: any request carrying an image key is refused. */
  images?: NotificationImages;
  logger?: DispatcherLogger;
  now?: () => Date;
}

/** One place that turns a stored campaign into its API shape, so every response derives image URLs the same way. */
const present = (
  deps: Pick<Deps, 'images'>,
  campaign: CampaignRecord,
  deliveries: Parameters<typeof toCampaignView>[1] = null,
): CampaignView => toCampaignView(campaign, deliveries, deps.images?.resolveUrl ?? NO_IMAGE_URLS);

const toContent = (input: CampaignInput): CampaignContent => ({
  title: input.title.trim(),
  body: input.body.trim(),
  category: input.category,
  destination: input.destination,
  imageKey: input.imageKey ?? null,
  audience: normalizeAudience(input.audience),
});

/**
 * An image key is only meaningful when storage is configured and, once the notification is about to go out, when
 * the object is really there. Drafts skip the existence check: saving must stay cheap and the key came straight
 * from the upload endpoint. The key's shape is already pinned by the request schema (the canonical
 * `onusfit/notifications/<hex>.webp` or the legacy `notifications/<hex>.jpg|png`), so there is no way to reference
 * anything outside this system's own uploads.
 */
async function assertImageUsable(
  deps: Pick<Deps, 'images' | 'logger'>,
  key: string | null,
  verifyExists: boolean,
): Promise<void> {
  if (key === null) return;
  const storage = {
    store: deps.images?.store ?? null,
    resolveUrl: deps.images?.resolveUrl ?? NO_IMAGE_URLS,
    logger: deps.logger,
  };
  assertImageStorageConfigured(storage, key, 'a notification');
  if (!verifyExists) return;
  // Every object the notification needs, not just the one the key names: a canonical image is useless without the
  // JPEG that goes to FCM, so a pair that was only half written is refused here rather than sent without a picture.
  await assertImageObjectsExist(storage, requiredObjectKeys(key), 'notification');
}

function resolveSchedule(
  mode: Exclude<LaunchMode, 'draft'>,
  scheduledAt: Date | null | undefined,
  now: Date,
): Date {
  if (mode === 'send_now') return now;
  if (!scheduledAt) {
    throw new AppError('validation', 'VALIDATION_FAILED', 'A schedule time is required.', [
      { location: 'body', path: 'scheduledAt', message: 'Choose when to send.' },
    ]);
  }
  const delta = scheduledAt.getTime() - now.getTime();
  if (delta < MIN_SCHEDULE_LEAD_MS || delta > MAX_SCHEDULE_HORIZON_MS) {
    throw new AppError('validation', 'VALIDATION_FAILED', 'The schedule time is out of range.', [
      {
        location: 'body',
        path: 'scheduledAt',
        message: 'Schedule between 30 seconds and 90 days from now.',
      },
    ]);
  }
  return scheduledAt;
}

/** The checks every launch (send now or scheduled) must pass; drafts skip them. */
async function assertLaunchable(
  deps: Deps,
  content: CampaignContent,
  confirmBulk: boolean,
): Promise<AudiencePreview> {
  if (!deps.isPushAvailable()) {
    throw new AppError(
      'unavailable',
      'PUSH_NOT_CONFIGURED',
      'Push delivery is not configured on this server, so notifications cannot be sent.',
    );
  }
  const preview = await deps.campaigns.previewAudience(content.audience, content.category);
  if (isBulkAudience(content.audience) && !confirmBulk) {
    throw new AppError(
      'unprocessable',
      'BULK_CONFIRMATION_REQUIRED',
      'Sending to this audience requires explicit confirmation.',
      { eligibleUsers: preview.eligibleUsers, pushableDevices: preview.pushableDevices },
    );
  }
  if (preview.eligibleUsers === 0) {
    throw new AppError(
      'unprocessable',
      'NO_ELIGIBLE_RECIPIENTS',
      'No active users match this audience and their notification preferences.',
    );
  }
  // Last, because it is the only check that leaves this server: do not call out for a request that would fail anyway.
  await assertImageUsable(deps, content.imageKey, true);
  return preview;
}

export class CreateCampaignUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    actor: Actor,
    input: CampaignInput & { mode: LaunchMode; scheduledAt?: Date | null; confirmBulk?: boolean },
    meta: RequestMeta = {},
    idempotencyKey?: string,
  ): Promise<IdempotentResult<CampaignView>> {
    assertPermission(actor, 'notifications:send');
    const content = toContent(input);
    const now = (this.deps.now ?? (() => new Date()))();
    const scheduledAt = input.mode === 'draft' ? null : resolveSchedule(input.mode, input.scheduledAt, now);

    const create = async (complete?: CompleteIdempotentWork<CampaignView>): Promise<CampaignView> => {
      if (input.mode !== 'draft') await assertLaunchable(this.deps, content, input.confirmBulk === true);
      else await assertImageUsable(this.deps, content.imageKey, false);
      const view = await this.deps.uow.run(async () => {
        const campaign = await this.deps.campaigns.insert({
          ...content,
          createdBy: actor.userId,
          scheduledAt,
          status: input.mode === 'draft' ? 'draft' : 'scheduled',
        });
        await this.deps.audit.recordAuditLog({
          adminId: actor.userId,
          action: input.mode === 'draft' ? 'notification.create' : 'notification.schedule',
          details: {
            campaignId: campaign.id,
            mode: input.mode,
            category: content.category,
            audienceType: content.audience.type,
            audienceUsers: content.audience.userIds.length,
            hasImage: content.imageKey !== null,
            scheduledAt: scheduledAt?.toISOString() ?? null,
          },
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        });
        const created = present(this.deps, campaign);
        await complete?.(created);
        return created;
      });
      if (input.mode === 'send_now') this.deps.onLaunched();
      return view;
    };

    if (!idempotencyKey) return { value: await create(), replayed: false };
    // A text-only request fingerprints exactly as it did before images existed, so a retry that straddles a deploy
    // still replays instead of being refused as a reused key. The image takes part only when there is one.
    const { imageKey, ...textContent } = content;
    return this.deps.idempotency.execute(
      { scope: actor.userId, operation: 'notifications.campaign.create', key: idempotencyKey },
      {
        ...textContent,
        ...(imageKey ? { imageKey } : {}),
        mode: input.mode,
        scheduledAt: scheduledAt && input.mode === 'schedule' ? scheduledAt.toISOString() : null,
        confirmBulk: input.confirmBulk === true,
      },
      create,
    );
  }
}

export class UpdateCampaignUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    actor: Actor,
    id: string,
    input: CampaignInput & { version: number },
    meta: RequestMeta = {},
  ): Promise<CampaignView> {
    assertPermission(actor, 'notifications:send');
    const content = toContent(input);
    await assertImageUsable(this.deps, content.imageKey, false);
    const updated = await this.deps.campaigns.updateDraft(id, content, input.version);
    if (!updated) throw await this.explainRefusal(id, 'edited');
    await this.deps.audit.recordAuditLog({
      adminId: actor.userId,
      action: 'notification.update',
      details: {
        campaignId: id,
        category: content.category,
        audienceType: content.audience.type,
        hasImage: content.imageKey !== null,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return present(this.deps, updated);
  }

  private async explainRefusal(id: string, verb: string): Promise<AppError> {
    const existing = await this.deps.campaigns.findById(id);
    if (!existing) return notFound('NOT_FOUND', 'Notification not found.');
    if (existing.status !== 'draft') {
      return new AppError(
        'conflict',
        'INVALID_STATE_TRANSITION',
        `Only drafts can be ${verb}. This one is ${existing.status}.`,
      );
    }
    return new AppError(
      'conflict',
      'VERSION_CONFLICT',
      'This draft was changed by someone else. Reload and try again.',
    );
  }
}

export class SendCampaignUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    actor: Actor,
    id: string,
    input: { scheduledAt?: Date | null; confirmBulk?: boolean },
    meta: RequestMeta = {},
    idempotencyKey?: string,
  ): Promise<IdempotentResult<CampaignView>> {
    assertPermission(actor, 'notifications:send');
    const now = (this.deps.now ?? (() => new Date()))();
    const scheduledAt = resolveSchedule(input.scheduledAt ? 'schedule' : 'send_now', input.scheduledAt, now);

    const send = async (complete?: CompleteIdempotentWork<CampaignView>): Promise<CampaignView> => {
      const draft = await this.deps.campaigns.findById(id);
      if (!draft) throw notFound('NOT_FOUND', 'Notification not found.');
      if (draft.status !== 'draft') {
        throw new AppError(
          'conflict',
          'INVALID_STATE_TRANSITION',
          `Only drafts can be sent. This one is ${draft.status}.`,
        );
      }
      await assertLaunchable(this.deps, draft, input.confirmBulk === true);
      const view = await this.deps.uow.run(async () => {
        // The status flip is a single conditional UPDATE: of two simultaneous sends only one can win.
        const scheduled = await this.deps.campaigns.schedule(id, scheduledAt);
        if (!scheduled) {
          throw new AppError(
            'conflict',
            'INVALID_STATE_TRANSITION',
            'This notification was already sent or cancelled.',
          );
        }
        await this.deps.audit.recordAuditLog({
          adminId: actor.userId,
          action: 'notification.schedule',
          details: {
            campaignId: id,
            category: draft.category,
            audienceType: draft.audience.type,
            hasImage: draft.imageKey !== null,
            scheduledAt: scheduledAt.toISOString(),
          },
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        });
        const created = present(this.deps, scheduled);
        await complete?.(created);
        return created;
      });
      if (!input.scheduledAt) this.deps.onLaunched();
      return view;
    };

    if (!idempotencyKey) return { value: await send(), replayed: false };
    return this.deps.idempotency.execute(
      { scope: actor.userId, operation: `notifications.campaign.send.${id}`, key: idempotencyKey },
      { scheduledAt: input.scheduledAt?.toISOString() ?? null, confirmBulk: input.confirmBulk === true },
      send,
    );
  }
}

export class CancelCampaignUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, id: string, meta: RequestMeta = {}): Promise<CampaignView> {
    assertPermission(actor, 'notifications:send');
    const cancelled = await this.deps.campaigns.cancel(id, actor.userId);
    if (!cancelled) {
      const existing = await this.deps.campaigns.findById(id);
      if (!existing) throw notFound('NOT_FOUND', 'Notification not found.');
      throw new AppError(
        'conflict',
        'INVALID_STATE_TRANSITION',
        `Only drafts and scheduled notifications can be cancelled. This one is ${existing.status}.`,
      );
    }
    await this.deps.audit.recordAuditLog({
      adminId: actor.userId,
      action: 'notification.cancel',
      details: { campaignId: id, previouslyScheduledAt: cancelled.scheduledAt?.toISOString() ?? null },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return present(this.deps, cancelled);
  }
}

export class PreviewCampaignUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns' | 'isPushAvailable' | 'images' | 'logger'>) {}

  async execute(
    actor: Actor,
    input: CampaignInput,
  ): Promise<{
    audience: AudiencePreview;
    requiresConfirmation: boolean;
    pushAvailable: boolean;
    push: {
      title: string;
      body: string;
      category: ServerCategory;
      destination: string | null;
      imageUrl: string | null;
    };
  }> {
    assertPermission(actor, 'notifications:read');
    const content = toContent(input);
    // Fail here, on the review step, rather than after the admin has pressed Send.
    await assertImageUsable(this.deps, content.imageKey, true);
    const audience = await this.deps.campaigns.previewAudience(content.audience, content.category);
    return {
      audience,
      requiresConfirmation: isBulkAudience(content.audience),
      pushAvailable: this.deps.isPushAvailable(),
      push: {
        title: content.title,
        body: content.body,
        category: content.category,
        destination: content.destination,
        // The preview shows what the phone will receive (the push JPEG), not the stored WebP.
        imageUrl: (this.deps.images?.resolvePushUrl ?? NO_IMAGE_URLS)(content.imageKey),
      },
    };
  }
}

export class GetCampaignUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns' | 'images'>) {}

  async execute(actor: Actor, id: string): Promise<CampaignView> {
    assertPermission(actor, 'notifications:read');
    const campaign = await this.deps.campaigns.findById(id);
    if (!campaign) throw notFound('NOT_FOUND', 'Notification not found.');
    return present(this.deps, campaign, await this.deps.campaigns.deliveryCounts(id));
  }
}

export class ListCampaignsUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns' | 'images'>) {}

  async execute(
    actor: Actor,
    query: PageRequest & { status?: CampaignStatus },
  ): Promise<{ items: CampaignView[]; meta: PaginationMeta }> {
    assertPermission(actor, 'notifications:read');
    const page = await this.deps.campaigns.list(query);
    return {
      items: page.items.map((campaign) => present(this.deps, campaign)),
      meta: toPaginationMeta(query, page.total),
    };
  }
}

export class ListDeliveriesUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns'>) {}

  async execute(
    actor: Actor,
    id: string,
    query: PageRequest & { status?: DeliveryStatus },
  ): Promise<{ items: DeliveryRecord[]; meta: PaginationMeta }> {
    assertPermission(actor, 'notifications:read');
    if (!(await this.deps.campaigns.findById(id))) throw notFound('NOT_FOUND', 'Notification not found.');
    const page = await this.deps.campaigns.listDeliveries(id, query);
    return { items: page.items, meta: toPaginationMeta(query, page.total) };
  }
}

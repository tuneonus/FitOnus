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
import type {
  AdminAuditPort,
  AudiencePreview,
  CampaignContent,
  CampaignRepository,
  DeliveryRecord,
} from '../ports.js';
import { toCampaignView, type CampaignView } from '../views.js';

export type LaunchMode = 'draft' | 'send_now' | 'schedule';

export interface CampaignInput {
  title: string;
  body: string;
  category: ServerCategory;
  destination: string | null;
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
  now?: () => Date;
}

const toContent = (input: CampaignInput): CampaignContent => ({
  title: input.title.trim(),
  body: input.body.trim(),
  category: input.category,
  destination: input.destination,
  audience: normalizeAudience(input.audience),
});

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
            scheduledAt: scheduledAt?.toISOString() ?? null,
          },
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        });
        const created = toCampaignView(campaign);
        await complete?.(created);
        return created;
      });
      if (input.mode === 'send_now') this.deps.onLaunched();
      return view;
    };

    if (!idempotencyKey) return { value: await create(), replayed: false };
    return this.deps.idempotency.execute(
      { scope: actor.userId, operation: 'notifications.campaign.create', key: idempotencyKey },
      {
        ...content,
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
    const updated = await this.deps.campaigns.updateDraft(id, content, input.version);
    if (!updated) throw await this.explainRefusal(id, 'edited');
    await this.deps.audit.recordAuditLog({
      adminId: actor.userId,
      action: 'notification.update',
      details: { campaignId: id, category: content.category, audienceType: content.audience.type },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return toCampaignView(updated);
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
            scheduledAt: scheduledAt.toISOString(),
          },
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        });
        const created = toCampaignView(scheduled);
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
    return toCampaignView(cancelled);
  }
}

export class PreviewCampaignUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns' | 'isPushAvailable'>) {}

  async execute(
    actor: Actor,
    input: CampaignInput,
  ): Promise<{
    audience: AudiencePreview;
    requiresConfirmation: boolean;
    pushAvailable: boolean;
    push: { title: string; body: string; category: ServerCategory; destination: string | null };
  }> {
    assertPermission(actor, 'notifications:read');
    const content = toContent(input);
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
      },
    };
  }
}

export class GetCampaignUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns'>) {}

  async execute(actor: Actor, id: string): Promise<CampaignView> {
    assertPermission(actor, 'notifications:read');
    const campaign = await this.deps.campaigns.findById(id);
    if (!campaign) throw notFound('NOT_FOUND', 'Notification not found.');
    return toCampaignView(campaign, await this.deps.campaigns.deliveryCounts(id));
  }
}

export class ListCampaignsUseCase {
  constructor(private readonly deps: Pick<Deps, 'campaigns'>) {}

  async execute(
    actor: Actor,
    query: PageRequest & { status?: CampaignStatus },
  ): Promise<{ items: CampaignView[]; meta: PaginationMeta }> {
    assertPermission(actor, 'notifications:read');
    const page = await this.deps.campaigns.list(query);
    return {
      items: page.items.map((campaign) => toCampaignView(campaign)),
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

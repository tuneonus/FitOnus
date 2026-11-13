import type { Actor } from '../../../../shared/auth/actor.js';
import { notFound } from '../../../../shared/errors/app-error.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import {
  toPaginationMeta,
  type PageRequest,
  type PaginationMeta,
} from '../../../../shared/pagination/pagination.js';
import type { PreferenceCategory } from '../../domain/notification-policy.js';
import type {
  DeviceInput,
  DeviceRepository,
  DeviceView,
  InboxNotificationView,
  InboxRepository,
  NotificationPreferencesView,
  PreferenceRepository,
} from '../ports.js';

// Every use case below takes the user id from the authenticated actor, never from the request,
// so one account cannot read or change another account's devices, preferences or inbox.

export class RegisterDeviceUseCase {
  constructor(private readonly deps: { devices: DeviceRepository; uow: UnitOfWork }) {}

  execute(actor: Actor, input: DeviceInput): Promise<DeviceView> {
    // Evicting a previous holder of the token and storing the new row must succeed or fail together.
    return this.deps.uow.run(() => this.deps.devices.upsert(actor.userId, input));
  }
}

export class RemoveDeviceUseCase {
  constructor(private readonly deps: { devices: DeviceRepository }) {}

  /** Idempotent: removing a device that is already gone (or is not yours) answers the same way. */
  async execute(actor: Actor, installationId: string): Promise<{ removed: boolean }> {
    return { removed: await this.deps.devices.remove(actor.userId, installationId) };
  }
}

export class ListDevicesUseCase {
  constructor(private readonly deps: { devices: DeviceRepository }) {}

  execute(actor: Actor): Promise<DeviceView[]> {
    return this.deps.devices.list(actor.userId);
  }
}

export class GetPreferencesUseCase {
  constructor(private readonly deps: { preferences: PreferenceRepository }) {}

  execute(actor: Actor): Promise<NotificationPreferencesView> {
    return this.deps.preferences.get(actor.userId);
  }
}

export class UpdatePreferencesUseCase {
  constructor(private readonly deps: { preferences: PreferenceRepository }) {}

  execute(
    actor: Actor,
    patch: { pushEnabled?: boolean; categories?: Partial<Record<PreferenceCategory, boolean>> },
  ): Promise<NotificationPreferencesView> {
    return this.deps.preferences.update(actor.userId, patch);
  }
}

export interface InboxPage {
  items: InboxNotificationView[];
  unreadCount: number;
  meta: PaginationMeta;
}

export class ListInboxUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(actor: Actor, query: PageRequest & { unreadOnly: boolean }): Promise<InboxPage> {
    const [page, unreadCount] = await Promise.all([
      this.deps.inbox.list(actor.userId, query),
      this.deps.inbox.unreadCount(actor.userId),
    ]);
    return { items: page.items, unreadCount, meta: toPaginationMeta(query, page.total) };
  }
}

export class GetUnreadCountUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(actor: Actor): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.deps.inbox.unreadCount(actor.userId) };
  }
}

const NOT_FOUND = () => notFound('NOT_FOUND', 'Notification not found.');

export class MarkNotificationReadUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(actor: Actor, id: string): Promise<{ id: string }> {
    // Someone else's notification is indistinguishable from a missing one.
    if (!(await this.deps.inbox.markRead(actor.userId, id))) throw NOT_FOUND();
    return { id };
  }
}

export class MarkAllReadUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(actor: Actor): Promise<{ updated: number }> {
    return { updated: await this.deps.inbox.markAllRead(actor.userId) };
  }
}

export class DeleteNotificationUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(actor: Actor, id: string): Promise<{ id: string }> {
    if (!(await this.deps.inbox.remove(actor.userId, id))) throw NOT_FOUND();
    return { id };
  }
}

export class ConfirmReceivedUseCase {
  constructor(private readonly deps: { inbox: InboxRepository }) {}

  async execute(actor: Actor, id: string): Promise<{ id: string }> {
    if (!(await this.deps.inbox.confirmReceived(actor.userId, id))) throw NOT_FOUND();
    return { id };
  }
}

import type { SqlExecutor } from '../../../database/transaction.js';
import { offsetOf, type Page } from '../../../shared/pagination/pagination.js';
import {
  PREFERENCE_CATEGORIES,
  type PreferenceCategory,
  type ServerCategory,
} from '../domain/notification-policy.js';
import type {
  DeviceInput,
  DeviceRepository,
  DeviceView,
  InboxNotificationView,
  InboxRepository,
  NotificationPreferencesView,
  PreferenceRepository,
} from '../application/ports.js';

interface DeviceRow {
  id: string;
  installation_id: string;
  platform: 'android' | 'ios';
  app_version: string | null;
  timezone: string | null;
  status: 'active' | 'invalid';
  last_registered_at: Date;
}

const toDeviceView = (row: DeviceRow): DeviceView => ({
  id: row.id,
  installationId: row.installation_id,
  platform: row.platform,
  appVersion: row.app_version,
  timezone: row.timezone,
  status: row.status,
  lastRegisteredAt: row.last_registered_at.toISOString(),
});

// Note: push_token is deliberately never selected back out for API responses.
const DEVICE_COLUMNS = 'id, installation_id, platform, app_version, timezone, status, last_registered_at';

export class PgDeviceRepository implements DeviceRepository {
  constructor(private readonly db: SqlExecutor) {}

  async upsert(userId: string, input: DeviceInput): Promise<DeviceView> {
    // A token identifies one physical app install. If another row (another account on the same phone, or an
    // older installation id) still holds it, that row is stale: drop it so the token has a single owner.
    await this.db.query(
      `DELETE FROM user_push_devices
        WHERE push_token = $3 AND NOT (user_id = $1 AND installation_id = $2)`,
      [userId, input.installationId, input.pushToken],
    );
    const { rows } = await this.db.query<DeviceRow>(
      `INSERT INTO user_push_devices (user_id, installation_id, push_token, platform, app_version, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, installation_id) DO UPDATE SET
         push_token = EXCLUDED.push_token,
         platform = EXCLUDED.platform,
         app_version = EXCLUDED.app_version,
         timezone = EXCLUDED.timezone,
         status = 'active',
         invalidated_reason = NULL,
         last_registered_at = now(),
         updated_at = now()
       RETURNING ${DEVICE_COLUMNS}`,
      [userId, input.installationId, input.pushToken, input.platform, input.appVersion, input.timezone],
    );
    return toDeviceView(rows[0]!);
  }

  async remove(userId: string, installationId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM user_push_devices WHERE user_id = $1 AND installation_id = $2',
      [userId, installationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async list(userId: string): Promise<DeviceView[]> {
    const { rows } = await this.db.query<DeviceRow>(
      `SELECT ${DEVICE_COLUMNS} FROM user_push_devices WHERE user_id = $1 ORDER BY last_registered_at DESC, id`,
      [userId],
    );
    return rows.map(toDeviceView);
  }
}

interface PreferenceRow {
  notifications_enabled: boolean | null;
  categories: Record<string, unknown> | null;
  updated_at: Date | null;
}

function toPreferencesView(row: PreferenceRow | undefined): NotificationPreferencesView {
  const stored = row?.categories ?? {};
  const categories = Object.fromEntries(
    PREFERENCE_CATEGORIES.map((key) => [key, stored[key] !== false]),
  ) as Record<PreferenceCategory, boolean>;
  return {
    pushEnabled: row?.notifications_enabled ?? true,
    categories,
    updatedAt: row?.updated_at?.toISOString() ?? null,
  };
}

export class PgPreferenceRepository implements PreferenceRepository {
  constructor(private readonly db: SqlExecutor) {}

  async get(userId: string): Promise<NotificationPreferencesView> {
    const { rows } = await this.db.query<PreferenceRow>(
      `SELECT s.notifications_enabled, p.categories, p.updated_at
         FROM users u
         LEFT JOIN user_settings s ON s.user_id = u.id
         LEFT JOIN notification_preferences p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    return toPreferencesView(rows[0]);
  }

  async update(
    userId: string,
    patch: { pushEnabled?: boolean; categories?: Partial<Record<PreferenceCategory, boolean>> },
  ): Promise<NotificationPreferencesView> {
    if (patch.categories && Object.keys(patch.categories).length > 0) {
      // jsonb concatenation merges keys, so a partial update never resets the other categories.
      await this.db.query(
        `INSERT INTO notification_preferences (user_id, categories) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET
           categories = notification_preferences.categories || EXCLUDED.categories,
           updated_at = now()`,
        [userId, JSON.stringify(patch.categories)],
      );
    }
    if (patch.pushEnabled !== undefined) {
      await this.db.query(
        `INSERT INTO user_settings (user_id, notifications_enabled) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET notifications_enabled = EXCLUDED.notifications_enabled, updated_at = now()`,
        [userId, patch.pushEnabled],
      );
    }
    return this.get(userId);
  }
}

interface InboxRow {
  id: string;
  category: ServerCategory;
  title: string;
  body: string;
  destination: string | null;
  read_at: Date | null;
  created_at: Date;
}

const toInboxView = (row: InboxRow): InboxNotificationView => ({
  id: row.id,
  category: row.category,
  title: row.title,
  body: row.body,
  destination: row.destination,
  read: row.read_at !== null,
  readAt: row.read_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export class PgInboxRepository implements InboxRepository {
  constructor(private readonly db: SqlExecutor) {}

  async list(
    userId: string,
    query: { page: number; limit: number; unreadOnly: boolean },
  ): Promise<Page<InboxNotificationView>> {
    const where = `user_id = $1 AND deleted_at IS NULL ${query.unreadOnly ? 'AND read_at IS NULL' : ''}`;
    const [items, total] = await Promise.all([
      this.db.query<InboxRow>(
        `SELECT id, category, title, body, destination, read_at, created_at
           FROM notifications WHERE ${where}
          ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [userId, query.limit, offsetOf(query)],
      ),
      this.db.query<{ count: number }>(`SELECT count(*)::int AS count FROM notifications WHERE ${where}`, [
        userId,
      ]),
    ]);
    return { items: items.rows.map(toInboxView), total: total.rows[0]?.count ?? 0 };
  }

  async unreadCount(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notifications
        WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`,
      [userId],
    );
    return rows[0]?.count ?? 0;
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    // Matching on user_id is the ownership check: someone else's id simply finds no row.
    const result = await this.db.query(
      `UPDATE notifications SET read_at = coalesce(read_at, now())
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );
    if ((result.rowCount ?? 0) > 0) await this.markDeliveriesReceived(userId, id);
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE notifications SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async confirmReceived(userId: string, id: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM notifications WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId],
    );
    if (rows.length === 0) return false;
    await this.markDeliveriesReceived(userId, id);
    return true;
  }

  /** Opening or acknowledging a notification proves it reached a device; upgrade 'accepted' to 'received'. */
  private async markDeliveriesReceived(userId: string, notificationId: string): Promise<void> {
    await this.db.query(
      `UPDATE notification_deliveries
          SET status = 'received', received_at = coalesce(received_at, now()), updated_at = now()
        WHERE notification_id = $1 AND user_id = $2 AND status = 'accepted'`,
      [notificationId, userId],
    );
  }
}

import type { SqlExecutor } from '../../../database/transaction.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { offsetOf, type Page } from '../../../shared/pagination/pagination.js';
import type {
  Audience,
  AudienceFilter,
  CampaignStatus,
  DeliveryCounts,
  DeliveryStatus,
  ServerCategory,
} from '../domain/notification-policy.js';
import type {
  AudiencePreview,
  CampaignContent,
  CampaignRecord,
  CampaignRepository,
  DeliveryJob,
  DeliveryOutcome,
  DeliveryRecord,
  DispatchRepository,
  FanOutResult,
} from '../application/ports.js';

interface CampaignRow {
  id: string;
  created_by: string | null;
  title: string;
  body: string;
  category: ServerCategory;
  destination: string | null;
  audience_type: Audience['type'];
  audience_user_ids: string[];
  audience_filter: AudienceFilter;
  status: CampaignStatus;
  scheduled_at: Date | null;
  started_at: Date | null;
  fanned_out_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  target_count: number;
  skipped_count: number;
  last_error: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const toCampaign = (row: CampaignRow): CampaignRecord => ({
  id: row.id,
  createdBy: row.created_by,
  title: row.title,
  body: row.body,
  category: row.category,
  destination: row.destination,
  audience: { type: row.audience_type, userIds: row.audience_user_ids, filter: row.audience_filter ?? {} },
  status: row.status,
  scheduledAt: row.scheduled_at,
  startedAt: row.started_at,
  fannedOutAt: row.fanned_out_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  targetCount: row.target_count,
  skippedCount: row.skipped_count,
  lastError: row.last_error,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Audience resolution shared by the preview and the real fan-out, so what an admin previews is exactly what
 * is sent. Only active accounts are ever targeted; a user who switched the category off is excluded.
 */
function audienceSql(audience: Audience, category: ServerCategory): { sql: string; params: unknown[] } {
  const { filter } = audience;
  return {
    sql: `
      matched AS (
        SELECT u.id FROM users u
          LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.status = 'active'
           AND ($1::text <> 'users' OR u.id = ANY($2::uuid[]))
           AND ($1::text <> 'segment' OR (
                    ($3::text[] IS NULL OR p.primary_goal = ANY($3::text[]))
                AND ($4::text[] IS NULL OR p.experience_level = ANY($4::text[]))
                AND ($5::boolean IS NULL OR coalesce(p.onboarding_completed, false) = $5::boolean)))
      ),
      eligible AS (
        SELECT m.id FROM matched m
          LEFT JOIN notification_preferences np ON np.user_id = m.id
         WHERE coalesce(np.categories -> $6::text = 'false'::jsonb, false) = false
      )`,
    params: [
      audience.type,
      audience.userIds,
      filter.primaryGoal ?? null,
      filter.experienceLevel ?? null,
      filter.onboardingCompleted ?? null,
      category,
    ],
  };
}

const EMPTY_COUNTS: DeliveryCounts = {
  total: 0,
  pending: 0,
  processing: 0,
  accepted: 0,
  dryRun: 0,
  received: 0,
  failed: 0,
  invalidToken: 0,
};

async function countDeliveries(db: SqlExecutor, campaignId: string): Promise<DeliveryCounts> {
  const { rows } = await db.query<{ status: DeliveryStatus; count: number }>(
    `SELECT status, count(*)::int AS count FROM notification_deliveries WHERE campaign_id = $1 GROUP BY status`,
    [campaignId],
  );
  const counts = { ...EMPTY_COUNTS };
  for (const { status, count } of rows) {
    counts.total += count;
    if (status === 'pending') counts.pending = count;
    else if (status === 'processing') counts.processing = count;
    else if (status === 'accepted') counts.accepted = count;
    else if (status === 'dry_run') counts.dryRun = count;
    else if (status === 'received') counts.received = count;
    else if (status === 'failed') counts.failed = count;
    else if (status === 'invalid_token') counts.invalidToken = count;
  }
  return counts;
}

export class PgCampaignRepository implements CampaignRepository {
  constructor(private readonly db: SqlExecutor) {}

  async insert(
    input: CampaignContent & { createdBy: string; scheduledAt: Date | null; status: 'draft' | 'scheduled' },
  ): Promise<CampaignRecord> {
    const { rows } = await this.db.query<CampaignRow>(
      `INSERT INTO notification_campaigns
         (created_by, title, body, category, destination, audience_type, audience_user_ids, audience_filter, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::jsonb, $9, $10) RETURNING *`,
      [
        input.createdBy,
        input.title,
        input.body,
        input.category,
        input.destination,
        input.audience.type,
        input.audience.userIds,
        JSON.stringify(input.audience.filter),
        input.status,
        input.scheduledAt,
      ],
    );
    return toCampaign(rows[0]!);
  }

  async findById(id: string): Promise<CampaignRecord | null> {
    const { rows } = await this.db.query<CampaignRow>('SELECT * FROM notification_campaigns WHERE id = $1', [
      id,
    ]);
    return rows[0] ? toCampaign(rows[0]) : null;
  }

  async list(query: { page: number; limit: number; status?: CampaignStatus }): Promise<Page<CampaignRecord>> {
    const status = query.status ?? null;
    const [items, total] = await Promise.all([
      this.db.query<CampaignRow>(
        `SELECT * FROM notification_campaigns WHERE ($1::text IS NULL OR status = $1::text)
          ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [status, query.limit, offsetOf(query)],
      ),
      this.db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM notification_campaigns WHERE ($1::text IS NULL OR status = $1::text)`,
        [status],
      ),
    ]);
    return { items: items.rows.map(toCampaign), total: total.rows[0]?.count ?? 0 };
  }

  async updateDraft(
    id: string,
    content: CampaignContent,
    expectedVersion: number,
  ): Promise<CampaignRecord | null> {
    const { rows } = await this.db.query<CampaignRow>(
      `UPDATE notification_campaigns SET
         title = $3, body = $4, category = $5, destination = $6,
         audience_type = $7, audience_user_ids = $8::uuid[], audience_filter = $9::jsonb,
         version = version + 1, updated_at = now()
       WHERE id = $1 AND status = 'draft' AND version = $2 RETURNING *`,
      [
        id,
        expectedVersion,
        content.title,
        content.body,
        content.category,
        content.destination,
        content.audience.type,
        content.audience.userIds,
        JSON.stringify(content.audience.filter),
      ],
    );
    return rows[0] ? toCampaign(rows[0]) : null;
  }

  async schedule(id: string, scheduledAt: Date): Promise<CampaignRecord | null> {
    const { rows } = await this.db.query<CampaignRow>(
      `UPDATE notification_campaigns SET status = 'scheduled', scheduled_at = $2, version = version + 1, updated_at = now()
        WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id, scheduledAt],
    );
    return rows[0] ? toCampaign(rows[0]) : null;
  }

  async cancel(id: string, adminId: string): Promise<CampaignRecord | null> {
    // One statement decides the race with the dispatcher: whichever flips the status first wins.
    const { rows } = await this.db.query<CampaignRow>(
      `UPDATE notification_campaigns SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND status IN ('draft', 'scheduled') RETURNING *`,
      [id, adminId],
    );
    return rows[0] ? toCampaign(rows[0]) : null;
  }

  deliveryCounts(campaignId: string): Promise<DeliveryCounts> {
    return countDeliveries(this.db, campaignId);
  }

  async listDeliveries(
    campaignId: string,
    query: { page: number; limit: number; status?: DeliveryStatus },
  ): Promise<Page<DeliveryRecord>> {
    const status = query.status ?? null;
    const [items, total] = await Promise.all([
      this.db.query<{
        id: string;
        notification_id: string;
        user_id: string;
        email: string | null;
        device_id: string | null;
        status: DeliveryStatus;
        attempts: number;
        error_code: string | null;
        accepted_at: Date | null;
        received_at: Date | null;
        updated_at: Date;
      }>(
        `SELECT d.id, d.notification_id, d.user_id, u.email, d.device_id, d.status, d.attempts, d.error_code,
                d.accepted_at, d.received_at, d.updated_at
           FROM notification_deliveries d LEFT JOIN users u ON u.id = d.user_id
          WHERE d.campaign_id = $1 AND ($2::text IS NULL OR d.status = $2::text)
          ORDER BY d.updated_at DESC, d.id DESC LIMIT $3 OFFSET $4`,
        [campaignId, status, query.limit, offsetOf(query)],
      ),
      this.db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM notification_deliveries
          WHERE campaign_id = $1 AND ($2::text IS NULL OR status = $2::text)`,
        [campaignId, status],
      ),
    ]);
    return {
      items: items.rows.map((row) => ({
        id: row.id,
        notificationId: row.notification_id,
        userId: row.user_id,
        userEmail: row.email,
        deviceId: row.device_id,
        status: row.status,
        attempts: row.attempts,
        errorCode: row.error_code,
        acceptedAt: row.accepted_at?.toISOString() ?? null,
        receivedAt: row.received_at?.toISOString() ?? null,
        updatedAt: row.updated_at.toISOString(),
      })),
      total: total.rows[0]?.count ?? 0,
    };
  }

  async previewAudience(audience: Audience, category: ServerCategory): Promise<AudiencePreview> {
    const { sql, params } = audienceSql(audience, category);
    const { rows } = await this.db.query<{
      matched: number;
      eligible: number;
      pushable_users: number;
      pushable_devices: number;
    }>(
      `WITH ${sql},
       pushable AS (
         SELECT d.user_id, d.id AS device_id FROM eligible e
           JOIN user_push_devices d ON d.user_id = e.id AND d.status = 'active'
           LEFT JOIN user_settings s ON s.user_id = e.id
          WHERE coalesce(s.notifications_enabled, true)
       )
       SELECT (SELECT count(*) FROM matched)::int AS matched,
              (SELECT count(*) FROM eligible)::int AS eligible,
              (SELECT count(DISTINCT user_id) FROM pushable)::int AS pushable_users,
              (SELECT count(*) FROM pushable)::int AS pushable_devices`,
      params,
    );
    const row = rows[0];
    return {
      matchedUsers: row?.matched ?? 0,
      eligibleUsers: row?.eligible ?? 0,
      pushableUsers: row?.pushable_users ?? 0,
      pushableDevices: row?.pushable_devices ?? 0,
    };
  }
}

const seconds = (ms: number): number => ms / 1000;

export class PgDispatchRepository implements DispatchRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly uow: UnitOfWork,
  ) {}

  async claimDueCampaigns(limit: number, leaseMs: number): Promise<CampaignRecord[]> {
    const { rows } = await this.db.query<CampaignRow>(
      `UPDATE notification_campaigns
          SET status = 'sending', started_at = coalesce(started_at, now()),
              locked_until = now() + make_interval(secs => $2::double precision), updated_at = now()
        WHERE id IN (
          SELECT id FROM notification_campaigns
           WHERE (status = 'scheduled' AND scheduled_at <= now())
              OR (status = 'sending' AND (locked_until IS NULL OR locked_until < now()))
           ORDER BY scheduled_at NULLS LAST, created_at, id
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [limit, seconds(leaseMs)],
    );
    return rows.map(toCampaign);
  }

  fanOut(campaign: CampaignRecord): Promise<FanOutResult> {
    return this.uow.run(async () => {
      const { sql, params } = audienceSql(campaign.audience, campaign.category);
      const matched = await this.db.query<{ count: number }>(
        `WITH ${sql} SELECT count(*)::int AS count FROM matched`,
        params,
      );
      // Unique (campaign_id, user_id) makes this safe to repeat after a crash or a lease takeover.
      await this.db.query(
        `WITH ${sql}
         INSERT INTO notifications (user_id, campaign_id, category, title, body, destination)
         SELECT e.id, $7::uuid, $8::text, $9::text, $10::text, $11::text FROM eligible e
         ON CONFLICT (campaign_id, user_id) WHERE campaign_id IS NOT NULL DO NOTHING`,
        [...params, campaign.id, campaign.category, campaign.title, campaign.body, campaign.destination],
      );
      // The master switch (user_settings.notifications_enabled) and device state are read here, at send time.
      await this.db.query(
        `INSERT INTO notification_deliveries (notification_id, campaign_id, user_id, device_id)
         SELECT n.id, n.campaign_id, n.user_id, d.id
           FROM notifications n
           JOIN user_push_devices d ON d.user_id = n.user_id AND d.status = 'active'
           LEFT JOIN user_settings s ON s.user_id = n.user_id
          WHERE n.campaign_id = $1 AND coalesce(s.notifications_enabled, true)
         ON CONFLICT (notification_id, device_id) WHERE device_id IS NOT NULL DO NOTHING`,
        [campaign.id],
      );
      const counts = await this.db.query<{ notifications: number; deliveries: number }>(
        `SELECT (SELECT count(*) FROM notifications WHERE campaign_id = $1)::int AS notifications,
                (SELECT count(*) FROM notification_deliveries WHERE campaign_id = $1)::int AS deliveries`,
        [campaign.id],
      );
      const targetCount = matched.rows[0]?.count ?? 0;
      const notificationCount = counts.rows[0]?.notifications ?? 0;
      const skippedCount = Math.max(0, targetCount - notificationCount);
      await this.db.query(
        `UPDATE notification_campaigns
            SET fanned_out_at = now(), target_count = $2, skipped_count = $3, updated_at = now()
          WHERE id = $1`,
        [campaign.id, targetCount, skippedCount],
      );
      return { targetCount, skippedCount, notificationCount, deliveryCount: counts.rows[0]?.deliveries ?? 0 };
    });
  }

  async claimDeliveries(
    campaignId: string,
    limit: number,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<DeliveryJob[]> {
    // A worker that died mid-send leaves a 'processing' row behind. Past the attempt budget it is a failure.
    await this.db.query(
      `UPDATE notification_deliveries
          SET status = 'failed', error_code = 'ATTEMPTS_EXHAUSTED', locked_until = NULL, updated_at = now()
        WHERE campaign_id = $1 AND status = 'processing' AND locked_until < now() AND attempts >= $2`,
      [campaignId, maxAttempts],
    );
    const { rows } = await this.db.query<{
      id: string;
      notification_id: string;
      campaign_id: string;
      attempts: number;
      device_id: string | null;
      token: string | null;
      title: string;
      body: string;
      category: ServerCategory;
      destination: string | null;
    }>(
      `WITH due AS (
         SELECT id FROM notification_deliveries
          WHERE campaign_id = $1
            AND ((status = 'pending' AND next_attempt_at <= now()) OR (status = 'processing' AND locked_until < now()))
          ORDER BY next_attempt_at, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE notification_deliveries d
            SET status = 'processing', attempts = d.attempts + 1,
                locked_until = now() + make_interval(secs => $3::double precision), updated_at = now()
           FROM due WHERE d.id = due.id
         RETURNING d.id, d.notification_id, d.campaign_id, d.attempts, d.device_id
       )
       SELECT c.id, c.notification_id, c.campaign_id, c.attempts, c.device_id, dev.push_token AS token,
              n.title, n.body, n.category, n.destination
         FROM claimed c
         JOIN notifications n ON n.id = c.notification_id
         LEFT JOIN user_push_devices dev ON dev.id = c.device_id AND dev.status = 'active'`,
      [campaignId, limit, seconds(leaseMs)],
    );
    return rows.map((row) => ({
      id: row.id,
      notificationId: row.notification_id,
      campaignId: row.campaign_id,
      attempts: row.attempts,
      token: row.token,
      deviceId: row.device_id,
      title: row.title,
      body: row.body,
      category: row.category,
      destination: row.destination,
    }));
  }

  async recordOutcome(deliveryId: string, outcome: DeliveryOutcome): Promise<void> {
    // Every write is guarded by status = 'processing' so a late or duplicate result cannot overwrite a newer one.
    switch (outcome.kind) {
      case 'accepted':
        await this.db.query(
          `UPDATE notification_deliveries
              SET status = $2, provider_message_id = $3, accepted_at = now(), error_code = NULL,
                  locked_until = NULL, updated_at = now()
            WHERE id = $1 AND status = 'processing'`,
          [deliveryId, outcome.dryRun ? 'dry_run' : 'accepted', outcome.messageId],
        );
        return;
      case 'retry':
        await this.db.query(
          `UPDATE notification_deliveries
              SET status = 'pending', error_code = $2, locked_until = NULL, updated_at = now(),
                  next_attempt_at = now() + make_interval(secs => $3::double precision)
            WHERE id = $1 AND status = 'processing'`,
          [deliveryId, outcome.errorCode, seconds(outcome.delayMs)],
        );
        return;
      case 'failed':
      case 'invalid_token':
        await this.db.query(
          `UPDATE notification_deliveries
              SET status = $2, error_code = $3, locked_until = NULL, updated_at = now()
            WHERE id = $1 AND status = 'processing'`,
          [deliveryId, outcome.kind, outcome.errorCode],
        );
    }
  }

  async invalidateDevice(deviceId: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE user_push_devices SET status = 'invalid', invalidated_reason = $2, updated_at = now() WHERE id = $1`,
      [deviceId, reason],
    );
  }

  deliveryCounts(campaignId: string): Promise<DeliveryCounts> {
    return countDeliveries(this.db, campaignId);
  }

  async finish(campaignId: string, status: CampaignStatus, lastError: string | null): Promise<void> {
    await this.db.query(
      `UPDATE notification_campaigns
          SET status = $2, completed_at = now(), locked_until = NULL, last_error = $3, updated_at = now()
        WHERE id = $1 AND status = 'sending'`,
      [campaignId, status, lastError],
    );
  }

  async releaseLease(campaignId: string): Promise<void> {
    await this.db.query(
      `UPDATE notification_campaigns SET locked_until = NULL WHERE id = $1 AND status = 'sending'`,
      [campaignId],
    );
  }
}

import { describe, expect, it } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { toCampaignView } from '../../../src/modules/notifications/application/views.js';
import { createImageUrlResolver } from '../../../src/modules/notifications/domain/notification-image.js';
import {
  PgCampaignRepository,
  PgDispatchRepository,
} from '../../../src/modules/notifications/infrastructure/pg-campaign-repository.js';
import { campaignViewSchema } from '../../../src/modules/notifications/interface/notifications.schemas.js';

/**
 * Regression tests for `GET /admin/notifications` answering 500 with
 * "ZodError: imageKey: expected string, received undefined".
 *
 * Cause: the campaign reads are `SELECT *` / `RETURNING *`. Against a database that does not have the `image_key`
 * column yet (migration 0021 not applied) `pg` simply omits it, so the mapper handed `undefined` to a response
 * schema that (correctly) allows a string or null but not undefined. The repository is the boundary that must turn
 * "no value" into `null`; the response schema stays strict.
 */

const KEY = 'notifications/0123456789abcdef0123456789abcdef.png';
const ORIGIN = 'https://media.example.test';
const now = new Date('2026-11-19T10:00:00Z');

/** A campaigns row exactly as the driver returns it. */
const baseRow = {
  id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
  created_by: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a02',
  title: 'Legacy',
  body: 'Created before images existed',
  category: 'announcements',
  destination: 'home',
  audience_type: 'all',
  audience_user_ids: [],
  audience_filter: {},
  status: 'sent',
  scheduled_at: null,
  started_at: now,
  fanned_out_at: now,
  completed_at: now,
  cancelled_at: null,
  target_count: 3,
  skipped_count: 0,
  last_error: null,
  version: 1,
  created_at: now,
  updated_at: now,
};

type Row = typeof baseRow & { image_key?: string | null };

/** How a row looks in each schema situation. */
const situations: [string, Row][] = [
  ['the image_key column does not exist (migration 0021 not applied)', { ...baseRow }],
  ['image_key is NULL (a campaign made before, or without, an image)', { ...baseRow, image_key: null }],
  ['image_key holds a key', { ...baseRow, image_key: KEY }],
];
const expectedKey = (row: Row): string | null => row.image_key ?? null;

/** An executor that answers every query with `rows`, and the count query with one row. */
const executorReturning = (rows: Record<string, unknown>[]): SqlExecutor =>
  ({
    query: async (text: string) => {
      const isCount = /count\(\*\)::int AS count FROM notification_campaigns/.test(text);
      return { rows: isCount ? [{ count: rows.length }] : rows, rowCount: rows.length };
    },
  }) as unknown as SqlExecutor;

const resolver = createImageUrlResolver(ORIGIN);

describe.each(situations)('campaign rows when %s', (_name, row) => {
  const repo = () => new PgCampaignRepository(executorReturning([row]));
  const want = expectedKey(row);

  it('findById maps imageKey to a string or null, never undefined', async () => {
    const record = await repo().findById(row.id);
    expect(record?.imageKey).toBe(want);
  });

  it('list maps every row the same way', async () => {
    const page = await repo().list({ page: 1, limit: 20 });
    expect(page.items.map((c) => c.imageKey)).toEqual([want]);
  });

  it('the writes that return the row map it the same way', async () => {
    const r = repo();
    const input = {
      title: 't',
      body: 'b',
      category: 'announcements' as const,
      destination: null,
      imageKey: want,
      audience: { type: 'all' as const, userIds: [], filter: {} },
    };
    expect(
      (await r.insert({ ...input, createdBy: row.created_by, scheduledAt: null, status: 'draft' })).imageKey,
    ).toBe(want);
    expect((await r.updateDraft(row.id, input, 1))?.imageKey).toBe(want);
    expect((await r.schedule(row.id, now))?.imageKey).toBe(want);
    expect((await r.cancel(row.id, row.created_by!))?.imageKey).toBe(want);
  });

  it('the dispatcher claims due campaigns with the same mapping', async () => {
    const dispatch = new PgDispatchRepository(executorReturning([row]), { run: (work) => work() });
    const claimed = await dispatch.claimDueCampaigns(3, 60_000);
    expect(claimed.map((c) => c.imageKey)).toEqual([want]);
  });

  it('what the admin API returns passes the response schema that rejected the original rows', async () => {
    const record = (await repo().findById(row.id))!;
    const view = toCampaignView(record, null, resolver);
    expect(() => campaignViewSchema.parse(view)).not.toThrow();
    expect(view.imageKey).toBe(want);
    expect(view.imageUrl).toBe(want ? `${ORIGIN}/${want}` : null);
  });

  it('a delivery job for the campaign carries the key or null', async () => {
    const claimRow = {
      id: 'd1',
      notification_id: 'n1',
      campaign_id: row.id,
      attempts: 1,
      device_id: 'dev1',
      token: 'tok',
      title: 'T',
      body: 'B',
      category: 'announcements',
      destination: null,
      ...('image_key' in row ? { image_key: row.image_key } : {}),
    };
    const dispatch = new PgDispatchRepository(executorReturning([claimRow]), { run: (work) => work() });
    const jobs = await dispatch.claimDeliveries(row.id, 10, 60_000, 4);
    expect(jobs.map((j) => j.imageKey)).toEqual([want]);
  });
});

describe('the response contract stays strict', () => {
  it('still refuses undefined for imageKey, so a mapping gap can never be hidden in the API', () => {
    const record = new PgCampaignRepository(executorReturning([{ ...baseRow, image_key: KEY }]));
    return record.findById(baseRow.id).then((found) => {
      const view = toCampaignView(found!, null, resolver);
      expect(campaignViewSchema.safeParse({ ...view, imageKey: undefined }).success).toBe(false);
      expect(campaignViewSchema.safeParse({ ...view, imageUrl: undefined }).success).toBe(false);
      expect(campaignViewSchema.safeParse({ ...view, imageKey: null, imageUrl: null }).success).toBe(true);
    });
  });
});

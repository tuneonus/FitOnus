import { describe, expect, it, vi } from 'vitest';
import { createActor } from '../../../src/shared/auth/actor.js';
import type {
  AdminAuditPort,
  CampaignRecord,
  CampaignRepository,
  NotificationImageStore,
} from '../../../src/modules/notifications/application/ports.js';
import {
  CreateCampaignUseCase,
  GetCampaignUseCase,
  ListCampaignsUseCase,
  PreviewCampaignUseCase,
  SendCampaignUseCase,
  UpdateCampaignUseCase,
  type CampaignInput,
} from '../../../src/modules/notifications/application/use-cases/campaigns.js';
import {
  createImageUrlResolver,
  createPushImageUrlResolver,
} from '../../../src/modules/notifications/domain/notification-image.js';

const admin = createActor({ userId: 'a-1', sessionId: 's-1', role: 'admin' });
const now = new Date('2026-11-19T10:00:00Z');
const ORIGIN = 'https://media.example.test';
// A key written before the image policy (JPEG/PNG as uploaded). Existing campaigns hold keys like this one.
const KEY = 'notifications/0123456789abcdef0123456789abcdef.png';
const OTHER_KEY = 'notifications/fedcba9876543210fedcba9876543210.jpg';
// The current shape: an optimized WebP, with the JPEG that FCM receives stored beside it.
const CANONICAL = 'onusfit/notifications/0123456789abcdef0123456789abcdef.webp';
const CANONICAL_PUSH = 'onusfit/notifications/0123456789abcdef0123456789abcdef.push.jpg';
const OTHER_CANONICAL = 'onusfit/notifications/fedcba9876543210fedcba9876543210.webp';
const USER = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';

const input: CampaignInput = {
  title: 'Big news',
  body: 'Something happened',
  category: 'announcements',
  destination: 'home',
  audience: { type: 'users', userIds: [USER] },
};

const record = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: 'c-1',
  title: 'Big news',
  body: 'Something happened',
  category: 'announcements',
  destination: 'home',
  imageKey: null,
  audience: { type: 'users', userIds: [USER], filter: {} },
  createdBy: 'a-1',
  status: 'draft',
  scheduledAt: null,
  startedAt: null,
  fannedOutAt: null,
  completedAt: null,
  cancelledAt: null,
  targetCount: 0,
  skippedCount: 0,
  lastError: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

function setup(
  options: {
    store?: NotificationImageStore | null | 'absent';
    push?: boolean;
    eligible?: number;
    /** The key the stored campaign carries (what get/list/send see). */
    storedKey?: string;
  } = {},
) {
  const storedKey = options.storedKey ?? KEY;
  const store = {
    put: vi.fn(async () => undefined),
    exists: vi.fn(async (_key: string) => true),
  } satisfies NotificationImageStore;
  const campaigns = {
    insert: vi.fn(async (c) => record({ ...c })),
    findById: vi.fn(async () => record({ imageKey: storedKey })),
    list: vi.fn(async () => ({ items: [record({ imageKey: storedKey })], total: 1 })),
    updateDraft: vi.fn(async (_id: string, content) => record({ ...content, version: 2 })),
    schedule: vi.fn(async (_id: string, at: Date) =>
      record({ imageKey: storedKey, status: 'scheduled', scheduledAt: at }),
    ),
    cancel: vi.fn(),
    deliveryCounts: vi.fn(async () => ({
      total: 0,
      pending: 0,
      processing: 0,
      accepted: 0,
      dryRun: 0,
      received: 0,
      failed: 0,
      invalidToken: 0,
    })),
    listDeliveries: vi.fn(),
    previewAudience: vi.fn(async () => ({
      matchedUsers: 1,
      eligibleUsers: options.eligible ?? 1,
      pushableUsers: 1,
      pushableDevices: 1,
    })),
  } satisfies CampaignRepository;
  const audit: AdminAuditPort = { recordAuditLog: vi.fn(async () => ({})) };
  const idempotency = {
    execute: vi.fn(
      async (_ref: unknown, _payload: unknown, work: (complete?: never) => Promise<unknown>) => ({
        value: await work(),
        replayed: false,
      }),
    ),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps = {
    campaigns,
    audit,
    uow: { run: <T>(work: () => Promise<T>) => work() },
    idempotency: idempotency as never,
    isPushAvailable: () => options.push ?? true,
    onLaunched: vi.fn(),
    logger,
    now: () => now,
    ...(options.store === 'absent'
      ? {}
      : {
          images: {
            store: options.store === undefined ? store : options.store,
            resolveUrl: createImageUrlResolver(ORIGIN),
            resolvePushUrl: createPushImageUrlResolver(ORIGIN),
          },
        }),
  };
  return { deps, campaigns, audit, store, idempotency, logger };
}

describe('saving a draft with an image', () => {
  it('stores the key, returns the key and the derived public URL, and does not call storage', async () => {
    const { deps, campaigns, store } = setup();
    const result = await new CreateCampaignUseCase(deps).execute(admin, {
      ...input,
      imageKey: KEY,
      mode: 'draft',
    });
    expect(campaigns.insert).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: KEY, status: 'draft' }),
    );
    expect(result.value).toMatchObject({ imageKey: KEY, imageUrl: `${ORIGIN}/${KEY}` });
    expect(store.exists).not.toHaveBeenCalled(); // saving a draft stays cheap; launch verifies
  });

  it('records that an image was attached in the audit log, without the URL', async () => {
    const { deps, audit } = setup();
    await new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY, mode: 'draft' });
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification.create',
        details: expect.objectContaining({ hasImage: true }),
      }),
    );
  });

  it('refuses an image key when storage is not configured, and saves nothing', async () => {
    const { deps, campaigns } = setup({ store: null });
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY, mode: 'draft' }),
    ).rejects.toMatchObject({ kind: 'unavailable', code: 'IMAGE_STORAGE_NOT_CONFIGURED' });
    expect(campaigns.insert).not.toHaveBeenCalled();
  });

  it('refuses an image key when image support is not wired at all', async () => {
    const { deps, campaigns } = setup({ store: 'absent' });
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY, mode: 'draft' }),
    ).rejects.toMatchObject({ code: 'IMAGE_STORAGE_NOT_CONFIGURED' });
    expect(campaigns.insert).not.toHaveBeenCalled();
  });
});

describe('launching a notification with an image', () => {
  it('checks that the image exists in storage, then queues it', async () => {
    const { deps, store, campaigns, audit } = setup();
    const result = await new CreateCampaignUseCase(deps).execute(admin, {
      ...input,
      imageKey: KEY,
      mode: 'send_now',
    });
    expect(store.exists).toHaveBeenCalledWith(KEY);
    expect(campaigns.insert).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: KEY, status: 'scheduled' }),
    );
    expect(result.value.imageUrl).toBe(`${ORIGIN}/${KEY}`);
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification.schedule',
        details: expect.objectContaining({ hasImage: true }),
      }),
    );
  });

  it('refuses when the image is not in storage, and queues nothing', async () => {
    const { deps, store, campaigns } = setup();
    store.exists.mockResolvedValueOnce(false);
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY, mode: 'send_now' }),
    ).rejects.toMatchObject({ kind: 'unprocessable', code: 'IMAGE_NOT_FOUND' });
    expect(campaigns.insert).not.toHaveBeenCalled();
    expect(deps.onLaunched).not.toHaveBeenCalled();
  });

  it('refuses with 503 when storage cannot be checked, without leaking why', async () => {
    const { deps, store, campaigns, logger } = setup();
    store.exists.mockRejectedValueOnce(new Error('R2 head failed secret=hunter2'));
    const error = await new CreateCampaignUseCase(deps)
      .execute(admin, { ...input, imageKey: KEY, mode: 'send_now' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unavailable', code: 'IMAGE_STORAGE_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect(campaigns.insert).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not call storage for a request that would fail anyway (no eligible recipients)', async () => {
    const { deps, store } = setup({ eligible: 0 });
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY, mode: 'send_now' }),
    ).rejects.toMatchObject({ code: 'NO_ELIGIBLE_RECIPIENTS' });
    expect(store.exists).not.toHaveBeenCalled();
  });

  it('sending a saved draft verifies its image and refuses when it is gone', async () => {
    const { deps, store, campaigns } = setup();
    store.exists.mockResolvedValueOnce(false);
    await expect(new SendCampaignUseCase(deps).execute(admin, 'c-1', {})).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
    });
    expect(campaigns.schedule).not.toHaveBeenCalled();

    await expect(new SendCampaignUseCase(deps).execute(admin, 'c-1', {})).resolves.toBeDefined();
    expect(store.exists).toHaveBeenLastCalledWith(KEY);
    expect(campaigns.schedule).toHaveBeenCalledTimes(1);
  });
});

describe('a text-only notification is unchanged', () => {
  it('saves imageKey null, never touches storage and has no image URL', async () => {
    const { deps, campaigns, store } = setup();
    const result = await new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'send_now' });
    expect(campaigns.insert).toHaveBeenCalledWith(expect.objectContaining({ imageKey: null }));
    expect(store.exists).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ imageKey: null, imageUrl: null });
  });

  it('works when storage is not configured at all', async () => {
    const { deps } = setup({ store: null });
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'send_now' }),
    ).resolves.toBeDefined();
  });

  it('works when image support is not wired at all', async () => {
    const { deps } = setup({ store: 'absent' });
    const result = await new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'draft' });
    expect(result.value.imageUrl).toBeNull();
  });

  it('records hasImage false in the audit log', async () => {
    const { deps, audit } = setup();
    await new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'draft' });
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ hasImage: false }) }),
    );
  });
});

describe('idempotency with images', () => {
  const fingerprintOf = async (extra: Partial<CampaignInput>) => {
    const { deps, idempotency } = setup();
    await new CreateCampaignUseCase(deps).execute(
      admin,
      { ...input, ...extra, mode: 'draft' },
      {},
      'idempotency-key-1234',
    );
    return (idempotency.execute.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
  };

  it('fingerprints a text-only request exactly as it did before images existed (no imageKey property)', async () => {
    const payload = await fingerprintOf({});
    expect(payload).not.toHaveProperty('imageKey');
    expect(Object.keys(payload).sort()).toEqual(
      ['audience', 'body', 'category', 'confirmBulk', 'destination', 'mode', 'scheduledAt', 'title'].sort(),
    );
  });

  it('treats an explicit null image the same as no image', async () => {
    expect(await fingerprintOf({ imageKey: null })).toEqual(await fingerprintOf({}));
  });

  it('includes the image, so the same key with a different picture is not replayed as the same request', async () => {
    const first = await fingerprintOf({ imageKey: KEY });
    const second = await fingerprintOf({ imageKey: OTHER_KEY });
    expect(first).toHaveProperty('imageKey', KEY);
    expect(first).not.toEqual(second);
  });

  it('replays an identical image request as the same request', async () => {
    expect(await fingerprintOf({ imageKey: KEY })).toEqual(await fingerprintOf({ imageKey: KEY }));
  });
});

describe('editing a draft: replacing and removing the image', () => {
  it('replaces the image', async () => {
    const { deps, campaigns } = setup();
    const view = await new UpdateCampaignUseCase(deps).execute(admin, 'c-1', {
      ...input,
      imageKey: OTHER_KEY,
      version: 1,
    });
    expect(campaigns.updateDraft).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ imageKey: OTHER_KEY }),
      1,
    );
    expect(view).toMatchObject({ imageKey: OTHER_KEY, imageUrl: `${ORIGIN}/${OTHER_KEY}` });
  });

  it('removes the image when the edit carries none', async () => {
    const { deps, campaigns } = setup();
    const view = await new UpdateCampaignUseCase(deps).execute(admin, 'c-1', {
      ...input,
      imageKey: null,
      version: 1,
    });
    expect(campaigns.updateDraft).toHaveBeenCalledWith('c-1', expect.objectContaining({ imageKey: null }), 1);
    expect(view).toMatchObject({ imageKey: null, imageUrl: null });
  });

  it('removes the image when the edit omits the field (the edit replaces the whole draft)', async () => {
    const { deps, campaigns } = setup();
    await new UpdateCampaignUseCase(deps).execute(admin, 'c-1', { ...input, version: 1 });
    expect(campaigns.updateDraft).toHaveBeenCalledWith('c-1', expect.objectContaining({ imageKey: null }), 1);
  });

  it('refuses an image key when storage is not configured, and changes nothing', async () => {
    const { deps, campaigns } = setup({ store: null });
    await expect(
      new UpdateCampaignUseCase(deps).execute(admin, 'c-1', { ...input, imageKey: KEY, version: 1 }),
    ).rejects.toMatchObject({ code: 'IMAGE_STORAGE_NOT_CONFIGURED' });
    expect(campaigns.updateDraft).not.toHaveBeenCalled();
  });

  it('still lets a draft that has no image be edited when storage is not configured', async () => {
    const { deps } = setup({ store: null });
    await expect(
      new UpdateCampaignUseCase(deps).execute(admin, 'c-1', { ...input, version: 1 }),
    ).resolves.toBeDefined();
  });
});

describe('preview with an image', () => {
  it('returns the exact image URL the push will carry, after checking the object exists', async () => {
    const { deps, store } = setup();
    const result = await new PreviewCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY });
    expect(store.exists).toHaveBeenCalledWith(KEY);
    expect(result.push.imageUrl).toBe(`${ORIGIN}/${KEY}`);
  });

  it('fails on the review step when the image is missing', async () => {
    const { deps, store } = setup();
    store.exists.mockResolvedValueOnce(false);
    await expect(
      new PreviewCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY }),
    ).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
    });
  });

  it('has no image URL, and does not touch storage, for a text-only preview', async () => {
    const { deps, store } = setup();
    const result = await new PreviewCampaignUseCase(deps).execute(admin, input);
    expect(result.push.imageUrl).toBeNull();
    expect(store.exists).not.toHaveBeenCalled();
  });
});

describe('reading campaigns', () => {
  it('derives the image URL for a single campaign and for a list', async () => {
    const { deps } = setup();
    expect(await new GetCampaignUseCase(deps).execute(admin, 'c-1')).toMatchObject({
      imageKey: KEY,
      imageUrl: `${ORIGIN}/${KEY}`,
    });
    const list = await new ListCampaignsUseCase(deps).execute(admin, { page: 1, limit: 20 });
    expect(list.items[0]).toMatchObject({ imageKey: KEY, imageUrl: `${ORIGIN}/${KEY}` });
  });

  it('shows no URL (but keeps the key) for an old campaign once the media domain is no longer configured', async () => {
    const { deps } = setup({ store: 'absent' });
    expect(await new GetCampaignUseCase(deps).execute(admin, 'c-1')).toMatchObject({
      imageKey: KEY,
      imageUrl: null,
    });
  });
});

describe('an image in the current shape (canonical WebP plus its push JPEG)', () => {
  it('saves a draft with the key and shows the WebP URL, without calling storage', async () => {
    const { deps, campaigns, store } = setup({ storedKey: CANONICAL });
    const result = await new CreateCampaignUseCase(deps).execute(admin, {
      ...input,
      imageKey: CANONICAL,
      mode: 'draft',
    });
    expect(campaigns.insert).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: CANONICAL, status: 'draft' }),
    );
    expect(result.value).toMatchObject({ imageKey: CANONICAL, imageUrl: `${ORIGIN}/${CANONICAL}` });
    expect(store.exists).not.toHaveBeenCalled();
  });

  it('checks that BOTH the WebP and the JPEG exist before queueing', async () => {
    const { deps, store, campaigns } = setup({ storedKey: CANONICAL });
    await new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: CANONICAL, mode: 'send_now' });
    expect(store.exists.mock.calls.map((call) => call[0])).toEqual([CANONICAL, CANONICAL_PUSH]);
    expect(campaigns.insert).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: CANONICAL, status: 'scheduled' }),
    );
  });

  it('refuses a half-written pair: the WebP is there but its push JPEG is not (nothing is queued)', async () => {
    const { deps, store, campaigns } = setup({ storedKey: CANONICAL });
    store.exists.mockImplementation(async (key: string) => key !== CANONICAL_PUSH);
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: CANONICAL, mode: 'send_now' }),
    ).rejects.toMatchObject({ kind: 'unprocessable', code: 'IMAGE_NOT_FOUND' });
    expect(campaigns.insert).not.toHaveBeenCalled();
    expect(deps.onLaunched).not.toHaveBeenCalled();
  });

  it('refuses when the WebP is missing, and does not go on to ask about the JPEG', async () => {
    const { deps, store } = setup({ storedKey: CANONICAL });
    store.exists.mockImplementation(async () => false);
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, imageKey: CANONICAL, mode: 'send_now' }),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    expect(store.exists).toHaveBeenCalledTimes(1);
  });

  it('sending a saved draft verifies both objects, and refuses when the JPEG is gone', async () => {
    const { deps, store, campaigns } = setup({ storedKey: CANONICAL });
    store.exists.mockImplementation(async (key: string) => key !== CANONICAL_PUSH);
    await expect(new SendCampaignUseCase(deps).execute(admin, 'c-1', {})).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
    });
    expect(campaigns.schedule).not.toHaveBeenCalled();

    store.exists.mockImplementation(async () => true);
    await expect(new SendCampaignUseCase(deps).execute(admin, 'c-1', {})).resolves.toBeDefined();
    expect(campaigns.schedule).toHaveBeenCalledTimes(1);
  });

  it('a storage outage while checking the pair is a 503, not a "not found"', async () => {
    const { deps, store, campaigns } = setup({ storedKey: CANONICAL });
    store.exists.mockRejectedValueOnce(new Error('R2 head failed secret=hunter2'));
    const error = await new CreateCampaignUseCase(deps)
      .execute(admin, { ...input, imageKey: CANONICAL, mode: 'send_now' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unavailable', code: 'IMAGE_STORAGE_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect(campaigns.insert).not.toHaveBeenCalled();
  });

  it('previews the JPEG the phone will receive, after checking both objects exist', async () => {
    const { deps, store } = setup({ storedKey: CANONICAL });
    const result = await new PreviewCampaignUseCase(deps).execute(admin, { ...input, imageKey: CANONICAL });
    expect(store.exists.mock.calls.map((call) => call[0])).toEqual([CANONICAL, CANONICAL_PUSH]);
    expect(result.push.imageUrl).toBe(`${ORIGIN}/${CANONICAL_PUSH}`);
  });

  it('fails the preview when the push JPEG is missing', async () => {
    const { deps, store } = setup({ storedKey: CANONICAL });
    store.exists.mockImplementation(async (key: string) => key !== CANONICAL_PUSH);
    await expect(
      new PreviewCampaignUseCase(deps).execute(admin, { ...input, imageKey: CANONICAL }),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
  });

  it('shows the WebP for display (get and list), never the push JPEG', async () => {
    const { deps } = setup({ storedKey: CANONICAL });
    expect(await new GetCampaignUseCase(deps).execute(admin, 'c-1')).toMatchObject({
      imageKey: CANONICAL,
      imageUrl: `${ORIGIN}/${CANONICAL}`,
    });
    const list = await new ListCampaignsUseCase(deps).execute(admin, { page: 1, limit: 20 });
    expect(list.items[0]).toMatchObject({ imageKey: CANONICAL, imageUrl: `${ORIGIN}/${CANONICAL}` });
  });

  it('replaces a legacy image with a canonical one on a draft (the old key is simply no longer referenced)', async () => {
    const { deps, campaigns } = setup({ storedKey: KEY });
    const view = await new UpdateCampaignUseCase(deps).execute(admin, 'c-1', {
      ...input,
      imageKey: OTHER_CANONICAL,
      version: 1,
    });
    expect(campaigns.updateDraft).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ imageKey: OTHER_CANONICAL }),
      1,
    );
    expect(view).toMatchObject({ imageKey: OTHER_CANONICAL, imageUrl: `${ORIGIN}/${OTHER_CANONICAL}` });
  });

  it('includes the canonical key in the idempotency fingerprint', async () => {
    const { deps, idempotency } = setup();
    await new CreateCampaignUseCase(deps).execute(
      admin,
      { ...input, imageKey: CANONICAL, mode: 'draft' },
      {},
      'idempotency-key-1234',
    );
    const payload = (idempotency.execute.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(payload).toHaveProperty('imageKey', CANONICAL);
  });
});

describe('a legacy image keeps working exactly as before', () => {
  it('needs only its own file to exist, and previews at its original URL', async () => {
    const { deps, store } = setup();
    const result = await new PreviewCampaignUseCase(deps).execute(admin, { ...input, imageKey: KEY });
    expect(store.exists.mock.calls.map((call) => call[0])).toEqual([KEY]);
    expect(result.push.imageUrl).toBe(`${ORIGIN}/${KEY}`);
  });
});

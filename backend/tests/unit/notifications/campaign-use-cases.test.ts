import { describe, expect, it, vi } from 'vitest';
import { createActor } from '../../../src/shared/auth/actor.js';
import type {
  AdminAuditPort,
  AudiencePreview,
  CampaignRecord,
  CampaignRepository,
} from '../../../src/modules/notifications/application/ports.js';
import {
  CancelCampaignUseCase,
  CreateCampaignUseCase,
  PreviewCampaignUseCase,
  SendCampaignUseCase,
  UpdateCampaignUseCase,
  type CampaignInput,
} from '../../../src/modules/notifications/application/use-cases/campaigns.js';

const admin = createActor({ userId: 'a-1', sessionId: 's-1', role: 'admin' });
const member = createActor({ userId: 'm-1', sessionId: 's-2', role: 'member' });
const now = new Date('2026-11-13T10:00:00Z');

const input: CampaignInput = {
  title: ' Big news ',
  body: 'Something happened',
  category: 'announcements',
  destination: 'home',
  audience: { type: 'users', userIds: ['8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01'] },
};

const preview = (overrides: Partial<AudiencePreview> = {}): AudiencePreview => ({
  matchedUsers: 1,
  eligibleUsers: 1,
  pushableUsers: 1,
  pushableDevices: 1,
  ...overrides,
});

const record = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: 'c-1',
  title: 'Big news',
  body: 'Something happened',
  category: 'announcements',
  destination: 'home',
  audience: { type: 'users', userIds: ['8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01'], filter: {} },
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

function setup(options: { push?: boolean; preview?: AudiencePreview } = {}) {
  const campaigns = {
    insert: vi.fn(async (c) => record({ ...c, status: c.status, scheduledAt: c.scheduledAt })),
    findById: vi.fn(async () => record()),
    list: vi.fn(),
    updateDraft: vi.fn(async () => record({ version: 2 })),
    schedule: vi.fn(async (_id: string, at: Date) => record({ status: 'scheduled', scheduledAt: at })),
    cancel: vi.fn(async () => record({ status: 'cancelled' })),
    deliveryCounts: vi.fn(),
    listDeliveries: vi.fn(),
    previewAudience: vi.fn(async () => options.preview ?? preview()),
  } satisfies CampaignRepository;
  const audit: AdminAuditPort = { recordAuditLog: vi.fn(async () => ({})) };
  const onLaunched = vi.fn();
  const deps = {
    campaigns,
    audit,
    uow: { run: <T>(work: () => Promise<T>) => work() },
    idempotency: { execute: vi.fn() } as never,
    isPushAvailable: () => options.push ?? true,
    onLaunched,
    now: () => now,
  };
  return { campaigns, audit, onLaunched, deps };
}

describe('authorization', () => {
  it('rejects a member on every admin use case', async () => {
    const { deps } = setup();
    await expect(
      new CreateCampaignUseCase(deps).execute(member, { ...input, mode: 'draft' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      new UpdateCampaignUseCase(deps).execute(member, 'c-1', { ...input, version: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(new SendCampaignUseCase(deps).execute(member, 'c-1', {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(new CancelCampaignUseCase(deps).execute(member, 'c-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(new PreviewCampaignUseCase(deps).execute(member, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('CreateCampaignUseCase', () => {
  it('saves a draft without needing push configured or any confirmation', async () => {
    const { deps, campaigns, onLaunched } = setup({ push: false });
    const result = await new CreateCampaignUseCase(deps).execute(admin, {
      ...input,
      audience: { type: 'all' },
      mode: 'draft',
    });
    expect(result.value.status).toBe('draft');
    expect(campaigns.insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Big news', status: 'draft', scheduledAt: null }),
    );
    expect(onLaunched).not.toHaveBeenCalled();
  });

  it('refuses to queue anything when push delivery is not configured', async () => {
    const { deps, campaigns } = setup({ push: false });
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'send_now' }),
    ).rejects.toMatchObject({
      code: 'PUSH_NOT_CONFIGURED',
    });
    expect(campaigns.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['everyone', { type: 'all' as const }],
    ['a segment', { type: 'segment' as const, filter: { onboardingCompleted: true } }],
  ])('requires explicit confirmation to send to %s', async (_name, audience) => {
    const { deps, campaigns } = setup();
    const useCase = new CreateCampaignUseCase(deps);
    await expect(useCase.execute(admin, { ...input, audience, mode: 'send_now' })).rejects.toMatchObject({
      code: 'BULK_CONFIRMATION_REQUIRED',
    });
    expect(campaigns.insert).not.toHaveBeenCalled();
    await expect(
      useCase.execute(admin, { ...input, audience, mode: 'send_now', confirmBulk: true }),
    ).resolves.toBeDefined();
  });

  it('refuses a send that would reach nobody', async () => {
    const { deps } = setup({ preview: preview({ eligibleUsers: 0, matchedUsers: 3 }) });
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'send_now' }),
    ).rejects.toMatchObject({
      code: 'NO_ELIGIBLE_RECIPIENTS',
    });
  });

  it('queues "send now" as scheduled-for-now and wakes the dispatcher', async () => {
    const { deps, campaigns, onLaunched, audit } = setup();
    const result = await new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'send_now' });
    expect(result.value.status).toBe('scheduled');
    expect(campaigns.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', scheduledAt: now }),
    );
    expect(onLaunched).toHaveBeenCalledOnce();
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 'a-1', action: 'notification.schedule' }),
    );
  });

  it('does not wake the dispatcher for a future schedule', async () => {
    const { deps, onLaunched } = setup();
    await new CreateCampaignUseCase(deps).execute(admin, {
      ...input,
      mode: 'schedule',
      scheduledAt: new Date(now.getTime() + 3_600_000),
    });
    expect(onLaunched).not.toHaveBeenCalled();
  });

  it.each([
    ['in the past', -60_000],
    ['less than 30 seconds ahead', 10_000],
    ['more than 90 days ahead', 91 * 86_400_000],
  ])('rejects a schedule time %s', async (_name, offset) => {
    const { deps } = setup();
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, {
        ...input,
        mode: 'schedule',
        scheduledAt: new Date(now.getTime() + offset),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('requires a time when scheduling', async () => {
    const { deps } = setup();
    await expect(
      new CreateCampaignUseCase(deps).execute(admin, { ...input, mode: 'schedule' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('SendCampaignUseCase', () => {
  it('only sends drafts', async () => {
    const { deps, campaigns } = setup();
    campaigns.findById.mockResolvedValueOnce(record({ status: 'sending' }));
    await expect(new SendCampaignUseCase(deps).execute(admin, 'c-1', {})).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    expect(campaigns.schedule).not.toHaveBeenCalled();
  });

  it('loses cleanly when another request already took the draft', async () => {
    const { deps, campaigns } = setup();
    campaigns.schedule.mockResolvedValueOnce(null as never);
    await expect(new SendCampaignUseCase(deps).execute(admin, 'c-1', {})).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('404s for an unknown campaign', async () => {
    const { deps, campaigns } = setup();
    campaigns.findById.mockResolvedValueOnce(null as never);
    await expect(new SendCampaignUseCase(deps).execute(admin, 'missing', {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('CancelCampaignUseCase', () => {
  it('audits a cancellation', async () => {
    const { deps, audit } = setup();
    const view = await new CancelCampaignUseCase(deps).execute(admin, 'c-1');
    expect(view.status).toBe('cancelled');
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notification.cancel' }),
    );
  });

  it('refuses once the campaign has started', async () => {
    const { deps, campaigns } = setup();
    campaigns.cancel.mockResolvedValueOnce(null as never);
    campaigns.findById.mockResolvedValueOnce(record({ status: 'sending' }));
    await expect(new CancelCampaignUseCase(deps).execute(admin, 'c-1')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });
});

describe('UpdateCampaignUseCase', () => {
  it('distinguishes a non-draft from a stale version', async () => {
    const { deps, campaigns } = setup();
    campaigns.updateDraft.mockResolvedValue(null as never);
    campaigns.findById.mockResolvedValueOnce(record({ status: 'scheduled' }));
    await expect(
      new UpdateCampaignUseCase(deps).execute(admin, 'c-1', { ...input, version: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    campaigns.findById.mockResolvedValueOnce(record({ status: 'draft', version: 5 }));
    await expect(
      new UpdateCampaignUseCase(deps).execute(admin, 'c-1', { ...input, version: 1 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});

describe('PreviewCampaignUseCase', () => {
  it('reports audience size, whether confirmation will be needed, and the exact push text', async () => {
    const { deps } = setup({ preview: preview({ eligibleUsers: 40, pushableDevices: 55 }) });
    const result = await new PreviewCampaignUseCase(deps).execute(admin, {
      ...input,
      audience: { type: 'all' },
    });
    expect(result.audience.pushableDevices).toBe(55);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.push).toEqual({
      title: 'Big news',
      body: 'Something happened',
      category: 'announcements',
      destination: 'home',
    });
  });
});

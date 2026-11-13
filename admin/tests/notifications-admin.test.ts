import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUDIENCE_TYPES,
  CAMPAIGN_STATUSES,
  DELIVERY_STATUSES,
  isBulkAudience as backendIsBulk,
  NOTIFICATION_DESTINATIONS as BACKEND_DESTINATIONS,
  SERVER_CATEGORIES as BACKEND_CATEGORIES,
} from '../../backend/src/modules/notifications/domain/notification-policy';
import {
  createCampaignRequest,
  previewCampaignRequest,
} from '../../backend/src/modules/notifications/interface/notifications.schemas';
import {
  BODY_MAX,
  BULK_USER_THRESHOLD,
  DELIVERY_STATUS_LABELS,
  STATUS_LABELS,
  audienceSummary,
  breakdown,
  canCancel,
  canEdit,
  canSend,
  composerFromCampaign,
  describeErrorCode,
  emptyComposer,
  isBulkAudience,
  isInFlight,
  isoToLocalInput,
  localInputToIso,
  outcomeSummary,
  toContent,
  validateComposer,
  validateSchedule,
  type ComposerState,
} from '../src/features/notifications/logic';
import {
  NOTIFICATION_DESTINATIONS,
  SERVER_CATEGORIES,
  type NotificationCampaign,
} from '../src/features/notifications/types';

const uuid = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';

const valid = (overrides: Partial<ComposerState> = {}): ComposerState => ({
  ...emptyComposer(),
  title: 'New challenge',
  body: 'A fresh challenge is live.',
  audienceType: 'users',
  userIds: [uuid],
  ...overrides,
});

const campaign = (overrides: Partial<NotificationCampaign> = {}): NotificationCampaign => ({
  id: uuid,
  title: 'T',
  body: 'B',
  category: 'announcements',
  destination: null,
  audience: { type: 'all', userIds: [], filter: {} },
  status: 'sent',
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  targetCount: 0,
  skippedCount: 0,
  lastError: null,
  deliveries: null,
  version: 1,
  createdBy: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const counts = (o: Partial<NonNullable<NotificationCampaign['deliveries']>> = {}) => ({
  total: 0, pending: 0, processing: 0, accepted: 0, dryRun: 0, received: 0, failed: 0, invalidToken: 0, ...o,
});

describe('Admin notifications — contract parity with the backend', () => {
  it('uses the same categories, destinations and statuses as the backend (so the UI can never offer an unsupported value)', () => {
    assert.deepEqual([...SERVER_CATEGORIES], [...BACKEND_CATEGORIES]);
    assert.deepEqual([...NOTIFICATION_DESTINATIONS], [...BACKEND_DESTINATIONS]);
    assert.deepEqual(Object.keys(STATUS_LABELS).sort(), [...CAMPAIGN_STATUSES].sort());
    assert.deepEqual(Object.keys(DELIVERY_STATUS_LABELS).sort(), [...DELIVERY_STATUSES].sort());
    assert.deepEqual([...AUDIENCE_TYPES].sort(), ['all', 'segment', 'users']);
  });

  it('applies the same bulk rule as the backend', () => {
    const many = Array.from({ length: BULK_USER_THRESHOLD + 1 }, (_, i) => String(i));
    for (const audience of [
      { type: 'all' as const, userIds: [] },
      { type: 'segment' as const, userIds: [] },
      { type: 'users' as const, userIds: ['a'] },
      { type: 'users' as const, userIds: many },
    ]) {
      assert.equal(isBulkAudience(audience), backendIsBulk(audience));
    }
  });

  it('everything the composer produces passes the backend request schema', () => {
    for (const state of [
      valid(),
      valid({ audienceType: 'all', userIds: [uuid] }),
      valid({ audienceType: 'segment', goals: ['lose'], levels: ['beginner'], onboarding: 'completed', destination: 'goals' }),
      valid({ category: 'challenges', destination: 'weekly_report' }),
    ]) {
      const create = createCampaignRequest.body.safeParse({ ...toContent(state), mode: 'draft', scheduledAt: null, confirmBulk: false });
      assert.equal(create.success, true, JSON.stringify(create.error?.issues));
      assert.equal(previewCampaignRequest.body.safeParse(toContent(state)).success, true);
    }
  });

  it('the backend rejects what the composer would never send (route-like destinations, local-only categories)', () => {
    const base = { ...toContent(valid()), mode: 'draft', scheduledAt: null, confirmBulk: false };
    assert.equal(createCampaignRequest.body.safeParse({ ...base, destination: 'https://evil.example' }).success, false);
    assert.equal(createCampaignRequest.body.safeParse({ ...base, destination: '/admin' }).success, false);
    assert.equal(createCampaignRequest.body.safeParse({ ...base, category: 'workout_reminders' }).success, false);
  });
});

describe('Admin notifications — composer rules', () => {
  it('toContent trims text and drops audience fields that do not apply', () => {
    const content = toContent(valid({ title: '  Hi  ', body: ' there ', audienceType: 'all', userIds: [uuid], goals: ['lose'] }));
    assert.equal(content.title, 'Hi');
    assert.equal(content.body, 'there');
    assert.deepEqual(content.audience, { type: 'all', userIds: [], filter: {} });
    assert.equal(content.destination, null);
  });

  it('keeps segment filters and onboarding choice', () => {
    const content = toContent(valid({ audienceType: 'segment', goals: ['lose'], onboarding: 'pending' }));
    assert.deepEqual(content.audience.filter, { primaryGoal: ['lose'], onboardingCompleted: false });
    assert.deepEqual(content.audience.userIds, []);
  });

  it('validates title, message and audience', () => {
    assert.deepEqual(validateComposer(valid()), {});
    assert.ok(validateComposer(valid({ title: '   ' })).title);
    assert.ok(validateComposer(valid({ title: 'x'.repeat(101) })).title);
    assert.ok(validateComposer(valid({ body: '' })).body);
    assert.ok(validateComposer(valid({ body: 'y'.repeat(BODY_MAX + 1) })).body);
    assert.ok(validateComposer(valid({ userIds: [] })).audience);
    assert.ok(validateComposer(valid({ audienceType: 'segment' })).audience);
    assert.deepEqual(validateComposer(valid({ audienceType: 'all', userIds: [] })), {});
  });

  it('round-trips an existing draft into the form', () => {
    const draft = campaign({
      status: 'draft',
      title: 'Edit me',
      destination: 'goals',
      audience: { type: 'segment', userIds: [], filter: { primaryGoal: ['gain'], onboardingCompleted: true } },
    });
    const state = composerFromCampaign(draft);
    assert.equal(state.onboarding, 'completed');
    assert.deepEqual(state.goals, ['gain']);
    assert.deepEqual(toContent(state).audience, draft.audience);
  });
});

describe('Admin notifications — scheduling', () => {
  const now = new Date('2026-11-13T10:00:00');

  it('requires a time within 30 seconds .. 90 days', () => {
    assert.ok(validateSchedule('', now));
    assert.ok(validateSchedule('not a date', now));
    assert.ok(validateSchedule('2026-11-13T10:00', now), 'now is too soon');
    assert.ok(validateSchedule('2026-11-12T10:00', now), 'past');
    assert.ok(validateSchedule('2027-03-01T10:00', now), 'too far');
    assert.equal(validateSchedule('2026-11-14T10:00', now), null);
  });

  it('round-trips between the datetime-local control and an ISO instant', () => {
    const local = '2026-12-01T18:30';
    assert.equal(isoToLocalInput(localInputToIso(local)), local);
    assert.match(localInputToIso(local), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('Admin notifications — actions by status', () => {
  it('only drafts can be edited or sent; only drafts and scheduled can be cancelled', () => {
    assert.equal(canEdit('draft'), true);
    assert.equal(canSend('draft'), true);
    for (const status of ['scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled'] as const) {
      assert.equal(canEdit(status), false, status);
      assert.equal(canSend(status), false, status);
    }
    assert.deepEqual(
      CAMPAIGN_STATUSES.filter((s) => canCancel(s)),
      ['draft', 'scheduled'],
    );
  });

  it('keeps polling only for statuses that change by themselves', () => {
    assert.deepEqual(
      CAMPAIGN_STATUSES.filter((s) => isInFlight(s)),
      ['scheduled', 'sending'],
    );
  });
});

describe('Admin notifications — delivery reporting is honest', () => {
  it('never calls an FCM-accepted message "delivered"', () => {
    const text = outcomeSummary(campaign({ deliveries: counts({ total: 3, accepted: 3 }) }));
    assert.match(text, /accepted by FCM/);
    assert.match(text, /not yet confirmed/);
    assert.doesNotMatch(text, /delivered/i);
  });

  it('separates confirmed, pending, failed and dry-run attempts', () => {
    const text = outcomeSummary(
      campaign({ status: 'partially_failed', deliveries: counts({ total: 6, received: 2, accepted: 1, pending: 1, failed: 1, invalidToken: 1 }) }),
    );
    assert.match(text, /2 confirmed on device/);
    assert.match(text, /1 still sending/);
    assert.match(text, /2 failed/);
    assert.deepEqual(breakdown(counts({ pending: 1, processing: 2, failed: 3, invalidToken: 4 })), {
      accepted: 0, received: 0, inProgress: 3, failed: 7, dryRun: 0,
    });
    assert.match(outcomeSummary(campaign({ deliveries: counts({ total: 1, dryRun: 1 }) })), /dry run, nothing was delivered/);
  });

  it('explains a send with no devices as inbox-only', () => {
    assert.match(outcomeSummary(campaign({ deliveries: counts() })), /No registered devices/);
  });

  it('describes known provider codes in plain language and does not echo unknown ones', () => {
    assert.match(describeErrorCode('UNREGISTERED') ?? '', /uninstalled/);
    assert.equal(describeErrorCode(null), null);
    assert.match(describeErrorCode('SOMETHING_NEW') ?? '', /server logs/);
  });

  it('summarises audiences', () => {
    assert.equal(audienceSummary({ type: 'all', userIds: [], filter: {} }), 'All eligible users');
    assert.equal(audienceSummary({ type: 'users', userIds: [uuid], filter: {} }), '1 selected user');
    assert.match(audienceSummary({ type: 'segment', userIds: [], filter: { primaryGoal: ['lose'] } }), /goal: lose/);
  });
});

describe('Admin notifications — wiring', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('is reachable from the sidebar and has a page', () => {
    assert.match(read('../src/components/layout/Sidebar.tsx'), /href: '\/notifications'/);
    assert.match(read('../app/notifications/page.tsx'), /NotificationsAdminView/);
  });

  it('only calls backend admin endpoints (permission-checked server side) and sends an Idempotency-Key on sends', () => {
    const api = read('../src/features/notifications/api.ts');
    assert.doesNotMatch(api, /\/api\/v1\/notifications/);
    assert.match(api, /Idempotency-Key/);
  });

  it('never puts a secret or FCM credential into the admin bundle config', () => {
    const source = [
      read('../src/features/notifications/api.ts'),
      read('../src/features/notifications/logic.ts'),
      read('../src/features/notifications/components/NotificationComposerModal.tsx'),
    ].join('\n');
    assert.doesNotMatch(source, /FCM_SERVICE_ACCOUNT|private_key|NEXT_PUBLIC_[A-Z_]*(KEY|SECRET)/);
  });
});

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RequestHandler } from 'express';
import {
  NOTIFICATION_DESTINATIONS as BACKEND_DESTINATIONS,
  SERVER_CATEGORIES as BACKEND_CATEGORIES,
} from '../../backend/src/modules/notifications/domain/notification-policy';
import { createNotificationsAdminRoutes } from '../../backend/src/modules/notifications/interface/notifications.routes';
import type { NotificationsController } from '../../backend/src/modules/notifications/interface/notifications.controller';
import {
  createCampaignRequest,
  previewCampaignRequest,
} from '../../backend/src/modules/notifications/interface/notifications.schemas';
import { ROLE_PERMISSIONS } from '../../backend/src/shared/auth/permissions';
import { ApiError } from '../src/lib/api-client';
import { notificationsApi } from '../src/features/notifications/api';
import {
  BODY_MAX,
  TITLE_MAX,
  confirmationSummary,
  createSingleFlight,
  describeSendFailure,
  emptyComposer,
  hasControlCharacters,
  isBulkAudience,
  toContent,
  validateComposer,
} from '../src/features/notifications/logic';
import {
  NOTIFICATION_TEMPLATES,
  composerFromTemplate,
  findTemplate,
} from '../src/features/notifications/templates';
import { NotificationTemplatePicker } from '../src/features/notifications/components/NotificationTemplatePicker';

const userId = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';
const campaignId = '0b8a3d52-6f0e-4f4c-9b53-0c8f2a3a5e11';

// ---------------------------------------------------------------------------------------------------------------
// Test harness. `fetch` is replaced for the whole file, so no test can reach a real network, backend or FCM.
// Any URL a test did not expect fails the test.
// ---------------------------------------------------------------------------------------------------------------

interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

type Reply = { status: number; body?: unknown } | Error;

const globals = globalThis as unknown as { fetch: typeof fetch; window?: unknown };
const realFetch = globals.fetch;
const realWindow = globals.window;
const storage = new Map<string, string>([['fitonus_admin_access_token', 'test-admin-token']]);
let calls: RecordedCall[] = [];
let replies: Reply[] = [];

function installFetch(...queue: Reply[]): void {
  calls = [];
  replies = [...queue];
  globals.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const reply = replies.shift();
    if (!reply) assert.fail(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  // The API client reads the bearer token from browser storage.
  globals.window = {
    location: { pathname: '/notifications' },
    dispatchEvent: () => true,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: (globals.window as { localStorage: unknown }).localStorage,
  });
  installFetch();
});

afterEach(() => {
  globals.fetch = realFetch;
  globals.window = realWindow;
});

const ok = (data: unknown, status = 200): Reply => ({
  status,
  body: { success: true, data, message: 'ok' },
});
const fail = (status: number, code: string, message: string): Reply => ({
  status,
  body: { success: false, error: { code, message } },
});

const campaignJson = (overrides: Record<string, unknown> = {}) => ({
  id: campaignId,
  title: 'T',
  body: 'B',
  category: 'announcements',
  destination: null,
  audience: { type: 'users', userIds: [userId], filter: {} },
  status: 'scheduled',
  scheduledAt: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  targetCount: 0,
  skippedCount: 0,
  lastError: null,
  deliveries: null,
  version: 1,
  createdBy: userId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------------------------------------------

describe('Notification templates — listing', () => {
  it('ships a catalogue with unique ids and names', () => {
    assert.ok(NOTIFICATION_TEMPLATES.length > 0);
    assert.equal(new Set(NOTIFICATION_TEMPLATES.map((t) => t.id)).size, NOTIFICATION_TEMPLATES.length);
    assert.equal(new Set(NOTIFICATION_TEMPLATES.map((t) => t.name)).size, NOTIFICATION_TEMPLATES.length);
  });

  it('renders every template as its own button, with its name, category and destination', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationTemplatePicker, { templates: NOTIFICATION_TEMPLATES, onSelect: () => undefined }),
    );
    assert.match(html, /Start from a template/);
    assert.equal((html.match(/<button type="button"/g) ?? []).length, NOTIFICATION_TEMPLATES.length);
    for (const template of NOTIFICATION_TEMPLATES) {
      assert.ok(html.includes(template.name), template.name);
    }
    assert.match(html, /Opens Challenges/);
  });

  it('says plainly that choosing a template does not send anything or pick recipients', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationTemplatePicker, { templates: NOTIFICATION_TEMPLATES, onSelect: () => undefined }),
    );
    assert.match(html, /You still choose who receives it/);
    assert.match(html, /before anything is sent/);
  });

  it('finds a template by id', () => {
    assert.equal(findTemplate('new-challenge')?.category, 'challenges');
    assert.equal(findTemplate('nope'), undefined);
  });

  it('listing and selecting a template make no network request', () => {
    renderToStaticMarkup(
      createElement(NotificationTemplatePicker, { templates: NOTIFICATION_TEMPLATES, onSelect: () => undefined }),
    );
    for (const template of NOTIFICATION_TEMPLATES) composerFromTemplate(template);
    assert.equal(calls.length, 0);
  });
});

describe('Notification templates — selection and editing', () => {
  it('prefills title, message, category and destination from the template', () => {
    const template = findTemplate('new-challenge')!;
    const state = composerFromTemplate(template);
    assert.equal(state.title, template.title);
    assert.equal(state.body, template.body);
    assert.equal(state.category, template.category);
    assert.equal(state.destination, template.destination);
  });

  it('never chooses recipients: no audience is preselected, and certainly never "all users"', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      const state = composerFromTemplate(template);
      assert.equal(state.audienceType, 'users', template.id);
      assert.deepEqual(state.userIds, [], template.id);
      assert.notEqual(state.audienceType, 'all', template.id);
      // Without a recipient choice the composer refuses to move on to review.
      assert.ok(validateComposer(state).audience, `${template.id} must require an audience`);
      assert.equal(isBulkAudience(toContent(state).audience), false);
    }
  });

  it('hands out independent state, so editing one composer cannot change a template or another composer', () => {
    const template = findTemplate('goal-check-in')!;
    const first = composerFromTemplate(template);
    first.userIds.push(userId);
    first.goals.push('lose');
    first.title = 'Edited';
    const second = composerFromTemplate(template);
    assert.deepEqual(second.userIds, []);
    assert.deepEqual(second.goals, []);
    assert.equal(second.title, template.title);
    assert.notEqual(template.title, 'Edited');
  });

  it('can be edited: the edited title and message are what gets sent, trimmed', () => {
    const state = { ...composerFromTemplate(findTemplate('product-update')!), userIds: [userId] };
    state.title = '  Our new feature  ';
    state.body = '  Try it today.  ';
    const content = toContent(state);
    assert.equal(content.title, 'Our new feature');
    assert.equal(content.body, 'Try it today.');
    assert.deepEqual(validateComposer(state), {});
  });

  it('every template is valid as written, once an audience is chosen', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      const state = { ...composerFromTemplate(template), userIds: [userId] };
      assert.deepEqual(validateComposer(state), {}, template.id);
      assert.ok(template.title.length <= TITLE_MAX && template.body.length <= BODY_MAX, template.id);
    }
  });

  it('every template passes the backend request schemas, and uses only categories and destinations the backend knows', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      assert.ok((BACKEND_CATEGORIES as readonly string[]).includes(template.category), template.id);
      if (template.destination) {
        assert.ok((BACKEND_DESTINATIONS as readonly string[]).includes(template.destination), template.id);
      }
      const content = toContent({ ...composerFromTemplate(template), userIds: [userId] });
      assert.equal(previewCampaignRequest.body.safeParse(content).success, true, template.id);
      const create = createCampaignRequest.body.safeParse({ ...content, mode: 'draft', scheduledAt: null, confirmBulk: false });
      assert.equal(create.success, true, `${template.id}: ${JSON.stringify(create.error?.issues)}`);
    }
  });

  it('contains no placeholder tokens, because the backend does not substitute them (they would reach members literally)', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      assert.doesNotMatch(`${template.title} ${template.body}`, /\{|\}|%s|\$\{|\[[a-z_ ]+\]/i, template.id);
    }
  });
});

describe('Notification templates — validation', () => {
  const withAudience = () => ({ ...composerFromTemplate(NOTIFICATION_TEMPLATES[0]!), userIds: [userId] });

  it('requires a title, a message and a recipient choice', () => {
    assert.ok(validateComposer({ ...withAudience(), title: '   ' }).title);
    assert.ok(validateComposer({ ...withAudience(), body: '' }).body);
    assert.ok(validateComposer({ ...withAudience(), userIds: [] }).audience);
    assert.ok(validateComposer({ ...withAudience(), audienceType: 'segment' }).audience);
  });

  it('rejects control characters in the same places the backend does', () => {
    const samples: { title: string; body: string }[] = [
      { title: 'Tab\there', body: 'fine' },
      { title: 'fine', body: 'bell\u0007here' },
      { title: 'fine', body: 'c1\u0085here' },
      { title: 'line\nbreak', body: 'fine' }, // newline is allowed in the message only
      { title: 'fine', body: 'line\nbreak is fine' },
      { title: 'plain', body: 'plain' },
    ];
    for (const sample of samples) {
      const state = { ...withAudience(), ...sample };
      const client = validateComposer(state);
      const server = previewCampaignRequest.body.safeParse(toContent(state));
      assert.equal(
        Object.keys(client).filter((key) => key === 'title' || key === 'body').length === 0,
        server.success,
        `client and backend disagree about ${JSON.stringify(sample)}`,
      );
    }
    assert.equal(hasControlCharacters('a\nb', true), false);
    assert.equal(hasControlCharacters('a\nb', false), true);
  });
});

describe('Notification send — confirmation text', () => {
  it('describes what will be sent and never promises arrival', () => {
    const now = confirmationSummary({ title: 'Hello', eligibleUsers: 3, pushableDevices: 4, scheduled: false });
    assert.match(now, /“Hello” will be sent to 3 users on up to 4 devices/);
    assert.match(now, /cannot be recalled/);
    assert.match(now, /delivery to a phone is not guaranteed/);
    assert.doesNotMatch(now, /will receive|delivered to/i);
  });

  it('handles singular counts, inbox-only audiences and scheduled sends', () => {
    assert.match(confirmationSummary({ title: 'X', eligibleUsers: 1, pushableDevices: 1, scheduled: false }), /1 user on up to 1 device\./);
    assert.match(confirmationSummary({ title: 'X', eligibleUsers: 2, pushableDevices: 0, scheduled: false }), /in-app inbox only/);
    const later = confirmationSummary({ title: 'X', eligibleUsers: 2, pushableDevices: 2, scheduled: true });
    assert.match(later, /at the scheduled time/);
    assert.match(later, /cancel it until it starts sending/);
  });
});

describe('Notification send — duplicate submission', () => {
  it('lets only one of two simultaneous submissions run', async () => {
    const flight = createSingleFlight();
    let started = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = async () => {
      started += 1;
      await gate;
      return 'sent';
    };
    // Two clicks before the first send has finished (and before any re-render could disable the button).
    const first = flight.run(task);
    const second = flight.run(task);
    release();
    assert.deepEqual(await second, { ran: false });
    assert.deepEqual(await first, { ran: true, value: 'sent' });
    assert.equal(started, 1);
  });

  it('allows a new attempt once the previous one has finished, including after a failure', async () => {
    const flight = createSingleFlight();
    await assert.rejects(flight.run(() => Promise.reject(new Error('boom'))), /boom/);
    assert.deepEqual(await flight.run(async () => 1), { ran: true, value: 1 });
    assert.deepEqual(await flight.run(async () => 2), { ran: true, value: 2 });
  });

  it('is wired into both save and send, and a send reuses one Idempotency-Key until the content changes', () => {
    const source = readFileSync(
      new URL('../src/features/notifications/components/NotificationComposerModal.tsx', import.meta.url),
      'utf8',
    );
    assert.equal((source.match(/flight\.run\(/g) ?? []).length, 2);
    assert.match(source, /keyRef\.current \?\?= crypto\.randomUUID\(\)/);
    assert.match(source, /isBusy=\{busy === 'send'\}/);
  });
});

describe('Notification send — API integration (mocked network, nothing is sent)', () => {
  it('sends Send Now to the existing create endpoint with the bearer token and an Idempotency-Key', async () => {
    installFetch(ok(campaignJson(), 201));
    const content = toContent({ ...composerFromTemplate(findTemplate('new-challenge')!), userIds: [userId] });
    const result = await notificationsApi.create(
      { ...content, mode: 'send_now', scheduledAt: null, confirmBulk: false },
      'key-123',
    );

    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.method, 'POST');
    assert.match(call.url, /\/admin\/notifications$/);
    assert.equal(call.headers.get('authorization'), 'Bearer test-admin-token');
    assert.equal(call.headers.get('idempotency-key'), 'key-123');
    assert.deepEqual(call.body, { ...content, mode: 'send_now', scheduledAt: null, confirmBulk: false });
    assert.equal(result.id, campaignId);
    // The request body carries no credential, token, route or URL: only the allow-listed fields.
    assert.doesNotMatch(JSON.stringify(call.body), /token|secret|private_key|https?:/i);
  });

  it('queues a saved draft through the send endpoint, and saves edits with the draft version', async () => {
    installFetch(ok(campaignJson({ status: 'draft', version: 2 })), ok(campaignJson()));
    const content = toContent({ ...composerFromTemplate(findTemplate('goal-check-in')!), userIds: [userId] });
    await notificationsApi.update(campaignId, { ...content, version: 1 });
    await notificationsApi.send(campaignId, { scheduledAt: null, confirmBulk: false }, 'key-9');
    assert.equal(calls[0]!.method, 'PATCH');
    assert.equal((calls[0]!.body as { version: number }).version, 1);
    assert.equal(calls[1]!.method, 'POST');
    assert.match(calls[1]!.url, new RegExp(`/admin/notifications/${campaignId}/send$`));
    assert.equal(calls[1]!.headers.get('idempotency-key'), 'key-9');
  });

  it('previews through a read-only endpoint', async () => {
    installFetch(
      ok({
        audience: { matchedUsers: 1, eligibleUsers: 1, pushableUsers: 1, pushableDevices: 1 },
        requiresConfirmation: false,
        pushAvailable: true,
        push: { title: 'T', body: 'B', category: 'announcements', destination: null },
      }),
    );
    const preview = await notificationsApi.preview(toContent({ ...emptyComposer(), title: 'T', body: 'B', userIds: [userId] }));
    assert.match(calls[0]!.url, /\/admin\/notifications\/preview$/);
    assert.equal(preview.audience.pushableDevices, 1);
  });

  it('never talks to FCM or Google from the browser: sending always goes through the backend', () => {
    const api = readFileSync(new URL('../src/features/notifications/api.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(api, /fcm\.googleapis|googleapis\.com|firebase/i);
  });
});

describe('Notification send — failure handling', () => {
  const send = () => notificationsApi.send(campaignId, { scheduledAt: null, confirmBulk: false }, 'k');

  it('reports a permission failure from the backend as a failure, not a success', async () => {
    installFetch(fail(403, 'FORBIDDEN', 'Forbidden'));
    const error = await send().then(
      () => assert.fail('expected a rejection'),
      (e: unknown) => e,
    );
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.match(error.message, /don't have permission/);
    const failure = describeSendFailure(error);
    assert.equal(failure.outcomeUnknown, false);
    assert.match(failure.message, /don't have permission/);
  });

  it('turns the backend refusals into plain messages that say nothing was sent', async () => {
    const cases: [number, string, RegExp][] = [
      [503, 'PUSH_NOT_CONFIGURED', /not configured on this server, so nothing was sent/],
      [422, 'BULK_CONFIRMATION_REQUIRED', /Nothing was sent/],
      [422, 'NO_ELIGIBLE_RECIPIENTS', /Nothing was sent/],
    ];
    for (const [status, code, expected] of cases) {
      installFetch(fail(status, code, 'raw backend text'));
      const error = await send().then(
        () => assert.fail('expected a rejection'),
        (e: unknown) => e,
      );
      const failure = describeSendFailure(error);
      assert.match(failure.message, expected, code);
      assert.equal(failure.outcomeUnknown, false, code);
    }
  });

  it('keeps the backend message for other refusals, such as an already-sent notification', async () => {
    installFetch(fail(409, 'INVALID_STATE_TRANSITION', 'Only drafts can be sent. This one is sent.'));
    const error = await send().then(
      () => assert.fail('expected a rejection'),
      (e: unknown) => e,
    );
    assert.equal(describeSendFailure(error).message, 'Only drafts can be sent. This one is sent.');
    assert.equal(describeSendFailure(error).outcomeUnknown, false);
  });

  it('does not claim a send failed when the answer was lost: a dropped connection or timeout is "unknown"', async () => {
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    for (const failure of [new TypeError('Failed to fetch'), timeout]) {
      installFetch(failure);
      const error = await send().then(
        () => assert.fail('expected a rejection'),
        (e: unknown) => e,
      );
      const described = describeSendFailure(error);
      assert.equal(described.outcomeUnknown, true);
      assert.match(described.message, /not known whether this was sent/);
      assert.match(described.message, /will not send it twice/);
    }
  });

  it('treats a server error, an in-progress key and a reused key as outcome-unknown, without exposing internals', async () => {
    const cases: [number, string, string][] = [
      [500, 'INTERNAL_ERROR', 'syntax error at or near "SELECT"'],
      [409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'A request with this Idempotency-Key is still being processed.'],
      [422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request payload.'],
    ];
    for (const [status, code, raw] of cases) {
      installFetch(fail(status, code, raw));
      const error = await send().then(
        () => assert.fail('expected a rejection'),
        (e: unknown) => e,
      );
      const described = describeSendFailure(error);
      assert.equal(described.outcomeUnknown, true, code);
      assert.match(described.message, /notification list/, code);
      assert.doesNotMatch(described.message, /SELECT|Idempotency-Key/, code);
    }
  });

  it('falls back safely for errors that are not API errors', () => {
    assert.equal(describeSendFailure(undefined).message, 'Failed to send the notification.');
    assert.equal(describeSendFailure('boom').outcomeUnknown, false);
    assert.equal(describeSendFailure(new Error('plain')).message, 'plain');
  });
});

describe('Notification send — history', () => {
  it('lists past notifications with paging and a status filter, using the existing endpoint', async () => {
    installFetch({
      status: 200,
      body: {
        success: true,
        data: [campaignJson({ status: 'sent' })],
        message: 'ok',
        meta: { page: 2, limit: 10, total: 11, totalPages: 2 },
      },
    });
    const result = await notificationsApi.list({ page: 2, limit: 10, status: 'sent' });
    assert.equal(calls[0]!.method, 'GET');
    assert.match(calls[0]!.url, /\/admin\/notifications\?page=2&limit=10&status=sent$/);
    assert.equal(result.items[0]!.status, 'sent');
    assert.equal(result.meta?.total, 11);
  });

  it('loads one notification and its per-device deliveries', async () => {
    installFetch(
      ok(campaignJson({ status: 'sent', deliveries: { total: 1, pending: 0, processing: 0, accepted: 1, dryRun: 0, received: 0, failed: 0, invalidToken: 0 } })),
      {
        status: 200,
        body: {
          success: true,
          data: [
            {
              id: campaignId,
              notificationId: campaignId,
              userId,
              userEmail: 'member@example.com',
              deviceId: null,
              status: 'accepted',
              attempts: 1,
              errorCode: null,
              acceptedAt: new Date().toISOString(),
              receivedAt: null,
              updatedAt: new Date().toISOString(),
            },
          ],
          message: 'ok',
          meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
        },
      },
    );
    const detail = await notificationsApi.get(campaignId);
    const deliveries = await notificationsApi.listDeliveries(campaignId, { page: 1, limit: 10 });
    assert.equal(detail.deliveries?.accepted, 1);
    assert.equal(deliveries.items[0]!.status, 'accepted');
    assert.match(calls[1]!.url, new RegExp(`/admin/notifications/${campaignId}/deliveries\\?page=1&limit=10$`));
  });
});

describe('Notification send — admin authorization (backend contract)', () => {
  const noop: RequestHandler = (_req, _res, next) => next();
  const adminLimiter: RequestHandler = (_req, _res, next) => next();
  const group = createNotificationsAdminRoutes('/api/v1/admin/notifications', {} as NotificationsController, {
    notificationsMember: noop,
    notificationDevices: noop,
    notificationsAdmin: adminLimiter,
    sensitive: noop,
  });

  it('every admin notification route requires a permission: reads need notifications:read, changes need notifications:send', () => {
    assert.ok(group.routes.length >= 8);
    for (const route of group.routes) {
      const label = `${route.method.toUpperCase()} ${route.path}`;
      assert.equal(route.access.kind, 'permission', label);
      if (route.access.kind !== 'permission') continue;
      const readOnly = route.method === 'get' || route.path === '/preview';
      assert.equal(route.access.permission, readOnly ? 'notifications:read' : 'notifications:send', label);
    }
  });

  it('rate-limits every route that creates, edits, sends or cancels', () => {
    for (const route of group.routes.filter((r) => r.method !== 'get')) {
      assert.ok(route.middleware?.includes(adminLimiter), `${route.method} ${route.path}`);
    }
  });

  it('only the admin role holds the notification permissions; a member holds none', () => {
    assert.ok(ROLE_PERMISSIONS.admin.includes('notifications:send'));
    assert.ok(ROLE_PERMISSIONS.admin.includes('notifications:read'));
    assert.deepEqual(
      ROLE_PERMISSIONS.member.filter((permission) => permission.startsWith('notifications:')),
      [],
    );
  });
});

describe('Notification templates — wiring and safety', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('the page shows the template picker and hands the chosen template to the composer', () => {
    const view = read('../src/features/notifications/components/NotificationsAdminView.tsx');
    assert.match(view, /<NotificationTemplatePicker templates=\{NOTIFICATION_TEMPLATES\} onSelect=\{openTemplate\}/);
    assert.match(view, /template=\{template\}/);
    // A fresh blank notification and an existing draft must never inherit a previously chosen template.
    assert.match(view, /const openNew = \(\) => \{[^}]*setTemplate\(null\)/s);
    assert.match(view, /const openDraft = [^]*?setTemplate\(null\)/);
  });

  it('opening a template only opens the composer: the picker and view never call the API themselves', () => {
    const picker = read('../src/features/notifications/components/NotificationTemplatePicker.tsx');
    assert.doesNotMatch(picker, /notificationsApi|fetch\(|apiClient/);
    const templates = read('../src/features/notifications/templates.ts');
    assert.doesNotMatch(templates, /notificationsApi|fetch\(|apiClient|audienceType: 'all'/);
  });

  it('the composer remounts per template and never sends without the confirmation dialog', () => {
    const composer = read('../src/features/notifications/components/NotificationComposerModal.tsx');
    assert.match(composer, /key=\{draft\?\.id \?\? \(source \? `template:\$\{source\.id\}` : 'new'\)\}/);
    assert.match(composer, /onConfirm=\{\(\) => void launch\(\)\}/);
    // `launch` is only reachable from the dialog's confirm button.
    assert.equal((composer.match(/launch\(\)/g) ?? []).length, 1);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ACCEPTED_UPLOAD_CONTENT_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
} from '../../backend/src/shared/images/image-policy';
import {
  campaignViewSchema,
  createCampaignRequest,
  previewCampaignRequest,
  previewSchema,
  updateCampaignRequest,
  uploadedImageSchema,
} from '../../backend/src/modules/notifications/interface/notifications.schemas';
import { ApiError } from '../src/lib/api-client';
import { notificationsApi } from '../src/features/notifications/api';
import {
  IMAGE_ACCEPT,
  IMAGE_ACCEPTED_TYPES,
  IMAGE_FORMATS_LABEL,
  IMAGE_MAX_BYTES,
  canPreviewInBrowser,
  composerFromCampaign,
  uploadComposerImage,
  describeImageUploadFailure,
  describeSendFailure,
  emptyComposer,
  formatFileSize,
  resolveImageType,
  toContent,
  validateComposer,
  validateImageFile,
  type ComposerState,
} from '../src/features/notifications/logic';
import { composerFromTemplate, NOTIFICATION_TEMPLATES } from '../src/features/notifications/templates';
import type { NotificationCampaign } from '../src/features/notifications/types';
import { NotificationImageField } from '../src/features/notifications/components/NotificationImageField';
import { NotificationThumbnail } from '../src/features/notifications/components/NotificationThumbnail';
import { PushPreview } from '../src/features/notifications/components/PushPreview';

const uuid = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';
// The current shape (an optimized WebP) and a legacy key written before the image policy: the composer carries both.
const KEY_A = 'onusfit/notifications/0123456789abcdef0123456789abcdef.webp';
const KEY_B = 'notifications/fedcba9876543210fedcba9876543210.jpg';
const URL_A = `https://media.example.test/${KEY_A}`;
const URL_B = `https://media.example.test/${KEY_B}`;

const form = (overrides: Partial<ComposerState> = {}): ComposerState => ({
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
  imageKey: null,
  imageUrl: null,
  audience: { type: 'users', userIds: [uuid], filter: {} },
  status: 'draft',
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  targetCount: 0,
  skippedCount: 0,
  lastError: null,
  deliveries: null,
  version: 1,
  createdBy: uuid,
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-19T10:00:00.000Z',
  ...overrides,
});

const markup = (element: React.ReactElement): string => renderToStaticMarkup(element);

// -------------------------------------------------------------------------------------------------
describe('Notification images — file rules', () => {
  it('uses the same limit and types as the backend', () => {
    assert.equal(IMAGE_MAX_BYTES, IMAGE_UPLOAD_MAX_BYTES);
    assert.equal(IMAGE_MAX_BYTES, 10 * 1_048_576);
    assert.deepEqual([...IMAGE_ACCEPTED_TYPES].sort(), [...ACCEPTED_UPLOAD_CONTENT_TYPES].sort());
  });

  it('offers the file picker every accepted type, and the HEIC extensions browsers cannot map to a type', () => {
    assert.equal(IMAGE_ACCEPT, 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif');
    assert.equal(IMAGE_FORMATS_LABEL, 'JPEG, PNG, WebP or HEIC');
  });

  it('accepts JPEG, PNG, WebP and HEIC up to the limit, inclusive', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      assert.equal(validateImageFile({ type, size: 1 }), null, type);
      assert.equal(validateImageFile({ type, size: IMAGE_MAX_BYTES }), null, type);
    }
    assert.equal(validateImageFile({ type: 'image/png', size: 200_000 }), null);
    // A file the old 1 MB limit refused is fine now: only the converted copy is stored.
    assert.equal(validateImageFile({ type: 'image/jpeg', size: 6 * 1_048_576 }), null);
  });

  it('refuses a file one byte over the limit, in words that do not contradict themselves', () => {
    assert.equal(
      validateImageFile({ type: 'image/png', size: IMAGE_MAX_BYTES + 1 }),
      'That image is 10.1 MB. The limit is 10.0 MB.',
    );
    assert.equal(
      validateImageFile({ type: 'image/png', size: 50 * 1_048_576 }),
      'That image is 50.0 MB. The limit is 10.0 MB.',
    );
  });

  it('refuses every other type, including look-alikes', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'image/avif', 'image/tiff', 'image/bmp', 'application/pdf', 'text/html', '', 'IMAGE/PNG']) {
      assert.equal(validateImageFile({ type, size: 1000 }), 'Choose a JPEG, PNG, WebP or HEIC image.', type || '(empty type)');
    }
  });

  it('recognises a HEIC photo by its extension when the browser gives it no type (Chrome and Firefox do not know HEIC)', () => {
    assert.equal(resolveImageType({ type: '', name: 'IMG_0042.HEIC' }), 'image/heic');
    assert.equal(resolveImageType({ type: '', name: 'photo.heif' }), 'image/heif');
    assert.equal(resolveImageType({ type: 'application/octet-stream', name: 'IMG_0042.heic' }), 'image/heic');
    assert.equal(validateImageFile({ type: '', name: 'IMG_0042.HEIC', size: 2_000_000 }), null);
  });

  it('does not rescue what a name cannot prove: a known-but-wrong type, or an unknown type without a HEIC name', () => {
    assert.equal(resolveImageType({ type: 'image/gif', name: 'trust-me.heic' }), null);
    assert.equal(resolveImageType({ type: 'application/pdf', name: 'a.heic' }), null);
    assert.equal(resolveImageType({ type: '', name: 'photo.png' }), null);
    assert.equal(resolveImageType({ type: '', name: 'a.heic.exe' }), null);
    assert.equal(resolveImageType({ type: '' }), null);
    assert.equal(resolveImageType({ type: 'image/png', name: 'x.heic' }), 'image/png'); // a real type wins
  });

  it('knows which types a browser can draw itself (HEIC is previewed from the converted WebP instead)', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(canPreviewInBrowser(type), true, type);
    for (const type of ['image/heic', 'image/heif', '']) assert.equal(canPreviewInBrowser(type), false, type || '(empty)');
  });

  it('refuses an empty file', () => {
    assert.equal(validateImageFile({ type: 'image/png', size: 0 }), 'That file is empty.');
  });

  it('formats sizes for people, rounding up so an over-limit file never reads as equal to the limit', () => {
    assert.equal(formatFileSize(300), '1 KB');
    assert.equal(formatFileSize(204_800), '200 KB');
    assert.equal(formatFileSize(204_801), '201 KB');
    assert.equal(formatFileSize(1_048_576), '1.0 MB');
    assert.equal(formatFileSize(1_048_577), '1.1 MB');
    assert.equal(formatFileSize(1_572_864), '1.5 MB');
  });
});

describe('Notification images — upload and send failure messages', () => {
  it('turns storage codes into advice, and keeps the server message for validation failures', () => {
    assert.match(describeImageUploadFailure({ code: 'IMAGE_STORAGE_NOT_CONFIGURED' }), /not set up on this server/);
    assert.match(describeImageUploadFailure({ code: 'IMAGE_STORAGE_UNAVAILABLE' }), /Try again in a moment/);
    assert.match(describeImageUploadFailure({ code: 'NETWORK_ERROR' }), /Check your connection/);
    assert.match(describeImageUploadFailure({ code: 'TIMEOUT' }), /did not finish/);
    assert.equal(
      describeImageUploadFailure({ code: 'PAYLOAD_TOO_LARGE', message: 'The image is larger than 10 MB.' }),
      'The image is larger than 10 MB.',
    );
    assert.equal(
      describeImageUploadFailure({ code: 'INVALID_IMAGE', message: 'The file is not a JPEG, PNG, WebP or HEIC image.' }),
      'The file is not a JPEG, PNG, WebP or HEIC image.',
    );
    assert.equal(describeImageUploadFailure(undefined), 'The image could not be uploaded.');
    assert.equal(describeImageUploadFailure('boom'), 'The image could not be uploaded.');
  });

  it('says nothing was sent when the image blocks a send, and does not call it an unknown outcome', () => {
    for (const code of ['IMAGE_NOT_FOUND', 'IMAGE_STORAGE_NOT_CONFIGURED', 'IMAGE_STORAGE_UNAVAILABLE']) {
      // 503 would normally mean "outcome unknown"; for these the image is checked before anything is queued.
      const failure = describeSendFailure({ code, status: code === 'IMAGE_NOT_FOUND' ? 422 : 503, message: 'x' });
      assert.equal(failure.outcomeUnknown, false, code);
      assert.match(failure.message, /nothing was sent/i, code);
    }
  });
});

// -------------------------------------------------------------------------------------------------
describe('Notification images — composer state', () => {
  it('starts without an image, and a text-only notification is valid', () => {
    assert.equal(emptyComposer().image, null);
    assert.deepEqual(validateComposer(form()), {});
  });

  it('sends imageKey null for a text-only notification', () => {
    assert.equal(toContent(form()).imageKey, null);
  });

  it('sends only the key, never the URL', () => {
    const content = toContent(form({ image: { key: KEY_A, url: URL_A } }));
    assert.equal(content.imageKey, KEY_A);
    assert.equal(JSON.stringify(content).includes('http'), false);
    assert.equal('imageUrl' in content, false);
  });

  it('replacing the image sends the new key; removing it sends null', () => {
    const first = form({ image: { key: KEY_A, url: URL_A } });
    const replaced = { ...first, image: { key: KEY_B, url: URL_B } };
    const removed = { ...replaced, image: null };
    assert.equal(toContent(first).imageKey, KEY_A);
    assert.equal(toContent(replaced).imageKey, KEY_B);
    assert.equal(toContent(removed).imageKey, null);
  });

  it('an image does not change any other field of the request', () => {
    const withImage = toContent(form({ image: { key: KEY_A, url: URL_A } }));
    const textOnly = toContent(form());
    assert.deepEqual({ ...withImage, imageKey: null }, textOnly);
  });

  it('editing a draft keeps its image when nothing touches it', () => {
    const draft = campaign({ imageKey: KEY_A, imageUrl: URL_A });
    const state = composerFromCampaign(draft);
    assert.deepEqual(state.image, { key: KEY_A, url: URL_A });
    assert.equal(toContent({ ...state, title: 'Edited' }).imageKey, KEY_A);
  });

  it('keeps the key even when the server could not derive a URL', () => {
    const state = composerFromCampaign(campaign({ imageKey: KEY_A, imageUrl: null }));
    assert.deepEqual(state.image, { key: KEY_A, url: null });
    assert.equal(toContent(state).imageKey, KEY_A);
  });

  it('opens a text-only draft without an image', () => {
    assert.equal(composerFromCampaign(campaign()).image, null);
  });

  it('opens a draft saved before images existed (no image fields at all)', () => {
    const legacy = campaign() as Partial<NotificationCampaign>;
    delete legacy.imageKey;
    delete legacy.imageUrl;
    assert.equal(composerFromCampaign(legacy as NotificationCampaign).image, null);
  });

  it('templates never carry an image', () => {
    for (const template of NOTIFICATION_TEMPLATES) assert.equal(composerFromTemplate(template).image, null, template.id);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Notification images — contract with the backend schemas', () => {
  const create = (content: unknown) => ({ ...(content as object), mode: 'draft', scheduledAt: null, confirmBulk: false });

  it('the backend accepts what the composer sends, with and without an image', () => {
    for (const image of [null, { key: KEY_A, url: URL_A }]) {
      const content = toContent(form({ image }));
      assert.equal(createCampaignRequest.body.parse(create(content)).imageKey, image?.key ?? null);
      assert.equal(previewCampaignRequest.body.parse(content).imageKey, image?.key ?? null);
      assert.equal(updateCampaignRequest.body.parse({ ...content, version: 1 }).imageKey, image?.key ?? null);
    }
  });

  it('the request carries exactly the fields the backend knows (nothing is dropped or invented)', () => {
    const content = toContent(form({ image: { key: KEY_A, url: URL_A } }));
    assert.deepEqual(Object.keys(previewCampaignRequest.body.parse(content)).sort(), Object.keys(content).sort());
  });

  it('the backend refuses an external address however it is sent', () => {
    const content = toContent(form({ image: { key: KEY_A, url: URL_A } }));
    assert.throws(() => previewCampaignRequest.body.parse({ ...content, imageUrl: 'https://evil.example/x.png' }));
    assert.throws(() => previewCampaignRequest.body.parse({ ...content, imageKey: 'https://evil.example/x.png' }));
    assert.throws(() => previewCampaignRequest.body.parse({ ...content, imageKey: 'notifications/../x.png' }));
    assert.throws(() => createCampaignRequest.body.parse(create({ ...content, imageUrl: URL_A })));
  });

  it('the backend takes the current and the legacy key shape, and nothing the composer could not have been given', () => {
    for (const key of [KEY_A, KEY_B]) {
      assert.equal(previewCampaignRequest.body.parse(toContent(form({ image: { key, url: null } }))).imageKey, key);
    }
    for (const key of [
      'onusfit/notifications/0123456789abcdef0123456789abcdef.push.jpg', // the JPEG the push carries is never a saved key
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
      'onusfit/notifications/0123456789abcdef0123456789abcdef.png',
      'notifications/0123456789abcdef0123456789abcdef.webp',
    ]) {
      assert.throws(() => previewCampaignRequest.body.parse(toContent(form({ image: { key, url: null } }))), key);
    }
  });

  it('the shapes the admin reads match the backend responses', () => {
    const wire = campaignViewSchema.parse(campaign({ imageKey: KEY_A, imageUrl: URL_A }));
    assert.equal(wire.imageKey, KEY_A);
    assert.equal(wire.imageUrl, URL_A);
    assert.equal(campaignViewSchema.parse(campaign()).imageUrl, null);

    const preview = previewSchema.parse({
      audience: { matchedUsers: 1, eligibleUsers: 1, pushableUsers: 1, pushableDevices: 1 },
      requiresConfirmation: false,
      pushAvailable: true,
      push: { title: 't', body: 'b', category: 'announcements', destination: null, imageUrl: URL_A },
    });
    assert.equal(preview.push.imageUrl, URL_A);

    const uploaded = {
      imageKey: KEY_A,
      imageUrl: URL_A,
      contentType: 'image/webp',
      sizeBytes: 10,
      width: 2,
      height: 2,
      source: { format: 'heic', bytes: 2_000_000, width: 4032, height: 3024 },
    };
    assert.deepEqual(uploadedImageSchema.parse(uploaded), uploaded);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Notification images — choosing a file (uploadComposerImage)', () => {
  const png = (size = 1000) => new Blob([new Uint8Array(size)], { type: 'image/png' });
  const accepted = { imageKey: KEY_A, imageUrl: URL_A };

  it('uploads a valid file and returns the key and URL', async () => {
    let calls = 0;
    const outcome = await uploadComposerImage(png(), async () => {
      calls += 1;
      return accepted;
    });
    assert.deepEqual(outcome, { ok: true, image: { key: KEY_A, url: URL_A } });
    assert.equal(calls, 1);
  });

  it('uploads each file with the type the server needs, including a HEIC photo the browser gave no type', async () => {
    const seen: string[] = [];
    const upload = async (_file: Blob, contentType: string) => {
      seen.push(contentType);
      return accepted;
    };
    await uploadComposerImage(png(), upload);
    await uploadComposerImage(new Blob([new Uint8Array(10)], { type: 'image/webp' }), upload);
    await uploadComposerImage(new File([new Uint8Array(10)], 'IMG_0042.HEIC', { type: '' }), upload);
    await uploadComposerImage(new File([new Uint8Array(10)], 'IMG_0043.heic', { type: 'image/heic' }), upload);
    assert.deepEqual(seen, ['image/png', 'image/webp', 'image/heic', 'image/heic']);
  });

  it('does not upload a nameless, typeless file', async () => {
    let calls = 0;
    const outcome = await uploadComposerImage(new Blob([new Uint8Array(10)]), async () => {
      calls += 1;
      return accepted;
    });
    assert.deepEqual(outcome, { ok: false, error: 'Choose a JPEG, PNG, WebP or HEIC image.' });
    assert.equal(calls, 0);
  });

  it('does not upload a file of the wrong type, or over the limit, and says why', async () => {
    let calls = 0;
    const upload = async () => {
      calls += 1;
      return accepted;
    };
    assert.deepEqual(await uploadComposerImage(new Blob([new Uint8Array(10)], { type: 'image/gif' }), upload), {
      ok: false,
      error: 'Choose a JPEG, PNG, WebP or HEIC image.',
    });
    assert.deepEqual(await uploadComposerImage(png(IMAGE_MAX_BYTES + 1), upload), {
      ok: false,
      error: 'That image is 10.1 MB. The limit is 10.0 MB.',
    });
    assert.deepEqual(await uploadComposerImage(png(0), upload), { ok: false, error: 'That file is empty.' });
    assert.equal(calls, 0);
  });

  it('accepts a file of exactly the limit', async () => {
    const outcome = await uploadComposerImage(png(IMAGE_MAX_BYTES), async () => accepted);
    assert.equal(outcome.ok, true);
  });

  it('turns a failed upload into a message and returns no image, so the previous one is kept', async () => {
    const outcome = await uploadComposerImage(png(), async () => {
      throw new ApiError('Image storage is not configured.', 503, 'IMAGE_STORAGE_NOT_CONFIGURED');
    });
    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && /not set up on this server/.test(outcome.error));
    assert.equal('image' in outcome, false);
  });

  it('carries the server message for a refused file', async () => {
    const outcome = await uploadComposerImage(png(), async () => {
      throw new ApiError('The image file looks damaged or incomplete.', 422, 'INVALID_IMAGE');
    });
    assert.deepEqual(outcome, { ok: false, error: 'The image file looks damaged or incomplete.' });
  });

  it('a replacement that fails leaves the composer on the previous image', async () => {
    const current = form({ image: { key: KEY_A, url: URL_A } });
    const outcome = await uploadComposerImage(png(), async () => {
      throw new ApiError('boom', 503, 'IMAGE_STORAGE_UNAVAILABLE');
    });
    const next = outcome.ok ? { ...current, image: outcome.image } : current;
    assert.equal(toContent(next).imageKey, KEY_A);
  });

  it('a replacement that succeeds swaps the image', async () => {
    const current = form({ image: { key: KEY_A, url: URL_A } });
    const outcome = await uploadComposerImage(png(), async () => ({ imageKey: KEY_B, imageUrl: URL_B }));
    const next = outcome.ok ? { ...current, image: outcome.image } : current;
    assert.equal(toContent(next).imageKey, KEY_B);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Notification images — the upload request', () => {
  type Call = { url: string; init: RequestInit };

  async function withFetch<T>(
    respond: (call: Call) => Response | Promise<Response>,
    run: (calls: Call[]) => Promise<T>,
  ): Promise<T> {
    const original = globalThis.fetch;
    const calls: Call[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      return respond(call);
    }) as typeof fetch;
    try {
      return await run(calls);
    } finally {
      globalThis.fetch = original;
    }
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const errorBody = (code: string, message: string) => ({ success: false, error: { code, message, requestId: 'r1' } });

  it('posts the raw file with its own type, not JSON', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const uploaded = {
      imageKey: KEY_A,
      imageUrl: URL_A,
      contentType: 'image/webp',
      sizeBytes: 4,
      width: 2,
      height: 2,
      source: { format: 'png', bytes: 4, width: 2, height: 2 },
    };
    await withFetch(
      () => json(201, { success: true, data: uploaded, message: 'Image uploaded' }),
      async (calls) => {
        const result = await notificationsApi.uploadImage(file);
        assert.deepEqual(result, uploaded);
        assert.equal(calls.length, 1);
        const { url, init } = calls[0]!;
        assert.match(url, /\/notifications\/images$/);
        assert.equal(init.method, 'POST');
        assert.strictEqual(init.body, file); // the file itself, not a re-encoded copy
        const headers = new Headers(init.headers);
        assert.equal(headers.get('Content-Type'), 'image/png');
        assert.equal(headers.get('X-Panel-Id'), 'fitonus-admin');
      },
    );
  });

  it('posts a HEIC photo with the type it was resolved to, not the empty type the browser reported', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'IMG_0042.HEIC', { type: '' });
    await withFetch(
      () => json(201, { success: true, data: {}, message: 'Image uploaded' }),
      async (calls) => {
        await notificationsApi.uploadImage(file, resolveImageType(file) as string);
        const headers = new Headers(calls[0]!.init.headers);
        assert.equal(headers.get('Content-Type'), 'image/heic');
        assert.strictEqual(calls[0]!.init.body, file);
      },
    );
  });

  it('still sends every other request as JSON (the shared client default is unchanged)', async () => {
    await withFetch(
      () => json(200, { success: true, data: { audience: {}, push: {} }, message: 'ok' }),
      async (calls) => {
        await notificationsApi.preview(toContent(form()));
        assert.equal(new Headers(calls[0]!.init.headers).get('Content-Type'), 'application/json');
        assert.equal(typeof calls[0]!.init.body, 'string');
      },
    );
  });

  it('carries the key in the preview request, never the URL', async () => {
    await withFetch(
      () => json(200, { success: true, data: {}, message: 'ok' }),
      async (calls) => {
        await notificationsApi.preview(toContent(form({ image: { key: KEY_A, url: URL_A } })));
        const sent = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
        assert.equal(sent.imageKey, KEY_A);
        assert.equal('imageUrl' in sent, false);
        assert.equal((calls[0]!.init.body as string).includes('http'), false);
      },
    );
  });

  it('shows the server explanation when the file is too large', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    await withFetch(
      () => json(413, errorBody('PAYLOAD_TOO_LARGE', 'The image is larger than 10 MB.')),
      async () => {
        const error = await notificationsApi.uploadImage(file).catch((e: unknown) => e);
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 413);
        assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
        assert.equal(describeImageUploadFailure(error), 'The image is larger than 10 MB.');
      },
    );
  });

  it('shows the server explanation for a file of the wrong type or a damaged file', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    for (const [status, code, message] of [
      [415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP and HEIC images can be uploaded (send Content-Type: image/jpeg, image/png, image/webp or image/heic).'],
      [422, 'INVALID_IMAGE', 'The image file looks damaged or incomplete.'],
    ] as const) {
      await withFetch(
        () => json(status, errorBody(code, message)),
        async () => {
          const error = await notificationsApi.uploadImage(file).catch((e: unknown) => e);
          assert.equal(describeImageUploadFailure(error), message);
        },
      );
    }
  });

  it('explains an unconfigured server, which the shared client would otherwise call a generic server error', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    await withFetch(
      () => json(503, errorBody('IMAGE_STORAGE_NOT_CONFIGURED', 'Image storage is not configured on this server, so images cannot be uploaded.')),
      async () => {
        const error = await notificationsApi.uploadImage(file).catch((e: unknown) => e);
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'IMAGE_STORAGE_NOT_CONFIGURED');
        assert.match(describeImageUploadFailure(error), /not set up on this server/);
      },
    );
  });

  it('reports a dropped connection as an upload that did not finish', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    await withFetch(
      () => {
        throw new TypeError('Failed to fetch');
      },
      async () => {
        const error = await notificationsApi.uploadImage(file).catch((e: unknown) => e);
        assert.match(describeImageUploadFailure(error), /Check your connection/);
      },
    );
  });

  it('reports an unauthorized upload as a permission problem', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    await withFetch(
      () => json(403, errorBody('FORBIDDEN', 'You do not have permission to perform this action.')),
      async () => {
        const error = await notificationsApi.uploadImage(file).catch((e: unknown) => e);
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        assert.match(describeImageUploadFailure(error), /permission/);
      },
    );
  });
});

// -------------------------------------------------------------------------------------------------
describe('Notification images — what the admin sees', () => {
  const noop = () => undefined;

  it('offers "Add image" when there is none, restricted to the formats the backend accepts', () => {
    const html = markup(React.createElement(NotificationImageField, { value: null, onChange: noop }));
    assert.match(html, /Add image/);
    assert.doesNotMatch(html, /Replace image|Remove image/);
    assert.ok(html.includes(`accept="${IMAGE_ACCEPT}"`), 'the file picker offers exactly the accepted formats');
    assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif,\.heic,\.heif"/);
    assert.match(html, /type="file"/);
  });

  it('tells the admin the formats and limit, that it is converted to WebP without metadata, Android only, and public', () => {
    const html = markup(React.createElement(NotificationImageField, { value: null, onChange: noop }));
    assert.match(html, /JPEG, PNG, WebP or HEIC, up to 10\.0 MB/);
    assert.match(html, /converted to an optimized WebP/);
    assert.match(html, /camera and location details are removed/);
    assert.match(html, /Android only/);
    assert.match(html, /public/);
    assert.match(html, /never a member/);
  });

  it('offers Replace and Remove, and shows the image, once one is attached', () => {
    const html = markup(
      React.createElement(NotificationImageField, { value: { key: KEY_A, url: URL_A }, onChange: noop }),
    );
    assert.match(html, /Replace image/);
    assert.match(html, /Remove image/);
    assert.doesNotMatch(html, />Add image</);
    assert.ok(html.includes(URL_A), 'the preview points at the public URL');
  });

  it('still lets a saved image be replaced or removed when no URL is available', () => {
    const html = markup(React.createElement(NotificationImageField, { value: { key: KEY_A, url: null }, onChange: noop }));
    assert.match(html, /Replace image/);
    assert.match(html, /Remove image/);
    assert.match(html, /No preview is available/);
  });

  it('disables the buttons when the field is disabled', () => {
    const html = markup(
      React.createElement(NotificationImageField, { value: { key: KEY_A, url: URL_A }, onChange: noop, disabled: true }),
    );
    assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  });

  it('the push preview shows the picture only when there is one', () => {
    const base = { title: 'T', body: 'B', destination: null };
    assert.doesNotMatch(markup(React.createElement(PushPreview, base)), /<img/);
    assert.doesNotMatch(markup(React.createElement(PushPreview, { ...base, imageUrl: null })), /<img/);
    const withImage = markup(React.createElement(PushPreview, { ...base, imageUrl: URL_A }));
    assert.match(withImage, /<img/);
    assert.ok(withImage.includes(URL_A));
  });

  it('the history thumbnail is a decorative image of the notification picture', () => {
    const html = markup(React.createElement(NotificationThumbnail, { imageUrl: URL_A }));
    assert.match(html, /<img/);
    assert.match(html, /alt=""/);
    assert.ok(html.includes(URL_A));
  });
});

// -------------------------------------------------------------------------------------------------
describe('Notification images — wiring and safety', () => {
  const read = (relative: string) => readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');
  const composer = read('features/notifications/components/NotificationComposerModal.tsx');
  const listView = read('features/notifications/components/NotificationsAdminView.tsx');
  const detail = read('features/notifications/components/NotificationDetailModal.tsx');

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it('no storage credential, endpoint or bucket address exists anywhere in the admin front end', () => {
    const forbidden = /R2_|cloudflarestorage|secretAccessKey|accessKeyId|AWS4-HMAC|X-Amz|NEXT_PUBLIC_[A-Z_]*(R2|MEDIA|S3)/i;
    for (const file of sourceFiles(path.join(__dirname, '..', 'src'))) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), forbidden, path.relative(path.join(__dirname, '..'), file));
    }
  });

  it('the media domain is never hard-coded: image URLs only ever come from the server', () => {
    for (const file of sourceFiles(path.join(__dirname, '..', 'src'))) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /media\.tuneonus\.com/, file);
    }
  });

  it('the composer holds Save and Review while an image uploads, including the Enter-key path', () => {
    assert.match(composer, /<NotificationImageField/);
    assert.match(composer, /onBusyChange=\{setImageBusy\}/);
    // Both the Save draft path and the Review path (which the Enter key also reaches) must check it.
    assert.equal((composer.match(/busy \|\| imageBusy\) return;/g) ?? []).length, 2);
    assert.equal((composer.match(/busy !== null \|\| imageBusy/g) ?? []).length, 2);
  });

  it('the composer shows the image on both the compose and the review preview', () => {
    assert.match(composer, /imageUrl=\{form\.image\?\.url \?\? null\}/);
    assert.match(composer, /imageUrl=\{preview\.push\.imageUrl\}/);
  });

  it('the notification list shows a thumbnail only for rows that have an image', () => {
    assert.match(listView, /item\.imageUrl && <NotificationThumbnail imageUrl=\{item\.imageUrl\} \/>/);
  });

  it('the detail view previews the sent image', () => {
    assert.match(detail, /imageUrl=\{campaign\.imageUrl\}/);
  });

  // The field's behaviour is the shared ImageUploadField (features/media); NotificationImageField only says where the
  // file goes and what the admin is told, so the behaviour checks read the shared component and the wiring checks the
  // wrapper.
  const sharedField = () => read('features/media/components/ImageUploadField.tsx');
  const notificationField = () => read('features/notifications/components/NotificationImageField.tsx');

  it('the upload field only talks to the backend through the API client', () => {
    assert.match(notificationField(), /upload=\{notificationsApi\.uploadImage\}/);
    assert.match(sharedField(), /uploadImageFile\(file, uploadFile, unconfiguredAdvice\)/);
    assert.doesNotMatch(notificationField(), /\bfetch\(/);
    assert.doesNotMatch(sharedField(), /\bfetch\(/);
  });

  it('a HEIC photo is previewed from the converted WebP, because browsers cannot draw HEIC', () => {
    const field = sharedField();
    assert.match(field, /resolveImageType\(file\)/);
    assert.match(field, /replaceLocalPreview\(type && canPreviewInBrowser\(type\) \? URL\.createObjectURL\(file\) : null\)/);
  });

  it('removing the image clears it from the notification', () => {
    const field = sharedField();
    assert.match(field, /const remove = \(\) => \{[\s\S]*?onChange\(null\);[\s\S]*?\};/);
    assert.match(field, /onClick=\{remove\}/);
  });

  it('a failed pick never calls onChange, so the current image is kept', () => {
    const field = sharedField();
    // onChange(outcome.image) is only inside the success branch.
    assert.match(field, /if \(outcome\.ok\) \{[\s\S]*?onChange\(outcome\.image\);[\s\S]*?\} else \{[\s\S]*?setError\(outcome\.error\);/);
  });
});

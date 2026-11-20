import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isExerciseImageKey,
  isHttpUrl as backendIsHttpUrl,
} from '../../backend/src/modules/workouts/domain/exercise-image';
import {
  createExerciseAdminRequest,
  exerciseViewSchema,
  updateExerciseAdminRequest,
  uploadedExerciseImageSchema,
} from '../../backend/src/modules/workouts/interface/workouts.schemas';
import { ACCEPTED_UPLOAD_CONTENT_TYPES, IMAGE_UPLOAD_MAX_BYTES } from '../../backend/src/shared/images/image-policy';
import { ApiError } from '../src/lib/api-client';
import {
  EXERCISE_UNCONFIGURED_ADVICE,
  IMAGE_ACCEPT,
  IMAGE_ACCEPTED_TYPES,
  IMAGE_MAX_BYTES,
  NOTIFICATION_UNCONFIGURED_ADVICE,
  describeImageUploadFailure,
  imageUploadSummary,
  uploadImageFile,
} from '../src/features/media/image-upload';
import { ImageUploadField } from '../src/features/media/components/ImageUploadField';
import { ImageThumbnail } from '../src/features/media/components/ImageThumbnail';
import { workoutsApi } from '../src/features/workouts/api';
import { ExercisesTable } from '../src/features/workouts/components/ExercisesTable';
import {
  EXTERNAL_URL_MAX_LENGTH,
  externalUrlProblem,
  externalUrlWarning,
  imageSource,
  imageSourceNote,
  initialExternalImageUrl,
  initialUploadedImage,
  isHttpUrl,
} from '../src/features/workouts/image-logic';
import type {
  CreateExerciseInput,
  Exercise,
  UpdateExerciseInput,
  UploadedExerciseImage,
} from '../src/features/workouts/types';

const HEX = '0123456789abcdef0123456789abcdef';
const KEY = `onusfit/exercises/${HEX}.webp`;
const MEDIA_URL = `https://media.example.test/${KEY}`;
const EXTERNAL = 'https://cdn.example.com/squat.jpg';

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
  name: 'Barbell squat',
  description: null,
  category: 'strength',
  primaryMuscles: ['quads'],
  secondaryMuscles: [],
  equipment: 'barbell',
  difficulty: 'beginner',
  isCompound: true,
  instructions: ['Stand'],
  tips: [],
  // Optional in the admin type but required by the backend's view schema, so the fixture always has it.
  commonMistakes: [],
  videoUrl: null,
  imageUrl: null,
  imageKey: null,
  externalImageUrl: null,
  isSystem: true,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});

const markup = (element: React.ReactElement): string => renderToStaticMarkup(element);
const read = (relative: string) => readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');

// -------------------------------------------------------------------------------------------------
describe('Exercise images — the shared file rules match the backend policy', () => {
  it('uses the backend limit and types, whichever feature the field is used in', () => {
    assert.equal(IMAGE_MAX_BYTES, IMAGE_UPLOAD_MAX_BYTES);
    assert.deepEqual([...IMAGE_ACCEPTED_TYPES].sort(), [...ACCEPTED_UPLOAD_CONTENT_TYPES].sort());
    assert.match(IMAGE_ACCEPT, /\.heic,\.heif$/);
  });

  it('tells what is accepted and what the server does to the file', () => {
    const summary = imageUploadSummary();
    assert.match(summary, /JPEG, PNG, WebP or HEIC, up to 10\.0 MB/);
    assert.match(summary, /converted to an optimized WebP/);
    assert.match(summary, /camera and location details are removed/);
  });

  it('the advice when the server has no image storage names what the admin was doing', () => {
    assert.match(NOTIFICATION_UNCONFIGURED_ADVICE, /send this notification without an image/);
    assert.match(EXERCISE_UNCONFIGURED_ADVICE, /save this exercise with an image address instead/);
    const error = { code: 'IMAGE_STORAGE_NOT_CONFIGURED' };
    assert.equal(describeImageUploadFailure(error), NOTIFICATION_UNCONFIGURED_ADVICE);
    assert.equal(describeImageUploadFailure(error, EXERCISE_UNCONFIGURED_ADVICE), EXERCISE_UNCONFIGURED_ADVICE);
  });

  it('uploadImageFile passes the exercise advice through on a failed upload, and the resolved type on a good one', async () => {
    const heic = new File([new Uint8Array(10)], 'IMG_0042.HEIC', { type: '' });
    let sentType = '';
    const ok = await uploadImageFile(heic, async (_file, contentType) => {
      sentType = contentType;
      return { imageKey: KEY, imageUrl: MEDIA_URL };
    });
    assert.deepEqual(ok, { ok: true, image: { key: KEY, url: MEDIA_URL } });
    assert.equal(sentType, 'image/heic');

    const failed = await uploadImageFile(
      new Blob([new Uint8Array(10)], { type: 'image/png' }),
      async () => {
        throw new ApiError('not configured', 503, 'IMAGE_STORAGE_NOT_CONFIGURED');
      },
      EXERCISE_UNCONFIGURED_ADVICE,
    );
    assert.deepEqual(failed, { ok: false, error: EXERCISE_UNCONFIGURED_ADVICE });
  });
});

// -------------------------------------------------------------------------------------------------
describe('Exercise images — external addresses are http or https only, exactly as the backend decides', () => {
  const samples = [
    'https://cdn.example.com/a.jpg',
    'http://cdn.example.com/a.jpg',
    'HTTPS://CDN.EXAMPLE.COM/A.JPG',
    'https://cdn.example.com:8443/a.webp?v=2#f',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'file:///etc/passwd',
    'ftp://x.example/a.png',
    'blob:https://x.example/uuid',
    '//cdn.example.com/a.jpg',
    '/images/a.jpg',
    'cdn.example.com/a.jpg',
    'http://',
    'not a url',
    '',
    `https://cdn.example.com/${'a'.repeat(EXTERNAL_URL_MAX_LENGTH)}`,
  ];

  it('the console and the backend agree on every sample (the console must never accept what the backend refuses)', () => {
    for (const sample of samples) {
      assert.equal(isHttpUrl(sample), backendIsHttpUrl(sample), JSON.stringify(sample.slice(0, 60)));
    }
    assert.equal(EXTERNAL_URL_MAX_LENGTH, 2048);
  });

  it('every sample is judged the same by the form and by the backend request schemas', () => {
    const base = { name: 'Squat', instructions: ['Stand'], primaryMuscles: ['quads'], equipment: 'barbell', category: 'strength', difficulty: 'beginner' };
    for (const sample of samples.filter((value) => value !== '')) {
      const formAccepts = externalUrlProblem(sample, 'Image URL') === null;
      assert.equal(createExerciseAdminRequest.body.safeParse({ ...base, imageUrl: sample }).success, formAccepts, sample.slice(0, 60));
      assert.equal(updateExerciseAdminRequest.body.safeParse({ videoUrl: sample }).success, formAccepts, sample.slice(0, 60));
    }
  });

  it('an empty field is fine (it clears the address), and the problem names the field', () => {
    assert.equal(externalUrlProblem('', 'Image URL'), null);
    assert.equal(externalUrlProblem('   ', 'Image URL'), null);
    assert.equal(externalUrlProblem('javascript:alert(1)', 'Image URL'), 'Image URL must be a valid http or https URL.');
    assert.equal(externalUrlProblem('ftp://x.example/a', 'Video URL'), 'Video URL must be a valid http or https URL.');
    assert.match(externalUrlProblem(`https://x.example/${'a'.repeat(2100)}`, 'Image URL') ?? '', /at most 2048 characters/);
  });

  it('warns about http (accepted, but a release Android build will not load it) and says nothing about https', () => {
    assert.match(externalUrlWarning('http://cdn.example.com/a.jpg') ?? '', /Prefer https/);
    assert.match(externalUrlWarning('  HTTP://cdn.example.com/a.jpg ') ?? '', /Android/);
    assert.equal(externalUrlWarning('https://cdn.example.com/a.jpg'), null);
    assert.equal(externalUrlWarning(''), null);
    assert.equal(externalUrlWarning('http://'), null); // not an address at all: that is an error, not a warning
    assert.equal(externalUrlWarning('javascript:alert(1)'), null);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Exercise images — what the editor starts from', () => {
  it('the address field starts from the TYPED address, not from the picture that is displayed', () => {
    // The API's imageUrl is the displayed picture (here the uploaded one); the typed address is externalImageUrl.
    assert.equal(initialExternalImageUrl(exercise({ imageUrl: MEDIA_URL, imageKey: KEY, externalImageUrl: EXTERNAL })), EXTERNAL);
    assert.equal(initialExternalImageUrl(exercise({ imageUrl: MEDIA_URL, imageKey: KEY, externalImageUrl: null })), '');
    assert.equal(initialExternalImageUrl(exercise({ imageUrl: EXTERNAL, externalImageUrl: EXTERNAL })), EXTERNAL);
  });

  it('a backend that predates uploads (no externalImageUrl) still works: imageUrl was the typed address', () => {
    const old = exercise({ imageUrl: EXTERNAL });
    delete old.externalImageUrl;
    delete old.imageKey;
    assert.equal(initialExternalImageUrl(old), EXTERNAL);
    assert.equal(initialUploadedImage(old), null);
  });

  it('a new exercise starts empty', () => {
    assert.equal(initialExternalImageUrl(null), '');
    assert.equal(initialUploadedImage(null), null);
  });

  it('an uploaded image starts attached, with its own URL as the preview', () => {
    assert.deepEqual(initialUploadedImage(exercise({ imageKey: KEY, imageUrl: MEDIA_URL, externalImageUrl: EXTERNAL })), { key: KEY, url: MEDIA_URL });
  });

  it('does not use the external address as the preview of an upload (the media domain was not configured)', () => {
    assert.deepEqual(initialUploadedImage(exercise({ imageKey: KEY, imageUrl: EXTERNAL, externalImageUrl: EXTERNAL })), { key: KEY, url: null });
    assert.deepEqual(initialUploadedImage(exercise({ imageKey: KEY, imageUrl: null, externalImageUrl: null })), { key: KEY, url: null });
  });

  it('says which picture the app will show, and why', () => {
    const uploaded = { key: KEY, url: MEDIA_URL };
    assert.equal(imageSource(uploaded, EXTERNAL), 'uploaded');
    assert.equal(imageSource(uploaded, ''), 'uploaded');
    assert.equal(imageSource(null, EXTERNAL), 'external');
    assert.equal(imageSource(null, '  '), 'none');
    assert.equal(imageSource(null, 'javascript:alert(1)'), 'none');
    assert.match(imageSourceNote('uploaded'), /shows the uploaded image/);
    assert.match(imageSourceNote('external'), /image at this address/);
    assert.match(imageSourceNote('none'), /shows an icon/);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Exercise images — contract with the backend schemas', () => {
  const base = { name: 'Squat', instructions: ['Stand'], primaryMuscles: ['quads'], equipment: 'barbell', category: 'strength', difficulty: 'beginner' as const };

  it('the backend accepts what the form sends: an uploaded key, an external address, both, or neither', () => {
    const payloads: CreateExerciseInput[] = [
      { ...base, imageKey: KEY, imageUrl: null },
      { ...base, imageKey: null, imageUrl: EXTERNAL },
      { ...base, imageKey: KEY, imageUrl: EXTERNAL },
      { ...base, imageKey: null, imageUrl: null },
    ];
    for (const payload of payloads) {
      assert.equal(createExerciseAdminRequest.body.safeParse(payload).success, true, JSON.stringify(payload));
    }
    const update: UpdateExerciseInput = { imageKey: null };
    const parsed = updateExerciseAdminRequest.body.safeParse(update);
    assert.equal(parsed.success && parsed.data.imageKey, null);
  });

  it('the backend refuses a key that is not an exercise key (the key field cannot carry an address)', () => {
    for (const bad of [`onusfit/notifications/${HEX}.webp`, `https://media.example.test/${KEY}`, `onusfit/exercises/${HEX}.push.jpg`]) {
      assert.equal(createExerciseAdminRequest.body.safeParse({ ...base, imageKey: bad }).success, false, bad);
      assert.equal(isExerciseImageKey(bad), false, bad);
    }
    assert.equal(isExerciseImageKey(KEY), true);
  });

  it('the view the admin reads carries the three image fields', () => {
    const wire = exerciseViewSchema.parse({ ...exercise({ imageUrl: MEDIA_URL, imageKey: KEY, externalImageUrl: EXTERNAL }) });
    assert.equal(wire.imageUrl, MEDIA_URL);
    assert.equal(wire.imageKey, KEY);
    assert.equal(wire.externalImageUrl, EXTERNAL);
  });

  it('the upload response matches the type the console reads', () => {
    const uploaded: UploadedExerciseImage = {
      imageKey: KEY,
      imageUrl: MEDIA_URL,
      contentType: 'image/webp',
      sizeBytes: 12_345,
      width: 1600,
      height: 1200,
      source: { format: 'heic', bytes: 2_000_000, width: 4032, height: 3024 },
    };
    assert.deepEqual(uploadedExerciseImageSchema.parse(uploaded), uploaded);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Exercise images — the upload request', () => {
  type Call = { url: string; init: RequestInit };

  async function withFetch<T>(respond: (call: Call) => Response, run: (calls: Call[]) => Promise<T>): Promise<T> {
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
  const uploaded = { imageKey: KEY, imageUrl: MEDIA_URL, contentType: 'image/webp', sizeBytes: 4, width: 2, height: 2, source: { format: 'png', bytes: 4, width: 2, height: 2 } };

  it('posts the raw file to the exercise image endpoint with its own type, not JSON', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    await withFetch(
      () => json(201, { success: true, data: uploaded, message: 'Image uploaded' }),
      async (calls) => {
        const result = await workoutsApi.uploadExerciseImage(file);
        assert.deepEqual(result, uploaded);
        const { url, init } = calls[0]!;
        assert.match(url, /\/workouts\/exercises\/images$/);
        assert.equal(init.method, 'POST');
        assert.strictEqual(init.body, file); // the file itself, not a re-encoded copy
        const headers = new Headers(init.headers);
        assert.equal(headers.get('Content-Type'), 'image/png');
        assert.equal(headers.get('X-Panel-Id'), 'fitonus-admin');
      },
    );
  });

  it('posts a HEIC photo with the resolved type, not the empty one the browser reported', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'IMG_0042.HEIC', { type: '' });
    await withFetch(
      () => json(201, { success: true, data: uploaded, message: 'Image uploaded' }),
      async (calls) => {
        await workoutsApi.uploadExerciseImage(file, 'image/heic');
        assert.equal(new Headers(calls[0]!.init.headers).get('Content-Type'), 'image/heic');
      },
    );
  });

  it('carries the key in the save request and never a URL for the upload', async () => {
    await withFetch(
      () => json(200, { success: true, data: exercise(), message: 'ok' }),
      async (calls) => {
        const body: UpdateExerciseInput = { name: 'Squat', imageKey: KEY, imageUrl: EXTERNAL };
        await workoutsApi.updateExercise('8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01', body);
        const sent = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
        assert.equal(sent.imageKey, KEY);
        assert.equal(sent.imageUrl, EXTERNAL);
        assert.equal(new Headers(calls[0]!.init.headers).get('Content-Type'), 'application/json');
      },
    );
  });

  it('turns the server explanations into advice an admin can act on', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    const cases: [number, string, string, RegExp][] = [
      [413, 'PAYLOAD_TOO_LARGE', 'The image is larger than 10 MB.', /larger than 10 MB/],
      [422, 'INVALID_IMAGE', 'The image file looks damaged or incomplete.', /damaged or incomplete/],
      [415, 'UNSUPPORTED_MEDIA_TYPE', 'HEIC images are not enabled on this server.', /HEIC images are not enabled/],
      [503, 'IMAGE_STORAGE_NOT_CONFIGURED', 'Image storage is not configured.', /save this exercise with an image address instead/],
      [503, 'IMAGE_STORAGE_UNAVAILABLE', 'The image could not be saved right now.', /Try again in a moment/],
    ];
    for (const [status, code, message, expected] of cases) {
      await withFetch(
        () => json(status, { success: false, error: { code, message, requestId: 'r1' } }),
        async () => {
          const outcome = await uploadImageFile(file, (f, type) => workoutsApi.uploadExerciseImage(f, type), EXERCISE_UNCONFIGURED_ADVICE);
          assert.ok(!outcome.ok);
          assert.match(outcome.error, expected, code);
        },
      );
    }
  });
});

// -------------------------------------------------------------------------------------------------
describe('Exercise images — what the admin sees', () => {
  const noop = () => undefined;
  const upload = async () => ({ imageKey: KEY, imageUrl: MEDIA_URL });

  it('the shared field says what it is for, and what the server does to the file', () => {
    const html = markup(
      React.createElement(ImageUploadField, {
        value: null,
        onChange: noop,
        upload,
        label: 'Exercise image',
        previewAlt: 'Preview of the exercise image',
        hint: 'Shown in the exercise library.',
      }),
    );
    assert.match(html, /Exercise image/);
    assert.match(html, /\(optional\)/);
    assert.match(html, /Add image/);
    assert.match(html, /JPEG, PNG, WebP or HEIC, up to 10\.0 MB/);
    assert.match(html, /Shown in the exercise library\./);
    assert.ok(html.includes(`accept="${IMAGE_ACCEPT}"`));
  });

  it('shows the uploaded picture with Replace and Remove once there is one', () => {
    const html = markup(
      React.createElement(ImageUploadField, {
        value: { key: KEY, url: MEDIA_URL },
        onChange: noop,
        upload,
        previewAlt: 'Preview of the exercise image',
        hint: '',
      }),
    );
    assert.match(html, /Replace image/);
    assert.match(html, /Remove image/);
    assert.ok(html.includes(MEDIA_URL));
    assert.match(html, /alt="Preview of the exercise image"/);
  });

  it('gives two fields on one page their own label ids (the exercise form can sit beside others)', () => {
    const field = () =>
      markup(React.createElement(ImageUploadField, { value: null, onChange: noop, upload, previewAlt: 'x', hint: '' }));
    const idOf = (html: string) => /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    assert.ok(idOf(field()));
    // useId is stable per render position and unique within one tree.
    const both = markup(
      React.createElement(
        'div',
        null,
        React.createElement(ImageUploadField, { value: null, onChange: noop, upload, previewAlt: 'a', hint: '' }),
        React.createElement(ImageUploadField, { value: null, onChange: noop, upload, previewAlt: 'b', hint: '' }),
      ),
    );
    const ids = [...both.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
  });

  it('the table shows the stored picture as the thumbnail for an exercise that has one, and an icon for one that has not', () => {
    const html = markup(
      React.createElement(ExercisesTable, {
        exercises: [
          exercise({ id: 'e0000000-0000-4000-8000-000000000001', name: 'With picture', imageUrl: MEDIA_URL, imageKey: KEY }),
          exercise({ id: '11111111-2222-4333-8444-555555555555', name: 'Without picture', imageUrl: null }),
        ],
        isLoading: false,
        error: null,
        meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
        limit: 10,
        onLimitChange: noop,
        onPageChange: noop,
        onEditExercise: noop,
        onDeleteExercise: noop,
      }),
    );
    assert.equal((html.match(/<img/g) ?? []).length, 1);
    assert.ok(html.includes(MEDIA_URL));
    assert.match(html, /alt=""/); // decorative: the name sits next to it
  });

  it('a thumbnail is decorative and square', () => {
    const html = markup(React.createElement(ImageThumbnail, { imageUrl: MEDIA_URL, sizeClass: 'h-9 w-9' }));
    assert.match(html, /<img/);
    assert.match(html, /alt=""/);
    assert.match(html, /h-9 w-9/);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Exercise images — wiring and safety', () => {
  const modal = read('features/workouts/components/ExerciseModal.tsx');
  const table = read('features/workouts/components/ExercisesTable.tsx');

  it('the form uploads through the workouts API client and keeps the result in state', () => {
    assert.match(modal, /<ImageUploadField/);
    assert.match(modal, /upload=\{workoutsApi\.uploadExerciseImage\}/);
    assert.match(modal, /unconfiguredAdvice=\{EXERCISE_UNCONFIGURED_ADVICE\}/);
    assert.match(modal, /onBusyChange=\{setImageBusy\}/);
    assert.doesNotMatch(modal, /\bfetch\(/);
  });

  it('the form starts from the typed address and the uploaded image, never from the displayed picture', () => {
    assert.match(modal, /useState\(initialExternalImageUrl\(exercise\)\)/);
    assert.match(modal, /useState<UploadedImageRef \| null>\(initialUploadedImage\(exercise\)\)/);
    assert.doesNotMatch(modal, /useState\(exercise\?\.imageUrl/);
  });

  it('the save request carries the key (null removes the upload) and still the external address and the video', () => {
    assert.match(modal, /imageKey: image\?\.key \?\? null/);
    assert.match(modal, /imageUrl: imageUrl\.trim\(\) \|\| null/);
    assert.match(modal, /videoUrl: videoUrl\.trim\(\) \|\| null/);
  });

  it('saving is held while a picture is uploading, so the exercise is never saved without it', () => {
    assert.match(modal, /if \(imageBusy\) return;/);
    assert.match(modal, /disabled=\{isSubmitting \|\| imageBusy\}/);
  });

  it('the addresses are validated as http or https, and an http address is warned about, not refused', () => {
    assert.match(modal, /externalUrlProblem\(videoUrl, 'Video URL'\)/);
    assert.match(modal, /externalUrlProblem\(imageUrl, 'Image URL'\)/);
    assert.match(modal, /externalUrlWarning\(imageUrl\)/);
    assert.match(modal, /alert alert-warning/);
  });

  it('the form tells the admin which picture the app will show', () => {
    assert.match(modal, /imageSourceNote\(imageSource\(image, imageUrl\)\)/);
  });

  it('the table shows the effective picture as a thumbnail, with the dumbbell as the fallback', () => {
    assert.match(table, /ex\.imageUrl \? \(/);
    assert.match(table, /<ImageThumbnail/);
    assert.match(table, /fallback=\{<Dumbbell/);
  });

  it('the exercise upload is an audit filter option', () => {
    assert.match(read('features/audit-logs/components/AuditLogsFilterBar.tsx'), /value="workout\.exercise\.image_upload"/);
  });

  it('the notification field is a thin wrapper over the same shared field (nothing was lost in the move)', () => {
    const wrapper = read('features/notifications/components/NotificationImageField.tsx');
    assert.match(wrapper, /<ImageUploadField/);
    assert.match(wrapper, /upload=\{notificationsApi\.uploadImage\}/);
    assert.ok(wrapper.split('\n').length < 45, 'the wrapper holds no behaviour of its own');
  });
});

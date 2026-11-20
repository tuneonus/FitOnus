import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isWorkoutCoverKey } from '../../backend/src/modules/workouts/domain/workout-cover';
import {
  createAdminTemplateRequest,
  updateAdminTemplateRequest,
  uploadedWorkoutCoverSchema,
  workoutPlanDetailSchema,
} from '../../backend/src/modules/workouts/interface/workouts.schemas';
import {
  TEMPLATE_COVER_UNCONFIGURED_ADVICE,
  describeImageUploadFailure,
  uploadImageFile,
} from '../src/features/media/image-upload';
import { ApiError } from '../src/lib/api-client';
import { workoutsApi } from '../src/features/workouts/api';
import { WorkoutTemplateModal } from '../src/features/workouts/components/WorkoutTemplateModal';
import { WorkoutTemplatesTable } from '../src/features/workouts/components/WorkoutTemplatesTable';
import { coverNote, initialTemplateCover } from '../src/features/workouts/image-logic';
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
  UploadedTemplateCover,
  WorkoutTemplate,
} from '../src/features/workouts/types';

const HEX = '0123456789abcdef0123456789abcdef';
const KEY = `onusfit/workouts/${HEX}.webp`;
const MEDIA_URL = `https://media.example.test/${KEY}`;
const TEMPLATE_ID = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';
const EXERCISE_ID = 'e0000000-0000-4000-8000-000000000001';

const template = (overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate => ({
  id: TEMPLATE_ID,
  userId: null,
  name: 'Full body starter',
  description: 'Three days a week',
  isTemplate: true,
  difficulty: 'beginner',
  estimatedDurationMinutes: 45,
  tags: ['starter'],
  coverImageUrl: null,
  coverImageKey: null,
  exerciseCount: 1,
  exercises: [],
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});

const markup = (element: React.ReactElement): string => renderToStaticMarkup(element);
const read = (relative: string) => readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');
const noop = () => undefined;

// -------------------------------------------------------------------------------------------------
describe('Workout covers — contract with the backend schemas', () => {
  const base = {
    name: 'Starter',
    exercises: [{ exerciseId: EXERCISE_ID, orderIndex: 0, targetSets: 3, targetReps: '8-12', restSeconds: 60 }],
  };

  it('the backend accepts what the form sends: a cover key, or null, or nothing', () => {
    const payloads: CreateTemplateInput[] = [
      { ...base, coverImageKey: KEY },
      { ...base, coverImageKey: null },
      { ...base },
    ];
    for (const payload of payloads) {
      assert.equal(createAdminTemplateRequest.body.safeParse(payload).success, true, JSON.stringify(payload));
    }
    const removal: UpdateTemplateInput = { coverImageKey: null };
    const parsed = updateAdminTemplateRequest.body.safeParse(removal);
    assert.equal(parsed.success && parsed.data.coverImageKey, null);
    // Omitted means unchanged: the backend must see `undefined`, not null.
    const untouched = updateAdminTemplateRequest.body.safeParse({ name: 'Renamed' });
    assert.equal(untouched.success && untouched.data.coverImageKey, undefined);
  });

  it('the backend refuses a key that is not a workout cover key (the key field cannot carry an address)', () => {
    for (const bad of [
      `onusfit/exercises/${HEX}.webp`,
      `onusfit/notifications/${HEX}.webp`,
      `https://media.example.test/${KEY}`,
      `onusfit/workouts/${HEX}.push.jpg`,
    ]) {
      assert.equal(createAdminTemplateRequest.body.safeParse({ ...base, coverImageKey: bad }).success, false, bad);
      assert.equal(updateAdminTemplateRequest.body.safeParse({ coverImageKey: bad }).success, false, bad);
      assert.equal(isWorkoutCoverKey(bad), false, bad);
    }
    assert.equal(isWorkoutCoverKey(KEY), true);
  });

  it('the view the admin reads carries the two cover fields', () => {
    const wire = workoutPlanDetailSchema.parse({
      id: TEMPLATE_ID,
      userId: null,
      name: 'Starter',
      description: null,
      workoutType: 'strength',
      estimatedDurationMinutes: 45,
      difficulty: 'beginner',
      isTemplate: true,
      isAiGenerated: false,
      tags: [],
      coverImageUrl: MEDIA_URL,
      coverImageKey: KEY,
      exercisesCount: 0,
      exercises: [],
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
    });
    assert.equal(wire.coverImageUrl, MEDIA_URL);
    assert.equal(wire.coverImageKey, KEY);
  });

  it('the upload response matches the type the console reads', () => {
    const uploaded: UploadedTemplateCover = {
      imageKey: KEY,
      imageUrl: MEDIA_URL,
      contentType: 'image/webp',
      sizeBytes: 12_345,
      width: 1600,
      height: 900,
      source: { format: 'jpeg', bytes: 2_000_000, width: 4000, height: 2250 },
    };
    assert.deepEqual(uploadedWorkoutCoverSchema.parse(uploaded), uploaded);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Workout covers — the upload request', () => {
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
  const uploaded = {
    imageKey: KEY,
    imageUrl: MEDIA_URL,
    contentType: 'image/webp',
    sizeBytes: 4,
    width: 2,
    height: 2,
    source: { format: 'png', bytes: 4, width: 2, height: 2 },
  };

  it('posts the raw file to the template cover endpoint with its own type, not JSON', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    await withFetch(
      () => json(201, { success: true, data: uploaded, message: 'Image uploaded' }),
      async (calls) => {
        const result = await workoutsApi.uploadTemplateCover(file);
        assert.deepEqual(result, uploaded);
        const { url, init } = calls[0]!;
        assert.match(url, /\/workouts\/templates\/images$/);
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
        await workoutsApi.uploadTemplateCover(file, 'image/heic');
        assert.equal(new Headers(calls[0]!.init.headers).get('Content-Type'), 'image/heic');
      },
    );
  });

  it('carries the cover key in the save request, and null to remove it', async () => {
    await withFetch(
      () => json(200, { success: true, data: template(), message: 'ok' }),
      async (calls) => {
        await workoutsApi.updateTemplate(TEMPLATE_ID, { name: 'Starter', coverImageKey: KEY });
        await workoutsApi.updateTemplate(TEMPLATE_ID, { coverImageKey: null });
        const first = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
        const second = JSON.parse(calls[1]!.init.body as string) as Record<string, unknown>;
        assert.equal(first.coverImageKey, KEY);
        assert.equal(second.coverImageKey, null);
        assert.equal(new Headers(calls[0]!.init.headers).get('Content-Type'), 'application/json');
      },
    );
  });

  it('turns the server explanations into advice an admin can act on, naming a routine', async () => {
    const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
    const outcome = await uploadImageFile(
      file,
      async () => {
        throw new ApiError('not set up', 503, 'IMAGE_STORAGE_NOT_CONFIGURED');
      },
      TEMPLATE_COVER_UNCONFIGURED_ADVICE,
    );
    assert.deepEqual(outcome, { ok: false, error: TEMPLATE_COVER_UNCONFIGURED_ADVICE });
    assert.match(TEMPLATE_COVER_UNCONFIGURED_ADVICE, /without a cover/);
    assert.equal(
      describeImageUploadFailure({ code: 'IMAGE_STORAGE_UNAVAILABLE' }, TEMPLATE_COVER_UNCONFIGURED_ADVICE),
      'The image could not be saved right now. Try again in a moment.',
    );
  });
});

// -------------------------------------------------------------------------------------------------
describe('Workout covers — what the editor starts from', () => {
  it('a new routine starts with no cover', () => {
    assert.equal(initialTemplateCover(null), null);
    assert.equal(initialTemplateCover(template()), null);
  });

  it('an existing cover starts attached, with its own URL as the preview', () => {
    assert.deepEqual(initialTemplateCover(template({ coverImageKey: KEY, coverImageUrl: MEDIA_URL })), {
      key: KEY,
      url: MEDIA_URL,
    });
  });

  it('keeps the key when the media domain is not configured (no URL, no preview), so saving never drops the cover', () => {
    assert.deepEqual(initialTemplateCover(template({ coverImageKey: KEY, coverImageUrl: null })), {
      key: KEY,
      url: null,
    });
  });

  it('a backend that predates covers (fields absent) gives no cover', () => {
    const legacy = template();
    delete legacy.coverImageKey;
    delete legacy.coverImageUrl;
    assert.equal(initialTemplateCover(legacy), null);
  });

  it('says what the member app does with the cover', () => {
    assert.match(coverNote({ key: KEY, url: MEDIA_URL }), /routine card/);
    assert.match(coverNote(null), /plain routine card/);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Workout covers — what the admin sees', () => {
  const modal = (tpl: WorkoutTemplate | null) =>
    markup(
      React.createElement(WorkoutTemplateModal, {
        isOpen: true,
        onClose: noop,
        template: tpl,
        availableExercises: [],
        onSubmit: async () => undefined,
      }),
    );

  it('the editor offers "Add image" for a routine without a cover', () => {
    const html = modal(template());
    assert.match(html, /Cover image/);
    assert.match(html, /\(optional\)/);
    assert.match(html, /Add image/);
    assert.match(html, /plain routine card/);
    assert.doesNotMatch(html, /Replace image/);
  });

  it('the editor shows the cover with Replace and Remove once a routine has one', () => {
    const html = modal(template({ coverImageKey: KEY, coverImageUrl: MEDIA_URL }));
    assert.match(html, /Replace image/);
    assert.match(html, /Remove image/);
    assert.ok(html.includes(MEDIA_URL));
    assert.match(html, /alt="Preview of the routine cover"/);
  });

  it('tells the admin the picture is public', () => {
    assert.match(modal(template()), /Uploaded images are public/);
  });

  const table = (templates: WorkoutTemplate[]) =>
    markup(
      React.createElement(WorkoutTemplatesTable, {
        templates,
        isLoading: false,
        error: null,
        meta: { page: 1, limit: 10, total: templates.length, totalPages: 1 },
        limit: 10,
        onLimitChange: noop,
        onPageChange: noop,
        onEditTemplate: noop,
        onDeleteTemplate: noop,
        onOpenCreateModal: noop,
      }),
    );

  it('the table shows the cover as the thumbnail for a routine that has one, and an icon for one that has not', () => {
    const html = table([
      template({ name: 'With cover', coverImageKey: KEY, coverImageUrl: MEDIA_URL }),
      template({ id: '11111111-2222-4333-8444-555555555555', name: 'Without cover' }),
    ]);
    assert.equal((html.match(/<img/g) ?? []).length, 1);
    assert.ok(html.includes(MEDIA_URL));
    assert.match(html, /alt=""/); // decorative: the name sits next to it
  });

  it('a routine from a backend that predates covers still renders, with the icon', () => {
    const legacy = template();
    delete legacy.coverImageKey;
    delete legacy.coverImageUrl;
    const html = table([legacy]);
    assert.match(html, /Full body starter/);
    assert.equal((html.match(/<img/g) ?? []).length, 0);
  });
});

// -------------------------------------------------------------------------------------------------
describe('Workout covers — wiring and safety', () => {
  const modal = read('features/workouts/components/WorkoutTemplateModal.tsx');
  const table = read('features/workouts/components/WorkoutTemplatesTable.tsx');

  it('the form uploads through the workouts API client and keeps the result in state', () => {
    assert.match(modal, /<ImageUploadField/);
    assert.match(modal, /upload=\{workoutsApi\.uploadTemplateCover\}/);
    assert.match(modal, /unconfiguredAdvice=\{TEMPLATE_COVER_UNCONFIGURED_ADVICE\}/);
    assert.match(modal, /onBusyChange=\{setCoverBusy\}/);
    assert.doesNotMatch(modal, /\bfetch\(/);
  });

  it('the form starts from the stored cover, never from a typed address', () => {
    assert.match(modal, /useState<UploadedImageRef \| null>\(initialTemplateCover\(template\)\)/);
  });

  it('the save request carries the key, and null removes the cover', () => {
    assert.match(modal, /coverImageKey: cover\?\.key \?\? null/);
  });

  it('saving is held while a cover is uploading, so the routine is never saved without it', () => {
    assert.match(modal, /if \(coverBusy\) return;/);
    assert.match(modal, /disabled=\{isSubmitting \|\| coverBusy\}/);
  });

  it('the table shows the cover as a thumbnail, with the layers icon as the fallback', () => {
    assert.match(table, /tpl\.coverImageUrl \? \(/);
    assert.match(table, /<ImageThumbnail/);
    assert.match(table, /fallback=\{<Layers/);
  });

  it('the cover upload is an audit filter option', () => {
    assert.match(
      read('features/audit-logs/components/AuditLogsFilterBar.tsx'),
      /value="workout\.template\.cover_upload"/,
    );
  });
});

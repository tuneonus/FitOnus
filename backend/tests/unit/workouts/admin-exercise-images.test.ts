import { describe, expect, it, vi } from 'vitest';
import { AdminManageExerciseUseCase } from '../../../src/modules/workouts/application/use-cases/admin-manage-exercise.js';
import type {
  IExerciseRepository,
  IWorkoutAuditLogger,
} from '../../../src/modules/workouts/application/ports.js';
import { Exercise, type ExerciseProps } from '../../../src/modules/workouts/domain/exercise.js';
import { createFeatureImageUrlResolver } from '../../../src/shared/images/public-image-url.js';
import type { PublicObjectStore } from '../../../src/shared/storage/object-store.js';

const ADMIN = 'a-1';
const ORIGIN = 'https://media.example.test';
const KEY = 'onusfit/exercises/0123456789abcdef0123456789abcdef.webp';
const OTHER_KEY = 'onusfit/exercises/fedcba9876543210fedcba9876543210.webp';
const EXTERNAL = 'https://cdn.example.com/squat.jpg';
const resolveUrl = createFeatureImageUrlResolver(ORIGIN, 'exercises');

/** An in-memory repository with the same patch semantics as the real one (undefined = unchanged, null = clear). */
class MemoryRepo implements IExerciseRepository {
  rows = new Map<string, Exercise>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async list() {
    return { exercises: [...this.rows.values()], total: this.rows.size };
  }
  async create(exercise: Exercise) {
    this.rows.set(exercise.id, exercise);
    return exercise;
  }
  async update(id: string, patch: Partial<ExerciseProps>) {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const next = new Exercise({
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    } as ExerciseProps);
    this.rows.set(id, next);
    return next;
  }
  async softDelete(id: string) {
    const existing = this.rows.get(id);
    if (!existing) return false;
    // Like the real repository: the row stays, marked deleted, with everything it held (including its image key).
    this.rows.set(id, new Exercise({ ...existing, deletedAt: new Date() } as ExerciseProps));
    return true;
  }
  async countAll() {
    return this.rows.size;
  }
}

const baseInput = {
  adminId: ADMIN,
  name: 'Squat',
  instructions: ['Stand up'],
  primaryMuscles: ['quads'],
  equipment: 'barbell',
  category: 'strength',
  difficulty: 'beginner' as const,
};

function setup(options: { store?: PublicObjectStore | null | 'absent' } = {}) {
  const repo = new MemoryRepo();
  const audit = { logAction: vi.fn(async (..._args: unknown[]) => undefined) } satisfies IWorkoutAuditLogger;
  const store = {
    put: vi.fn(async () => undefined),
    exists: vi.fn(async (_key: string) => true),
  } satisfies PublicObjectStore;
  const logger = { warn: vi.fn() };
  const images =
    options.store === 'absent'
      ? undefined
      : { store: options.store === undefined ? store : options.store, resolveUrl, logger };
  const useCase = new AdminManageExerciseUseCase(repo, audit, images);
  return { useCase, repo, audit, store, logger };
}

describe('creating an exercise with an uploaded image', () => {
  it('checks the object exists, saves the key, and answers with the uploaded image as the picture', async () => {
    const { useCase, store, repo } = setup();
    const view = await useCase.create({ ...baseInput, imageKey: KEY });
    expect(store.exists).toHaveBeenCalledTimes(1);
    expect(store.exists).toHaveBeenCalledWith(KEY);
    expect(view).toMatchObject({ imageKey: KEY, imageUrl: `${ORIGIN}/${KEY}`, externalImageUrl: null });
    expect([...repo.rows.values()][0]!.imageKey).toBe(KEY);
  });

  it('keeps both: the uploaded image shows, the external address stays as the fallback', async () => {
    const { useCase } = setup();
    const view = await useCase.create({ ...baseInput, imageKey: KEY, imageUrl: EXTERNAL });
    expect(view).toMatchObject({ imageUrl: `${ORIGIN}/${KEY}`, imageKey: KEY, externalImageUrl: EXTERNAL });
  });

  it('refuses a key whose object is not in storage (422) and saves nothing', async () => {
    const { useCase, store, repo, audit } = setup();
    store.exists.mockResolvedValueOnce(false);
    await expect(useCase.create({ ...baseInput, imageKey: KEY })).rejects.toMatchObject({
      kind: 'unprocessable',
      code: 'IMAGE_NOT_FOUND',
    });
    expect(repo.rows.size).toBe(0);
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('answers 503 when storage cannot be checked, without leaking why, and saves nothing', async () => {
    const { useCase, store, repo, logger } = setup();
    store.exists.mockRejectedValueOnce(new Error('R2 head failed secret=hunter2'));
    const error = await useCase.create({ ...baseInput, imageKey: KEY }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unavailable', code: 'IMAGE_STORAGE_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect((error as Error).message).not.toContain('hunter2');
    expect(repo.rows.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['storage is not configured', { store: null } as const],
    ['image support is not wired at all', { store: 'absent' } as const],
  ])('refuses an image key when %s (503), and saves nothing', async (_name, options) => {
    const { useCase, repo } = setup(options);
    await expect(useCase.create({ ...baseInput, imageKey: KEY })).rejects.toMatchObject({
      kind: 'unavailable',
      code: 'IMAGE_STORAGE_NOT_CONFIGURED',
    });
    expect(repo.rows.size).toBe(0);
  });

  it('an exercise without an uploaded image is unaffected by storage: no call, no refusal', async () => {
    for (const options of [{}, { store: null } as const, { store: 'absent' } as const]) {
      const { useCase, store } = setup(options);
      const view = await useCase.create({ ...baseInput, imageUrl: EXTERNAL });
      expect(view).toMatchObject({ imageKey: null, imageUrl: EXTERNAL });
      expect(store.exists).not.toHaveBeenCalled();
    }
  });

  it('records in the audit log that an image is attached, without the key or any URL', async () => {
    const { useCase, audit } = setup();
    await useCase.create({ ...baseInput, imageKey: KEY, imageUrl: EXTERNAL });
    expect(audit.logAction).toHaveBeenCalledWith(
      ADMIN,
      'workout.exercise.create',
      expect.objectContaining({ hasUploadedImage: true }),
      null,
      undefined,
      undefined,
    );
    expect(JSON.stringify(audit.logAction.mock.calls)).not.toContain('http');
    expect(JSON.stringify(audit.logAction.mock.calls)).not.toContain(KEY);
  });
});

describe('updating an exercise', () => {
  async function withExercise(
    options: Parameters<typeof setup>[0] = {},
    create: Record<string, unknown> = {},
  ) {
    const ctx = setup(options);
    const created = await ctx.useCase.create({ ...baseInput, ...create });
    ctx.store.exists.mockClear();
    ctx.audit.logAction.mockClear();
    return { ...ctx, id: created.id };
  }

  it('attaches an uploaded image after checking it exists', async () => {
    const { useCase, store, id } = await withExercise({}, { imageUrl: EXTERNAL });
    const view = await useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: KEY });
    expect(store.exists).toHaveBeenCalledWith(KEY);
    expect(view).toMatchObject({ imageKey: KEY, imageUrl: `${ORIGIN}/${KEY}`, externalImageUrl: EXTERNAL });
  });

  it('replaces the uploaded image with another, leaving the old object alone', async () => {
    const { useCase, store, id } = await withExercise({}, { imageKey: KEY });
    store.exists.mockClear();
    const view = await useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: OTHER_KEY });
    expect(store.exists).toHaveBeenCalledWith(OTHER_KEY);
    expect(view.imageKey).toBe(OTHER_KEY);
    // This use case has no way to delete anything: the store it is given only has put and exists.
    expect(store.put).not.toHaveBeenCalled();
  });

  it('removes the uploaded image with null, and the external address shows again', async () => {
    const { useCase, id } = await withExercise({}, { imageKey: KEY, imageUrl: EXTERNAL });
    const view = await useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: null });
    expect(view).toMatchObject({ imageKey: null, imageUrl: EXTERNAL, externalImageUrl: EXTERNAL });
  });

  it('removing both leaves the exercise with no picture', async () => {
    const { useCase, id } = await withExercise({}, { imageKey: KEY, imageUrl: EXTERNAL });
    const view = await useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: null, imageUrl: null });
    expect([view.imageUrl, view.imageKey, view.externalImageUrl]).toEqual([null, null, null]);
  });

  it('leaves the image alone when the request does not mention it (an edit of other fields)', async () => {
    const { useCase, store, id } = await withExercise({}, { imageKey: KEY, imageUrl: EXTERNAL });
    const view = await useCase.update({ adminId: ADMIN, exerciseId: id, name: 'Back squat' });
    expect(view).toMatchObject({ name: 'Back squat', imageKey: KEY, externalImageUrl: EXTERNAL });
    expect(store.exists).not.toHaveBeenCalled();
  });

  it('does not ask storage again for a key the exercise already has: editing text never depends on R2', async () => {
    const { useCase, store, id } = await withExercise({}, { imageKey: KEY });
    store.exists.mockRejectedValue(new Error('R2 is down'));
    const view = await useCase.update({ adminId: ADMIN, exerciseId: id, name: 'Back squat', imageKey: KEY });
    expect(view).toMatchObject({ name: 'Back squat', imageKey: KEY });
    expect(store.exists).not.toHaveBeenCalled();
  });

  it('refuses a new key that is not in storage (422) and changes nothing', async () => {
    const { useCase, store, repo, id } = await withExercise({}, { imageKey: KEY });
    store.exists.mockResolvedValueOnce(false);
    await expect(
      useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: OTHER_KEY, name: 'Changed' }),
    ).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
    });
    expect(repo.rows.get(id)).toMatchObject({ imageKey: KEY, name: 'Squat' });
  });

  it('refuses a new key when storage is not configured (503), but still lets a text-only edit through', async () => {
    const { useCase, id } = await withExercise({ store: null });
    await expect(useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: KEY })).rejects.toMatchObject({
      code: 'IMAGE_STORAGE_NOT_CONFIGURED',
    });
    await expect(
      useCase.update({ adminId: ADMIN, exerciseId: id, name: 'Back squat' }),
    ).resolves.toMatchObject({ name: 'Back squat' });
  });

  it('removing an uploaded image works even when storage is not configured', async () => {
    const { repo, id } = await withExercise({}, { imageKey: KEY });
    // Same data, now seen by an instance without storage.
    const offline = new AdminManageExerciseUseCase(
      repo,
      { logAction: vi.fn(async () => undefined) },
      undefined,
    );
    await expect(offline.update({ adminId: ADMIN, exerciseId: id, imageKey: null })).resolves.toMatchObject({
      imageKey: null,
    });
  });

  describe('an older admin client that sends the displayed picture back as the external address', () => {
    it('does not write the uploaded image URL into image_url', async () => {
      const { useCase, repo, id } = await withExercise({}, { imageKey: KEY });
      const view = await useCase.update({
        adminId: ADMIN,
        exerciseId: id,
        imageUrl: `${ORIGIN}/${KEY}`,
        name: 'Back squat',
      });
      expect(repo.rows.get(id)!.imageUrl).toBeNull();
      expect(view).toMatchObject({ imageKey: KEY, externalImageUrl: null, name: 'Back squat' });
    });

    it('keeps an existing external address untouched in that case', async () => {
      const { useCase, repo, id } = await withExercise({}, { imageKey: KEY, imageUrl: EXTERNAL });
      await useCase.update({ adminId: ADMIN, exerciseId: id, imageUrl: `${ORIGIN}/${KEY}` });
      expect(repo.rows.get(id)!.imageUrl).toBe(EXTERNAL);
    });

    it('also ignores the URL of the key being set in the same request', async () => {
      const { useCase, repo, id } = await withExercise({}, { imageKey: KEY });
      await useCase.update({
        adminId: ADMIN,
        exerciseId: id,
        imageKey: OTHER_KEY,
        imageUrl: `${ORIGIN}/${OTHER_KEY}`,
      });
      expect(repo.rows.get(id)!.imageUrl).toBeNull();
    });

    it('a genuine external address is still saved', async () => {
      const { useCase, repo, id } = await withExercise({}, { imageKey: KEY });
      await useCase.update({ adminId: ADMIN, exerciseId: id, imageUrl: EXTERNAL });
      expect(repo.rows.get(id)!.imageUrl).toBe(EXTERNAL);
    });
  });

  it('records whether an image is attached and whether it changed, without any key or URL', async () => {
    const { useCase, audit, id } = await withExercise({}, { imageKey: KEY });
    await useCase.update({ adminId: ADMIN, exerciseId: id, imageKey: OTHER_KEY });
    await useCase.update({ adminId: ADMIN, exerciseId: id, name: 'Renamed' });
    const details = audit.logAction.mock.calls.map((call) => call[2]);
    expect(details[0]).toMatchObject({ hasUploadedImage: true, imageChanged: true });
    expect(details[1]).toMatchObject({ hasUploadedImage: true, imageChanged: false });
    expect(JSON.stringify(details)).not.toContain('onusfit');
  });

  it('deleting an exercise keeps its image key and touches no object', async () => {
    const { useCase, store, repo, id } = await withExercise({}, { imageKey: KEY });
    await useCase.delete(ADMIN, id);
    // Soft delete: the row is marked deleted and still holds its key, and nothing was written to or asked of storage.
    expect(repo.rows.get(id)).toMatchObject({ imageKey: KEY });
    expect(repo.rows.get(id)!.deletedAt).not.toBeNull();
    expect(store.put).not.toHaveBeenCalled();
    expect(store.exists).not.toHaveBeenCalled();
  });
});

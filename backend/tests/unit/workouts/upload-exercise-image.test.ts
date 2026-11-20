import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { UploadExerciseImageUseCase } from '../../../src/modules/workouts/application/use-cases/upload-exercise-image.js';
import type { IWorkoutAuditLogger } from '../../../src/modules/workouts/application/ports.js';
import { isExerciseImageKey } from '../../../src/modules/workouts/domain/exercise-image.js';
import { ImageProcessor } from '../../../src/shared/images/image-processor.js';
import { LibheifDecoder } from '../../../src/shared/images/libheif-decoder.js';
import { createFeatureImageUrlResolver } from '../../../src/shared/images/public-image-url.js';
import type { PublicObjectStore } from '../../../src/shared/storage/object-store.js';
import { GIF_BYTES, heicSample, realJpeg, realPng } from '../../helpers/images.js';

// Real decoding and re-encoding takes real CPU time, and a full run shares every core.
vi.setConfig({ testTimeout: 60_000 });

const ORIGIN = 'https://media.example.test';
const processor = new ImageProcessor({ heic: new LibheifDecoder() });
const noHeic = new ImageProcessor({ heic: null });

interface PutCall {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}

function setup(options: { store?: PublicObjectStore | null; process?: boolean; heic?: boolean } = {}) {
  const store = {
    put: vi.fn(async (_object: PutCall) => undefined),
    exists: vi.fn(async () => true),
  } satisfies PublicObjectStore;
  const audit = { logAction: vi.fn(async () => undefined) } satisfies IWorkoutAuditLogger;
  const logger = { warn: vi.fn() };
  const engine = options.heic === false ? noHeic : processor;
  const useCase = new UploadExerciseImageUseCase({
    store: options.store === undefined ? store : options.store,
    process: options.process === false ? null : (bytes) => engine.process(bytes, 'exercises'),
    resolveUrl: createFeatureImageUrlResolver(ORIGIN, 'exercises'),
    audit,
    logger,
  });
  return { useCase, store, audit, logger };
}

const upload = (
  bytes: Uint8Array,
  contentType: string | undefined,
  declaredLength: number | null = bytes.length,
) => {
  const readBody = vi.fn(async () => bytes);
  return { input: { contentType, declaredLength, readBody }, readBody };
};
const actor = { adminId: 'a-1', ipAddress: '203.0.113.9', userAgent: 'ua' };
const putsOf = (store: { put: { mock: { calls: unknown[][] } } }): PutCall[] =>
  store.put.mock.calls.map((call) => call[0] as PutCall);

let png: Buffer;
beforeAll(async () => {
  png = await realPng({ width: 640, height: 360 });
});

describe('UploadExerciseImageUseCase', () => {
  it('stores exactly one optimized WebP under onusfit/exercises/, with no push copy', async () => {
    const { useCase, store } = setup();
    const result = await useCase.execute(actor, upload(png, 'image/png').input);

    const puts = putsOf(store);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe(result.imageKey);
    expect(isExerciseImageKey(result.imageKey)).toBe(true);
    expect(puts[0]!.key.startsWith('onusfit/exercises/')).toBe(true);
    expect(puts[0]!.contentType).toBe('image/webp');
    expect(puts[0]!.cacheControl).toBe('public, max-age=31536000, immutable');
    expect((await sharp(Buffer.from(puts[0]!.body)).metadata()).format).toBe('webp');
  });

  it('answers with the key, the public URL of the WebP and what was uploaded', async () => {
    const { useCase, store } = setup();
    const result = await useCase.execute(actor, upload(png, 'image/png').input);
    expect(result).toEqual({
      imageKey: putsOf(store)[0]!.key,
      imageUrl: `${ORIGIN}/${putsOf(store)[0]!.key}`,
      contentType: 'image/webp',
      sizeBytes: putsOf(store)[0]!.body.byteLength,
      width: 640,
      height: 360,
      source: { format: 'png', bytes: png.length, width: 640, height: 360 },
    });
  });

  it('scales a large photo to the exercise size (1600 px on the long side), keeping its proportions', async () => {
    const { useCase, store } = setup();
    const photo = await realJpeg({ width: 4000, height: 3000 });
    const result = await useCase.execute(actor, upload(photo, 'image/jpeg').input);
    expect([result.width, result.height]).toEqual([1600, 1200]);
    expect(await sharp(Buffer.from(putsOf(store)[0]!.body)).metadata()).toMatchObject({
      width: 1600,
      height: 1200,
    });
  });

  it('never enlarges a small picture', async () => {
    const { useCase } = setup();
    const small = await realPng({ width: 120, height: 80 });
    const result = await useCase.execute(actor, upload(small, 'image/png').input);
    expect([result.width, result.height]).toEqual([120, 80]);
  });

  it('removes EXIF, including GPS, from what it stores', async () => {
    const { useCase, store } = setup();
    const withGps = await realJpeg({ width: 400, height: 300, exif: true });
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    await useCase.execute(actor, upload(withGps, 'image/jpeg').input);
    const body = Buffer.from(putsOf(store)[0]!.body);
    expect((await sharp(body).metadata()).exif).toBeUndefined();
    expect(body.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
  });

  it('converts a HEIC photo, and says so in the answer', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(actor, upload(heicSample(), 'image/heic').input);
    expect(result.source.format).toBe('heic');
    expect(result.contentType).toBe('image/webp');
  });

  it('gives every upload its own key', async () => {
    const { useCase } = setup();
    const keys = new Set<string>();
    for (let i = 0; i < 10; i += 1)
      keys.add((await useCase.execute(actor, upload(png, 'image/png').input)).imageKey);
    expect(keys.size).toBe(10);
  });

  it('writes an audit entry with the key and sizes and no URL, attributed to the admin', async () => {
    const { useCase, audit, store } = setup();
    const result = await useCase.execute(actor, upload(png, 'image/png').input);
    expect(audit.logAction).toHaveBeenCalledTimes(1);
    expect(audit.logAction).toHaveBeenCalledWith(
      'a-1',
      'workout.exercise.image_upload',
      {
        imageKey: result.imageKey,
        sourceFormat: 'png',
        sourceBytes: png.length,
        sourceWidth: 640,
        sourceHeight: 360,
        storedBytes: putsOf(store)[0]!.body.byteLength,
        derivativeBytes: [],
        width: 640,
        height: 360,
      },
      null,
      '203.0.113.9',
      'ua',
    );
    expect(JSON.stringify(audit.logAction.mock.calls)).not.toContain('http');
  });

  describe('refusals store nothing and write no audit entry', () => {
    it.each([
      [
        'a declared type that is not an image',
        Buffer.from('x'),
        'application/pdf',
        'unsupported_media_type',
        'UNSUPPORTED_MEDIA_TYPE',
      ],
      ['no declared type', Buffer.from('x'), undefined, 'unsupported_media_type', 'UNSUPPORTED_MEDIA_TYPE'],
      ['a GIF named image/png', GIF_BYTES, 'image/png', 'unprocessable', 'INVALID_IMAGE'],
      ['an empty body', Buffer.alloc(0), 'image/png', 'unprocessable', 'INVALID_IMAGE'],
      ['text named image/jpeg', Buffer.from('not an image'), 'image/jpeg', 'unprocessable', 'INVALID_IMAGE'],
    ])('%s', async (_name, bytes, contentType, kind, code) => {
      const { useCase, store, audit } = setup();
      await expect(useCase.execute(actor, upload(bytes, contentType).input)).rejects.toMatchObject({
        kind,
        code,
      });
      expect(store.put).not.toHaveBeenCalled();
      expect(audit.logAction).not.toHaveBeenCalled();
    });

    it('a declared type that is refused never reads the body', async () => {
      const { useCase } = setup();
      const { input, readBody } = upload(png, 'image/gif');
      await expect(useCase.execute(actor, input)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
      expect(readBody).not.toHaveBeenCalled();
    });

    it('a declared length over 10 MB is refused without reading the body (413)', async () => {
      const { useCase } = setup();
      const { input, readBody } = upload(png, 'image/png', 10 * 1024 * 1024 + 1);
      await expect(useCase.execute(actor, input)).rejects.toMatchObject({ kind: 'payload_too_large' });
      expect(readBody).not.toHaveBeenCalled();
    });

    it('HEIC is refused with 415 when HEIC is switched off', async () => {
      const { useCase, store } = setup({ heic: false });
      await expect(useCase.execute(actor, upload(heicSample(), 'image/heic').input)).rejects.toMatchObject({
        kind: 'unsupported_media_type',
      });
      expect(store.put).not.toHaveBeenCalled();
    });
  });

  describe('when storage is not available', () => {
    it.each([
      ['storage is not configured', { store: null }],
      ['image processing is off', { process: false }],
    ])('answers 503 without reading the body when %s', async (_name, options) => {
      const { useCase } = setup(options);
      const { input, readBody } = upload(png, 'image/png');
      await expect(useCase.execute(actor, input)).rejects.toMatchObject({
        kind: 'unavailable',
        code: 'IMAGE_STORAGE_NOT_CONFIGURED',
      });
      expect(readBody).not.toHaveBeenCalled();
    });

    it('answers 503 without saying why when the write fails, and writes no audit entry', async () => {
      const failing = {
        put: vi.fn(async () => {
          throw new Error('R2 put failed (http HTTP 403) secret=hunter2');
        }),
        exists: vi.fn(),
      };
      const { useCase, audit, logger } = setup({ store: failing });
      const error = await useCase.execute(actor, upload(png, 'image/png').input).catch((e: unknown) => e);
      expect(error).toMatchObject({ kind: 'unavailable', code: 'IMAGE_STORAGE_UNAVAILABLE' });
      expect(JSON.stringify(error)).not.toContain('hunter2');
      expect(audit.logAction).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0]![1]).toMatch(/Exercise image upload/);
    });
  });
});

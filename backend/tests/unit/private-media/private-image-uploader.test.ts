import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { ImageProcessor } from '../../../src/shared/images/image-processor.js';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../src/shared/images/image-policy.js';
import type { PrivateMediaDeletionQueue } from '../../../src/shared/private-media/deletion-queue.js';
import {
  PRIVATE_IMAGE_CACHE_CONTROL,
  isOwnedPrivateImageKey,
  privateThumbnailKey,
} from '../../../src/shared/private-media/private-image-policy.js';
import { PrivateImageProcessor } from '../../../src/shared/private-media/private-image-processor.js';
import { PrivateImageUploader } from '../../../src/shared/private-media/private-image-uploader.js';
import { FakePrivateObjectStore } from '../../helpers/fake-private-store.js';
import { GIF_BYTES, padPng, realJpeg, realPng } from '../../helpers/images.js';

const OWNER = '3f2b8c1e-7d4a-4b6e-9a10-5c2d8e7f6a01';
const processor = new PrivateImageProcessor({ intake: new ImageProcessor({ heic: null }) });

function setup(
  options: { store?: FakePrivateObjectStore | null; queue?: PrivateMediaDeletionQueue | null } = {},
) {
  const store = options.store === undefined ? new FakePrivateObjectStore() : options.store;
  const enqueue = vi.fn(async () => undefined);
  const queue: PrivateMediaDeletionQueue | null =
    options.queue === undefined
      ? {
          enqueue,
          claimDue: async () => [],
          complete: async () => undefined,
          fail: async () => undefined,
          pendingCount: async () => 0,
        }
      : options.queue;
  const warn = vi.fn();
  const uploader = new PrivateImageUploader({
    store,
    processor: store ? processor : null,
    deletionQueue: queue,
    logger: { warn },
  });
  return { store, uploader, enqueue, warn };
}

const input = (
  body: Uint8Array,
  contentType: string | null = 'image/jpeg',
  declaredLength: number | null = body.byteLength,
) => ({
  // null stands for "no Content-Type header at all" (a default parameter would swallow undefined).
  contentType: contentType ?? undefined,
  declaredLength,
  readBody: vi.fn(async () => body),
});

const failure = async (promise: Promise<unknown>): Promise<AppError> => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
};

describe('PrivateImageUploader', () => {
  it('stores the picture and its thumbnail under the owner, with private caching, and returns the keys', async () => {
    const { store, uploader } = setup();
    const stored = await uploader.upload(
      OWNER,
      'progress',
      input(await realJpeg({ width: 800, height: 600 })),
    );

    expect(isOwnedPrivateImageKey(stored.key, OWNER, 'progress')).toBe(true);
    expect(stored.thumbnailKey).toBe(privateThumbnailKey(stored.key));
    expect(stored.version).toMatch(/^[0-9a-f]{32}$/);
    expect(stored.key).toContain(stored.version);
    expect(store!.keys).toEqual([stored.key, stored.thumbnailKey].sort());
    for (const object of store!.objects.values()) {
      expect(object.contentType).toBe('image/webp');
      expect(object.cacheControl).toBe(PRIVATE_IMAGE_CACHE_CONTROL);
      expect(object.cacheControl).toMatch(/^private,/); // never a shared cache
    }
    expect(stored).toMatchObject({
      width: 800,
      height: 600,
      byteSize: store!.objects.get(stored.key)!.body.byteLength,
    });
  });

  it('gives every upload a new key: a replacement can never be mistaken for the old picture', async () => {
    const { uploader } = setup();
    const png = await realPng();
    const a = await uploader.upload(OWNER, 'avatar', input(png, 'image/png'));
    const b = await uploader.upload(OWNER, 'avatar', input(png, 'image/png'));
    expect(a.key).not.toBe(b.key);
    expect(a.version).not.toBe(b.version);
  });

  it('writes the thumbnail first and the picture last', async () => {
    const { store, uploader } = setup();
    await uploader.upload(OWNER, 'avatar', input(await realJpeg()));
    const puts = store!.calls.filter((c) => c.operation === 'put').map((c) => c.key);
    expect(puts[0]).toContain('.thumb.webp');
    expect(puts[1]).not.toContain('.thumb');
  });

  it('answers 503 PRIVATE_STORAGE_NOT_CONFIGURED without reading the body when storage is off', async () => {
    const { uploader } = setup({ store: null });
    const request = input(await realJpeg());
    const error = await failure(uploader.upload(OWNER, 'avatar', request));
    expect(error).toMatchObject({ kind: 'unavailable', code: 'PRIVATE_STORAGE_NOT_CONFIGURED' });
    expect(request.readBody).not.toHaveBeenCalled();
  });

  it('refuses a declared type that is not an image, or a declared length over the limit, before reading a byte', async () => {
    const { uploader } = setup();
    for (const type of ['application/json', 'text/html', 'image/gif', 'image/svg+xml', '', null]) {
      const request = input(new Uint8Array([1]), type);
      expect(await failure(uploader.upload(OWNER, 'avatar', request))).toMatchObject({
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
      expect(request.readBody).not.toHaveBeenCalled();
    }
    const big = input(new Uint8Array([1]), 'image/jpeg', IMAGE_UPLOAD_MAX_BYTES + 1);
    expect(await failure(uploader.upload(OWNER, 'avatar', big))).toMatchObject({ kind: 'payload_too_large' });
    expect(big.readBody).not.toHaveBeenCalled();
  });

  it('accepts a Content-Type with parameters and any letter case', async () => {
    const { uploader } = setup();
    await expect(
      uploader.upload(OWNER, 'avatar', input(await realJpeg(), 'Image/JPEG; charset=binary')),
    ).resolves.toBeDefined();
  });

  it('decides by the bytes, not the label: a GIF sent as image/jpeg is refused, and nothing is stored', async () => {
    const { store, uploader } = setup();
    const error = await failure(uploader.upload(OWNER, 'avatar', input(GIF_BYTES, 'image/jpeg')));
    expect(error).toMatchObject({ kind: 'unprocessable', code: 'INVALID_IMAGE' });
    expect(error.message).toBe('Use a JPEG, PNG, WebP or HEIC photo.');
    expect(store!.keys).toEqual([]);
  });

  it('refuses an empty body and a body over the limit that the reader let through', async () => {
    const { store, uploader } = setup();
    expect(await failure(uploader.upload(OWNER, 'avatar', input(new Uint8Array(0))))).toMatchObject({
      code: 'INVALID_IMAGE',
    });
    const over = new Uint8Array(IMAGE_UPLOAD_MAX_BYTES + 1);
    expect(await failure(uploader.upload(OWNER, 'avatar', input(over, 'image/jpeg', null)))).toMatchObject({
      kind: 'payload_too_large',
    });
    expect(store!.keys).toEqual([]);
  });

  it('accepts a file of exactly the size limit', async () => {
    const { uploader } = setup();
    const exact = padPng(await realPng({ width: 64, height: 64 }), IMAGE_UPLOAD_MAX_BYTES);
    expect(exact.byteLength).toBe(IMAGE_UPLOAD_MAX_BYTES);
    await expect(uploader.upload(OWNER, 'progress', input(exact, 'image/png'))).resolves.toBeDefined();
  });

  describe('when storage fails part way', () => {
    it('removes what it wrote and answers 503 without saying why', async () => {
      const { store, uploader, warn } = setup();
      store!.failNext('put', 1, (key) => !key.includes('.thumb')); // the picture itself fails, after the thumbnail
      const error = await failure(uploader.upload(OWNER, 'avatar', input(await realJpeg())));
      expect(error).toMatchObject({ kind: 'unavailable', code: 'PRIVATE_STORAGE_UNAVAILABLE' });
      expect(error.message).not.toMatch(/503|HTTP|bucket|r2/i);
      expect(store!.keys).toEqual([]); // the thumbnail was cleaned up
      expect(warn).toHaveBeenCalled();
    });

    it('hands what it could not remove to the deletion queue', async () => {
      const { store, uploader, enqueue } = setup();
      store!.failNext('put', 1, (key) => !key.includes('.thumb'));
      store!.failNext('delete', 1, (key) => key.includes('.thumb'));
      await failure(uploader.upload(OWNER, 'avatar', input(await realJpeg())));
      expect(enqueue).toHaveBeenCalledTimes(1);
      const queued = (enqueue.mock.calls[0] as unknown as [string[]])[0];
      expect(queued).toHaveLength(1);
      expect(queued[0]).toContain('.thumb.webp');
    });

    it('never throws from discard, even when storage and the queue are both down', async () => {
      const { store, uploader, enqueue, warn } = setup();
      enqueue.mockRejectedValueOnce(new Error('database down'));
      store!.failNext('delete', 2);
      const stored = await uploader.upload(OWNER, 'avatar', input(await realJpeg()));
      await expect(uploader.discard(stored)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ objects: 2 }), expect.any(String));
    });
  });
});

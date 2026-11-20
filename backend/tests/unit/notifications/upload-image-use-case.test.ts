import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createActor } from '../../../src/shared/auth/actor.js';
import type {
  AdminAuditPort,
  NotificationImageProcessor,
  NotificationImageStore,
} from '../../../src/modules/notifications/application/ports.js';
import { UploadNotificationImageUseCase } from '../../../src/modules/notifications/application/use-cases/upload-image.js';
import {
  createImageUrlResolver,
  createPushImageUrlResolver,
  isNotificationImageKey,
} from '../../../src/modules/notifications/domain/notification-image.js';
import { ImageRejectedError, type ImageRejectReason } from '../../../src/shared/images/image-errors.js';
import type { RejectedFormat } from '../../../src/shared/images/image-format.js';
import { ImageProcessor, type ProcessedImage } from '../../../src/shared/images/image-processor.js';
import { LibheifDecoder } from '../../../src/shared/images/libheif-decoder.js';
import {
  derivativeKey,
  HEIC_MAX_PIXELS,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_PIXELS,
  IMAGE_UPLOAD_MAX_BYTES,
} from '../../../src/shared/images/image-policy.js';
import {
  animatedWebp,
  GIF_BYTES,
  HTML_BYTES,
  heicSample,
  makePng,
  PDF_BYTES,
  realJpeg,
  realPng,
  realWebp,
} from '../../helpers/images.js';

const admin = createActor({ userId: 'a-1', sessionId: 's-1', role: 'admin' });
const member = createActor({ userId: 'm-1', sessionId: 's-2', role: 'member' });
const ORIGIN = 'https://media.example.test';
const CANONICAL_KEY = /^onusfit\/notifications\/[0-9a-f]{32}\.webp$/;

// Real decoding and re-encoding takes real CPU time, and a full run shares every core: do not let the 5 s default
// turn a slow machine into a failure.
vi.setConfig({ testTimeout: 60_000 });

// Real decoding and re-encoding: these tests check what actually gets stored, not what a stub says was stored.
const realProcessor = new ImageProcessor({ heic: new LibheifDecoder() });
const realNoHeic = new ImageProcessor({ heic: null });
const processWith = (processor: Pick<ImageProcessor, 'process'>): NotificationImageProcessor => ({
  process: (bytes) => processor.process(bytes, 'notifications'),
});

interface PutCall {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}

function setup(
  options: {
    store?: NotificationImageStore | null;
    processor?: NotificationImageProcessor | null;
    resolveUrl?: ReturnType<typeof createImageUrlResolver>;
  } = {},
) {
  const store = {
    put: vi.fn(async (_object: PutCall) => undefined),
    exists: vi.fn(async () => true),
  } satisfies NotificationImageStore;
  const audit: AdminAuditPort = { recordAuditLog: vi.fn(async () => ({})) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const useCase = new UploadNotificationImageUseCase({
    images: {
      store: options.store === undefined ? store : options.store,
      resolveUrl: options.resolveUrl ?? createImageUrlResolver(ORIGIN),
      resolvePushUrl: createPushImageUrlResolver(ORIGIN),
    },
    processor: options.processor === undefined ? processWith(realProcessor) : options.processor,
    audit,
    logger,
  });
  return { useCase, store, audit, logger };
}

/** An upload as the controller hands it over: the body is only read when the use case asks for it. */
const upload = (
  bytes: Uint8Array,
  contentType: string | undefined,
  declaredLength: number | null = bytes.length,
) => {
  const readBody = vi.fn(async () => bytes);
  return { input: { contentType, declaredLength, readBody }, readBody };
};

const putsOf = (store: { put: { mock: { calls: unknown[][] } } }): PutCall[] =>
  store.put.mock.calls.map((call) => call[0] as PutCall);

/** What a processor returns, for tests that are about the use case rather than the pixels. */
const canned = (): ProcessedImage => ({
  feature: 'notifications',
  canonical: { body: Buffer.from('webp-bytes'), contentType: 'image/webp' },
  derivatives: [{ name: 'push', body: Buffer.from('jpeg-bytes'), contentType: 'image/jpeg' }],
  width: 10,
  height: 5,
  source: { format: 'png', bytes: 100, width: 10, height: 5 },
});
const stubProcessor = (impl: (bytes: Uint8Array) => Promise<ProcessedImage> = async () => canned()) => {
  const process = vi.fn(impl);
  return { processor: { process } satisfies NotificationImageProcessor, process };
};

let png: Buffer;
let jpeg: Buffer;
beforeAll(async () => {
  png = await realPng({ width: 640, height: 360 });
  jpeg = await realJpeg({ width: 1200, height: 630 });
});

describe('UploadNotificationImageUseCase: who may upload', () => {
  it('refuses a member before reading anything or touching storage', async () => {
    const { useCase, store } = setup();
    const { input, readBody } = upload(png, 'image/png');
    await expect(useCase.execute(member, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(readBody).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('answers 503 when image storage is not configured, without reading the body', async () => {
    const { useCase } = setup({ store: null });
    const { input, readBody } = upload(png, 'image/png');
    await expect(useCase.execute(admin, input)).rejects.toMatchObject({
      kind: 'unavailable',
      code: 'IMAGE_STORAGE_NOT_CONFIGURED',
    });
    expect(readBody).not.toHaveBeenCalled();
  });

  it('answers 503 when there is no image processor, without reading the body or storing anything', async () => {
    const { useCase, store } = setup({ processor: null });
    const { input, readBody } = upload(png, 'image/png');
    await expect(useCase.execute(admin, input)).rejects.toMatchObject({
      kind: 'unavailable',
      code: 'IMAGE_STORAGE_NOT_CONFIGURED',
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });
});

describe('UploadNotificationImageUseCase: the declared type only decides whether the body is read', () => {
  it.each([
    'image/gif',
    'image/svg+xml',
    'image/bmp',
    'image/avif',
    'image/tiff',
    'application/octet-stream',
    'application/pdf',
    'text/html',
    'multipart/form-data; boundary=x',
    'application/json',
    '',
    undefined,
  ])('refuses the declared type %j without reading the body or storing anything', async (contentType) => {
    const { useCase, store } = setup();
    const { input, readBody } = upload(png, contentType);
    await expect(useCase.execute(admin, input)).rejects.toMatchObject({
      kind: 'unsupported_media_type',
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('tells the admin which types are accepted', async () => {
    const { useCase } = setup();
    const error = await useCase.execute(admin, upload(png, 'image/gif').input).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/JPEG, PNG, WebP and HEIC/);
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])(
    'reads the body for the accepted type %s',
    async (contentType) => {
      const { processor } = stubProcessor();
      const { useCase } = setup({ processor });
      const { input, readBody } = upload(png, contentType);
      await expect(useCase.execute(admin, input)).resolves.toBeDefined();
      expect(readBody).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts the type however it is capitalised or decorated', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute(admin, upload(png, 'IMAGE/PNG; charset=binary').input),
    ).resolves.toBeDefined();
  });
});

describe('UploadNotificationImageUseCase: the content is what counts', () => {
  it.each([
    ['a GIF named image/png', GIF_BYTES, /is a GIF/],
    [
      'an SVG named image/png',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
      /is an SVG/,
    ],
    ['a PDF named image/jpeg', PDF_BYTES, /is a PDF/],
    ['an HTML page named image/png', HTML_BYTES, /not a JPEG, PNG, WebP or HEIC image/],
    [
      'plain text named image/jpeg',
      Buffer.from('not an image at all'),
      /not a JPEG, PNG, WebP or HEIC image/,
    ],
  ])('refuses %s with a 422 that says what it is, and stores nothing', async (_name, bytes, message) => {
    const { useCase, store, audit } = setup();
    const error = await useCase.execute(admin, upload(bytes, 'image/png').input).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unprocessable', code: 'INVALID_IMAGE' });
    expect((error as Error).message).toMatch(message);
    expect(store.put).not.toHaveBeenCalled();
    expect(audit.recordAuditLog).not.toHaveBeenCalled();
  });

  it('accepts a JPEG sent as image/png: the mismatch is harmless because the file is re-encoded either way', async () => {
    const { useCase, store } = setup();
    const result = await useCase.execute(admin, upload(jpeg, 'image/png').input);
    expect(result.source.format).toBe('jpeg');
    expect(putsOf(store)).toHaveLength(2);
  });

  it('refuses an empty file', async () => {
    const { useCase, store } = setup();
    await expect(useCase.execute(admin, upload(Buffer.alloc(0), 'image/png').input)).rejects.toMatchObject({
      kind: 'unprocessable',
      code: 'INVALID_IMAGE',
      message: 'The file is empty.',
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('refuses a damaged image with a clear message', async () => {
    const { useCase, store } = setup();
    const damaged = png.subarray(0, png.length - 20);
    await expect(useCase.execute(admin, upload(damaged, 'image/png').input)).rejects.toMatchObject({
      kind: 'unprocessable',
      code: 'INVALID_IMAGE',
      message: expect.stringContaining('damaged or incomplete') as string,
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('refuses an image whose pixel size is beyond the limit, and says what the limit is', async () => {
    const { useCase, store } = setup();
    // A valid header declaring a width one over the limit (the pixel data is never reached).
    const tooWide = makePng({ width: IMAGE_MAX_DIMENSION + 1, height: 10 });
    const error = await useCase.execute(admin, upload(tooWide, 'image/png').input).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unprocessable', code: 'INVALID_IMAGE' });
    expect((error as Error).message).toContain(`${IMAGE_MAX_DIMENSION} px`);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('refuses an animated image', async () => {
    const { useCase, store } = setup();
    const error = await useCase
      .execute(admin, upload(await animatedWebp(), 'image/webp').input)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unprocessable', code: 'INVALID_IMAGE' });
    expect((error as Error).message).toMatch(/Animated images are not supported/);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('accepts a WebP', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(admin, upload(await realWebp(), 'image/webp').input);
    expect(result.source.format).toBe('webp');
  });

  it('converts a HEIC photo when HEIC is enabled', async () => {
    const { useCase, store } = setup();
    const result = await useCase.execute(admin, upload(heicSample(), 'image/heic').input);
    expect(result.source.format).toBe('heic');
    expect(result.contentType).toBe('image/webp');
    expect(putsOf(store)).toHaveLength(2);
  });

  it('answers 415 for a HEIC photo when HEIC is switched off, and stores nothing', async () => {
    const { useCase, store } = setup({ processor: processWith(realNoHeic) });
    const error = await useCase
      .execute(admin, upload(heicSample(), 'image/heic').input)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unsupported_media_type', code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect((error as Error).message).toMatch(/HEIC images are not enabled/);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('still converts JPEG, PNG and WebP when HEIC is switched off', async () => {
    const { useCase } = setup({ processor: processWith(realNoHeic) });
    await expect(useCase.execute(admin, upload(png, 'image/png').input)).resolves.toBeDefined();
    await expect(useCase.execute(admin, upload(jpeg, 'image/jpeg').input)).resolves.toBeDefined();
  });
});

describe('UploadNotificationImageUseCase: every refusal reason has an answer for the admin', () => {
  const rejecting = (reason: ImageRejectReason, detected?: RejectedFormat) =>
    stubProcessor(async () => {
      throw new ImageRejectedError(reason, detected);
    });

  it.each([
    ['empty', 'unprocessable', 'INVALID_IMAGE', /file is empty/],
    ['too_large', 'payload_too_large', 'PAYLOAD_TOO_LARGE', /larger than 10 MB/],
    ['dimensions', 'unprocessable', 'INVALID_IMAGE', /too large in pixels/],
    ['animated', 'unprocessable', 'INVALID_IMAGE', /Animated images are not supported/],
    ['heic_disabled', 'unsupported_media_type', 'UNSUPPORTED_MEDIA_TYPE', /HEIC images are not enabled/],
    ['corrupt', 'unprocessable', 'INVALID_IMAGE', /damaged or incomplete/],
    ['unsupported_format', 'unprocessable', 'INVALID_IMAGE', /not a JPEG, PNG, WebP or HEIC image/],
  ] as const)('%s -> %s / %s', async (reason, kind, code, message) => {
    const { processor } = rejecting(reason);
    const { useCase, store } = setup({ processor });
    const error = await useCase.execute(admin, upload(png, 'image/png').input).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind, code });
    expect((error as Error).message).toMatch(message);
    expect(store.put).not.toHaveBeenCalled();
  });

  it.each([
    ['gif', 'a GIF'],
    ['avif', 'an AVIF'],
    ['svg', 'an SVG'],
    ['tiff', 'a TIFF'],
    ['bmp', 'a BMP'],
    ['pdf', 'a PDF'],
  ] as const)('names a refused %s file ("%s")', async (detected, phrase) => {
    const { processor } = rejecting('unsupported_format', detected);
    const { useCase } = setup({ processor });
    const error = await useCase.execute(admin, upload(png, 'image/png').input).catch((e: unknown) => e);
    expect((error as Error).message).toContain(phrase);
  });

  it('puts the real limits in the pixel-size message (they are read from the policy, not retyped)', async () => {
    const { processor } = rejecting('dimensions');
    const { useCase } = setup({ processor });
    const error = await useCase.execute(admin, upload(png, 'image/png').input).catch((e: unknown) => e);
    const text = (error as Error).message;
    expect(text).toContain(`${IMAGE_MAX_DIMENSION} px`);
    expect(text).toContain(`${IMAGE_MAX_PIXELS / 1_000_000} megapixels`);
    expect(text).toContain(`${HEIC_MAX_PIXELS / 1_000_000} megapixels`);
  });

  it('does not swallow an unexpected failure: it propagates so the server answers 500 and logs it', async () => {
    const { processor } = stubProcessor(async () => {
      throw new Error('boom: unexpected');
    });
    const { useCase, store } = setup({ processor });
    await expect(useCase.execute(admin, upload(png, 'image/png').input)).rejects.toThrow('boom: unexpected');
    expect(store.put).not.toHaveBeenCalled();
  });
});

describe('UploadNotificationImageUseCase: size', () => {
  it('has a 10 MB limit', () => {
    expect(IMAGE_UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('passes a file of exactly the maximum size on to the processor', async () => {
    const { processor, process } = stubProcessor();
    const { useCase } = setup({ processor });
    const bytes = Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES, 1);
    await expect(useCase.execute(admin, upload(bytes, 'image/png').input)).resolves.toBeDefined();
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('refuses a file one byte over the maximum before decoding anything', async () => {
    const { processor, process } = stubProcessor();
    const { useCase, store } = setup({ processor });
    const bytes = Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1, 1);
    await expect(useCase.execute(admin, upload(bytes, 'image/png').input)).rejects.toMatchObject({
      kind: 'payload_too_large',
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(process).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('refuses on the declared length alone, without reading the body', async () => {
    const { useCase, store } = setup();
    const { input, readBody } = upload(png, 'image/png', IMAGE_UPLOAD_MAX_BYTES + 1);
    await expect(useCase.execute(admin, input)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(readBody).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('does not trust a declared length that understates the real size', async () => {
    const { processor, process } = stubProcessor();
    const { useCase, store } = setup({ processor });
    const bytes = Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 500, 1);
    await expect(useCase.execute(admin, upload(bytes, 'image/png', 100).input)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(process).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('handles a body sent without any declared length (chunked)', async () => {
    const { useCase } = setup();
    await expect(useCase.execute(admin, upload(png, 'image/png', null).input)).resolves.toBeDefined();
  });

  it('accepts a photo far over the old 1 MB limit, because the stored copy is much smaller', async () => {
    // A 2 MB upload (a noisy photograph) is fine; only the converted result is stored.
    const big = await sharp(
      Buffer.alloc(1800 * 1200 * 3).map((_, i) => (i * 2654435761) >>> 24),
      {
        raw: { width: 1800, height: 1200, channels: 3 },
      },
    )
      .jpeg({ quality: 95 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(1_048_576);
    const { useCase, store } = setup();
    const result = await useCase.execute(admin, upload(big, 'image/jpeg').input);
    expect(result.source.bytes).toBe(big.length);
    expect(putsOf(store).every((put) => put.body.byteLength > 0)).toBe(true);
  });
});

describe('UploadNotificationImageUseCase: storing', () => {
  it('writes the push JPEG first and the canonical WebP last, both under onusfit/notifications/', async () => {
    const { useCase, store } = setup();
    const result = await useCase.execute(admin, upload(png, 'image/png').input);

    const puts = putsOf(store);
    expect(puts).toHaveLength(2);
    expect(result.imageKey).toMatch(CANONICAL_KEY);
    // The key a notification stores is written last: a failure midway can leave only an unreferenced JPEG behind.
    expect(puts[0]!.key).toBe(derivativeKey(result.imageKey, 'push'));
    expect(puts[0]!.contentType).toBe('image/jpeg');
    expect(puts[1]!.key).toBe(result.imageKey);
    expect(puts[1]!.contentType).toBe('image/webp');
    for (const put of puts) {
      expect(put.key.startsWith('onusfit/notifications/')).toBe(true);
      expect(put.cacheControl).toBe('public, max-age=31536000, immutable');
    }
  });

  it('stores a real WebP and a real JPEG, not the uploaded bytes', async () => {
    const { useCase, store } = setup();
    await useCase.execute(admin, upload(png, 'image/png').input);
    const [push, canonical] = putsOf(store);
    expect((await sharp(Buffer.from(canonical!.body)).metadata()).format).toBe('webp');
    expect((await sharp(Buffer.from(push!.body)).metadata()).format).toBe('jpeg');
    expect(Buffer.from(canonical!.body).equals(png)).toBe(false);
  });

  it('returns the key, the public URL of the WebP, and what was stored and uploaded', async () => {
    const { useCase, store } = setup();
    const result = await useCase.execute(admin, upload(png, 'image/png').input);
    const canonical = putsOf(store)[1]!;
    expect(result).toEqual({
      imageKey: canonical.key,
      imageUrl: `${ORIGIN}/${canonical.key}`,
      contentType: 'image/webp',
      sizeBytes: canonical.body.byteLength,
      width: 640,
      height: 360,
      source: { format: 'png', bytes: png.length, width: 640, height: 360 },
    });
    expect(isNotificationImageKey(result.imageKey)).toBe(true);
  });

  it('removes EXIF, including GPS, from everything it stores', async () => {
    const { useCase, store } = setup();
    const withGps = await realJpeg({ width: 400, height: 300, exif: true });
    expect((await sharp(withGps).metadata()).exif).toBeDefined(); // the fixture really has metadata
    await useCase.execute(admin, upload(withGps, 'image/jpeg').input);
    for (const put of putsOf(store)) {
      const body = Buffer.from(put.body);
      const meta = await sharp(body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(body.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
    }
  });

  it('gives every upload its own key, so a file can never overwrite another', async () => {
    const { processor } = stubProcessor();
    const { useCase } = setup({ processor });
    const keys = new Set<string>();
    for (let i = 0; i < 25; i += 1)
      keys.add((await useCase.execute(admin, upload(png, 'image/png').input)).imageKey);
    expect(keys.size).toBe(25);
  });

  it('never lets the uploaded name or any client value into the key', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(admin, upload(png, 'image/png').input);
    expect(result.imageKey).toMatch(CANONICAL_KEY);
  });

  it('writes an audit entry with the key and sizes, and nothing sensitive', async () => {
    const { useCase, audit, store } = setup();
    const result = await useCase.execute(admin, upload(png, 'image/png').input, {
      ip: '203.0.113.9',
      userAgent: 'ua',
    });
    const [push, canonical] = putsOf(store);
    expect(audit.recordAuditLog).toHaveBeenCalledWith({
      adminId: 'a-1',
      action: 'notification.image_upload',
      details: {
        imageKey: result.imageKey,
        sourceFormat: 'png',
        sourceBytes: png.length,
        sourceWidth: 640,
        sourceHeight: 360,
        storedBytes: canonical!.body.byteLength,
        derivativeBytes: [{ name: 'push', bytes: push!.body.byteLength }],
        width: 640,
        height: 360,
      },
      ipAddress: '203.0.113.9',
      userAgent: 'ua',
    });
    expect(JSON.stringify(vi.mocked(audit.recordAuditLog).mock.calls)).not.toContain('http');
  });

  it('reports a storage failure as 503 without exposing why, and records nothing', async () => {
    const failing = {
      put: vi.fn(async () => {
        throw new Error('R2 put failed (http HTTP 403) account=0123 secret=hunter2');
      }),
      exists: vi.fn(),
    };
    const { useCase, audit, logger } = setup({ store: failing });
    const error = await useCase.execute(admin, upload(png, 'image/png').input).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'unavailable', code: 'IMAGE_STORAGE_UNAVAILABLE' });
    expect((error as Error).message).not.toContain('hunter2');
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect(audit.recordAuditLog).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('if the canonical write fails after the JPEG was written, nothing referenceable exists and nothing is audited', async () => {
    const written: string[] = [];
    const store = {
      put: vi.fn(async (object: PutCall) => {
        if (object.key.endsWith('.webp')) throw new Error('R2 put failed (http HTTP 500)');
        written.push(object.key);
      }),
      exists: vi.fn(),
    };
    const { useCase, audit } = setup({ store });
    await expect(useCase.execute(admin, upload(png, 'image/png').input)).rejects.toMatchObject({
      code: 'IMAGE_STORAGE_UNAVAILABLE',
    });
    // Only the push JPEG exists. No key that a notification could store (and no WebP) was written.
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/\.push\.jpg$/);
    expect(written.some((key) => isNotificationImageKey(key))).toBe(false);
    expect(audit.recordAuditLog).not.toHaveBeenCalled();
  });

  it('answers 503 and stores nothing when the public media address is missing', async () => {
    const { useCase, store } = setup({ resolveUrl: () => null });
    await expect(useCase.execute(admin, upload(png, 'image/png').input)).rejects.toMatchObject({
      kind: 'unavailable',
      code: 'IMAGE_STORAGE_NOT_CONFIGURED',
    });
    expect(store.put).not.toHaveBeenCalled();
  });
});

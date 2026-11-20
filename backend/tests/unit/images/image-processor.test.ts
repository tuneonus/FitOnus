import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { ImageRejectedError, type ImageRejectReason } from '../../../src/shared/images/image-errors.js';
import {
  ImageProcessor,
  type DecodedRaster,
  type HeicDecoder,
} from '../../../src/shared/images/image-processor.js';
import {
  FEATURE_PROFILES,
  HEIC_MAX_PIXELS,
  IMAGE_MAX_DIMENSION,
  IMAGE_UPLOAD_MAX_BYTES,
} from '../../../src/shared/images/image-policy.js';
import { LibheifDecoder } from '../../../src/shared/images/libheif-decoder.js';
import {
  GIF_BYTES,
  HEIC_SAMPLE_HEIGHT,
  HEIC_SAMPLE_WIDTH,
  HTML_BYTES,
  PDF_BYTES,
  animatedWebp,
  heicSample,
  isoBmffHeader,
  makeJpeg,
  makePng,
  realJpeg,
  realPng,
  realWebp,
  redLeftBlueRight,
} from '../../helpers/images.js';

// These tests do real image decoding and encoding. The worst case (a picture of random noise that no JPEG quality can
// shrink under 1 MB) takes about 3 s alone and far longer when the whole suite runs on every core at once, so the
// 5 s default is too tight and made this file fail only under load.
vi.setConfig({ testTimeout: 60_000 });

const processor = new ImageProcessor({ heic: new LibheifDecoder() });
const noHeic = new ImageProcessor({ heic: null });

/** The error a processing call is refused with, or fails the test if it was accepted. */
async function rejection(promise: Promise<unknown>): Promise<ImageRejectedError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ImageRejectedError);
  return error as ImageRejectedError;
}
const reasonOf = async (promise: Promise<unknown>): Promise<ImageRejectReason> =>
  (await rejection(promise)).reason;

const metadataOf = (bytes: Buffer) => sharp(bytes).metadata();
const rawOf = async (bytes: Buffer) => {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    ...info,
    at: (x: number, y: number) =>
      Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)),
  };
};

describe('conversion to WebP', () => {
  it.each([
    ['JPEG', () => realJpeg()],
    ['PNG', () => realPng()],
    ['WebP', () => realWebp()],
    ['HEIC', () => Promise.resolve(heicSample())],
  ] as const)('turns a %s into a WebP', async (_name, make) => {
    const result = await processor.process(await make(), 'notifications');
    expect(result.canonical.contentType).toBe('image/webp');
    const meta = await metadataOf(result.canonical.body);
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([result.width, result.height]);
  });

  it('keeps the size of a picture that is already small enough', async () => {
    const result = await processor.process(await realJpeg({ width: 300, height: 200 }), 'notifications');
    expect([result.width, result.height]).toEqual([300, 200]);
    expect(result.source).toMatchObject({ format: 'jpeg', width: 300, height: 200 });
  });

  it('never enlarges a small picture', async () => {
    const result = await processor.process(await realPng({ width: 20, height: 10 }), 'notifications');
    expect([result.width, result.height]).toEqual([20, 10]);
  });

  it('scales a large picture down to the feature size, keeping its proportions', async () => {
    const edge = FEATURE_PROFILES.notifications.maxEdge;
    const result = await processor.process(await realJpeg({ width: 4000, height: 2000 }), 'notifications');
    expect([result.width, result.height]).toEqual([edge, edge / 2]);
    expect(result.source).toMatchObject({ width: 4000, height: 2000 });
  });

  it('scales a tall picture by its height', async () => {
    const edge = FEATURE_PROFILES.notifications.maxEdge;
    const result = await processor.process(await realPng({ width: 1000, height: 3000 }), 'notifications');
    expect([result.width, result.height]).toEqual([Math.round(edge / 3), edge]);
  });

  it('uses each feature’s own size', async () => {
    const big = await realJpeg({ width: 4000, height: 4000 });
    expect((await processor.process(big, 'notifications')).width).toBe(
      FEATURE_PROFILES.notifications.maxEdge,
    );
    expect((await processor.process(big, 'exercises')).width).toBe(FEATURE_PROFILES.exercises.maxEdge);
  });

  it('makes a real photograph smaller, not bigger', async () => {
    // Noise-free photographic-ish content: a gradient is more representative than a flat colour.
    const gradient = Buffer.alloc(800 * 600 * 3);
    for (let i = 0; i < 800 * 600; i += 1) {
      const x = i % 800;
      const y = Math.floor(i / 800);
      gradient[i * 3] = (x * 255) / 800;
      gradient[i * 3 + 1] = (y * 255) / 600;
      gradient[i * 3 + 2] = ((x + y) * 255) / 1400;
    }
    const jpeg = await realJpeg({ width: 800, height: 600, pixels: gradient });
    const result = await processor.process(jpeg, 'notifications');
    expect(result.canonical.body.length).toBeLessThan(jpeg.length);
  });
});

describe('metadata is removed', () => {
  it('drops EXIF, including camera details and GPS, from a JPEG', async () => {
    const input = await realJpeg({ exif: true });
    const before = await metadataOf(input);
    expect(before.exif).toBeDefined(); // the fixture really carries it
    expect(input.includes(Buffer.from('PrivateCameraMaker'))).toBe(true);

    const result = await processor.process(input, 'notifications');
    const after = await metadataOf(result.canonical.body);
    expect(after.exif).toBeUndefined();
    expect(result.canonical.body.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
    expect(result.canonical.body.includes(Buffer.from('Exif'))).toBe(false);
  });

  it('drops EXIF from the JPEG derivative as well', async () => {
    const result = await processor.process(await realJpeg({ exif: true }), 'notifications');
    const derivative = result.derivatives[0]!;
    const meta = await metadataOf(derivative.body);
    expect(meta.exif).toBeUndefined();
    expect(derivative.body.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
  });

  it('drops EXIF from a WebP', async () => {
    const input = await realWebp({ exif: true });
    expect((await metadataOf(input)).exif).toBeDefined();
    const result = await processor.process(input, 'notifications');
    expect((await metadataOf(result.canonical.body)).exif).toBeUndefined();
  });

  it('leaves no embedded colour profile (the colours are converted to sRGB instead)', async () => {
    const wide = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 60, b: 60 } },
    })
      .withIccProfile('p3')
      .jpeg()
      .toBuffer();
    expect((await metadataOf(wide)).icc).toBeDefined();
    const result = await processor.process(wide, 'notifications');
    expect((await metadataOf(result.canonical.body)).icc).toBeUndefined();
    expect((await metadataOf(result.derivatives[0]!.body)).icc).toBeUndefined();
  });

  it('converts wide-gamut colours to sRGB so the picture keeps its look', async () => {
    const wide = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 60, b: 60 } },
    })
      .withIccProfile('p3')
      .png()
      .toBuffer();
    const result = await processor.process(wide, 'notifications');
    const [r, g, b] = (await rawOf(result.canonical.body)).at(4, 4);
    // Display P3 (200, 60, 60) is a more saturated red than sRGB (200, 60, 60): converted, it must differ from the tag-less value.
    expect([r, g, b]).not.toEqual([200, 60, 60]);
    expect(r).toBeGreaterThan(g! + 60);
  });
});

describe('orientation is applied before the tag is dropped', () => {
  // Orientation 6 means "rotate 90 degrees clockwise to display": the stored left edge becomes the top.
  it('rotates a sideways photo upright', async () => {
    const sideways = await realJpeg({
      width: 40,
      height: 20,
      pixels: redLeftBlueRight(40, 20),
      orientation: 6,
    });
    expect((await metadataOf(sideways)).orientation).toBe(6);

    const result = await processor.process(sideways, 'notifications');
    expect([result.width, result.height]).toEqual([20, 40]);
    const out = await rawOf(result.canonical.body);
    const [topR, , topB] = out.at(10, 4);
    const [botR, , botB] = out.at(10, 35);
    expect(topR).toBeGreaterThan(150); // the red half is now on top
    expect(topB).toBeLessThan(100);
    expect(botB).toBeGreaterThan(150); // the blue half is now on the bottom
    expect(botR).toBeLessThan(100);
    expect((await metadataOf(result.canonical.body)).orientation).toBeUndefined();
  });

  it('rotates the derivative the same way', async () => {
    const sideways = await realJpeg({
      width: 40,
      height: 20,
      pixels: redLeftBlueRight(40, 20),
      orientation: 6,
    });
    const result = await processor.process(sideways, 'notifications');
    const meta = await metadataOf(result.derivatives[0]!.body);
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it('leaves an upright photo alone', async () => {
    const upright = await realJpeg({ width: 40, height: 20, pixels: redLeftBlueRight(40, 20) });
    const result = await processor.process(upright, 'notifications');
    expect([result.width, result.height]).toEqual([40, 20]);
    const out = await rawOf(result.canonical.body);
    expect(out.at(4, 10)[0]).toBeGreaterThan(150); // red on the left
    expect(out.at(35, 10)[2]).toBeGreaterThan(150); // blue on the right
  });
});

describe('transparency', () => {
  it('keeps the transparency of a PNG in the WebP', async () => {
    const result = await processor.process(await realPng({ alpha: 0.4 }), 'notifications');
    expect((await metadataOf(result.canonical.body)).hasAlpha).toBe(true);
    expect((await rawOf(result.canonical.body)).at(4, 4)[3]).toBeLessThan(200);
  });

  it('stores an opaque picture without an alpha channel', async () => {
    for (const input of [await realJpeg(), await realPng(), await realWebp()]) {
      const result = await processor.process(input, 'notifications');
      expect((await metadataOf(result.canonical.body)).hasAlpha).toBe(false);
    }
  });

  it('flattens transparency onto white in the JPEG derivative, which cannot hold it', async () => {
    const result = await processor.process(
      await realPng({ alpha: 0, color: { r: 0, g: 0, b: 0 } }),
      'notifications',
    );
    const derivative = await rawOf(result.derivatives[0]!.body);
    expect((await metadataOf(result.derivatives[0]!.body)).hasAlpha).toBe(false);
    const [r, g, b] = derivative.at(8, 8);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(240);
  });
});

describe('the push derivative for FCM', () => {
  it('is a JPEG, since FCM guarantees JPEG and PNG but not WebP', async () => {
    const result = await processor.process(await realPng(), 'notifications');
    expect(result.derivatives).toHaveLength(1);
    expect(result.derivatives[0]).toMatchObject({ name: 'push', contentType: 'image/jpeg' });
    expect((await metadataOf(result.derivatives[0]!.body)).format).toBe('jpeg');
  });

  it('has the same size as the stored image', async () => {
    const result = await processor.process(await realJpeg({ width: 3000, height: 1500 }), 'notifications');
    const meta = await metadataOf(result.derivatives[0]!.body);
    expect([meta.width, meta.height]).toEqual([result.width, result.height]);
  });

  it('is baseline, not progressive, for the widest decoder support', async () => {
    const result = await processor.process(await realJpeg(), 'notifications');
    expect((await metadataOf(result.derivatives[0]!.body)).isProgressive).toBe(false);
  });

  it('stays under the 1 MB Android limit even for a picture that does not compress', async () => {
    // A 1440x1440 field of random noise is the worst case for JPEG: far over 1 MB at normal quality.
    const noise = Buffer.alloc(1600 * 1600 * 3);
    let seed = 12345;
    for (let i = 0; i < noise.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      noise[i] = seed >>> 24;
    }
    const png = await sharp(noise, { raw: { width: 1600, height: 1600, channels: 3 } })
      .png({ compressionLevel: 1 })
      .toBuffer();
    expect(png.length).toBeGreaterThan(IMAGE_UPLOAD_MAX_BYTES * 0.3); // really is hard to compress
    const result = await processor.process(png, 'notifications');
    expect(result.derivatives[0]!.body.length).toBeLessThan(1_000_000);
    expect((await metadataOf(result.derivatives[0]!.body)).format).toBe('jpeg');
  });

  it('is not made for a feature that does not ask for one', async () => {
    expect((await processor.process(await realJpeg(), 'exercises')).derivatives).toEqual([]);
  });
});

describe('what is refused', () => {
  it('an empty file', async () => {
    expect(await reasonOf(processor.process(Buffer.alloc(0), 'notifications'))).toBe('empty');
  });

  it('a file over the size limit, before anything is decoded', async () => {
    const decode = vi.fn();
    const spy = new ImageProcessor({ heic: { decode } as HeicDecoder });
    const tooBig = Buffer.concat([await realJpeg(), Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES)]);
    expect(await reasonOf(spy.process(tooBig, 'notifications'))).toBe('too_large');
    expect(decode).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly the size limit', async () => {
    const png = makePng({ totalBytes: IMAGE_UPLOAD_MAX_BYTES }); // a genuine 2x2 PNG padded to the limit
    expect(png.length).toBe(IMAGE_UPLOAD_MAX_BYTES);
    const result = await processor.process(png, 'notifications');
    expect(result.source.bytes).toBe(IMAGE_UPLOAD_MAX_BYTES);
  });

  it('refuses a file one byte over the limit', async () => {
    expect(
      await reasonOf(processor.process(makePng({ totalBytes: IMAGE_UPLOAD_MAX_BYTES + 1 }), 'notifications')),
    ).toBe('too_large');
  });

  it.each([
    ['a GIF', GIF_BYTES, 'gif'],
    ['a PDF', PDF_BYTES, 'pdf'],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'svg'],
    ['an AVIF', isoBmffHeader('avif', ['mif1', 'avif']), 'avif'],
    ['an HTML page', HTML_BYTES, 'unknown'],
    ['a TIFF', Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]), 'tiff'],
  ] as const)('%s, naming it', async (_name, bytes, detected) => {
    const error = await rejection(processor.process(bytes, 'notifications'));
    expect(error.reason).toBe('unsupported_format');
    expect(error.detected).toBe(detected);
  });

  it('reaches no decoder for a refused format', async () => {
    const decode = vi.fn();
    const spy = new ImageProcessor({ heic: { decode } as HeicDecoder });
    await rejection(spy.process(GIF_BYTES, 'notifications'));
    expect(decode).not.toHaveBeenCalled();
  });

  describe('damaged files: a good header is not enough', () => {
    it.each([
      ['JPEG', () => realJpeg({ width: 200, height: 200 })],
      ['PNG', () => realPng({ width: 200, height: 200 })],
      ['WebP', () => realWebp({ width: 200, height: 200 })],
    ] as const)('a truncated %s', async (_name, make) => {
      const whole = await make();
      expect(
        await reasonOf(processor.process(whole.subarray(0, Math.floor(whole.length / 2)), 'notifications')),
      ).toBe('corrupt');
    });

    it('a file that is only a signature', async () => {
      expect(await reasonOf(processor.process((await realPng()).subarray(0, 8), 'notifications'))).toBe(
        'corrupt',
      );
      expect(await reasonOf(processor.process(Buffer.from([0xff, 0xd8, 0xff]), 'notifications'))).toBe(
        'corrupt',
      );
    });

    it('a JPEG or PNG whose header is right but whose pixels are missing', async () => {
      expect(await reasonOf(processor.process(makeJpeg(), 'notifications'))).toBe('corrupt');
      expect(
        await reasonOf(
          processor.process(makePng({ width: 50, height: 50, stubPixels: true }), 'notifications'),
        ),
      ).toBe('corrupt');
    });

    it('a real image with its middle overwritten', async () => {
      const image = Buffer.from(await realJpeg({ width: 300, height: 300 }));
      image.fill(0x00, 200, image.length - 40);
      expect(await reasonOf(processor.process(image, 'notifications'))).toBe('corrupt');
    });

    it('does not say what the decoder said', async () => {
      const error = await rejection(processor.process((await realPng()).subarray(0, 40), 'notifications'));
      expect(error.message).toBe('Image rejected: corrupt');
    });
  });

  describe('size in pixels', () => {
    it('a picture wider than the limit', async () => {
      expect(
        await reasonOf(
          processor.process(await realPng({ width: IMAGE_MAX_DIMENSION + 1, height: 8 }), 'notifications'),
        ),
      ).toBe('dimensions');
    });

    it('a picture taller than the limit', async () => {
      expect(
        await reasonOf(
          processor.process(await realJpeg({ width: 8, height: IMAGE_MAX_DIMENSION + 1 }), 'notifications'),
        ),
      ).toBe('dimensions');
    });

    it('accepts the largest allowed side', async () => {
      const result = await processor.process(
        await realPng({ width: IMAGE_MAX_DIMENSION, height: 8 }),
        'notifications',
      );
      expect(result.source.width).toBe(IMAGE_MAX_DIMENSION);
    });

    it('a picture with too many pixels although neither side is too long', async () => {
      // 7000 x 6000 = 42 MP: both sides are within 8192, the total is over 40 MP.
      expect(
        await reasonOf(processor.process(await realPng({ width: 7000, height: 6000 }), 'notifications')),
      ).toBe('dimensions');
    });

    it('a decompression bomb: tiny file, enormous declared size, refused without being decoded', async () => {
      const bomb = makePng({ width: 60000, height: 60000 }); // a 100-odd-byte file claiming 3.6 gigapixels
      expect(bomb.length).toBeLessThan(200);
      expect(await reasonOf(processor.process(bomb, 'notifications'))).toBe('dimensions');
    });
  });

  it('an animated image', async () => {
    expect(await reasonOf(processor.process(await animatedWebp(), 'notifications'))).toBe('animated');
  });

  it('turns any library failure into a refusal, never a crash', async () => {
    for (const noise of [
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]),
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]),
    ]) {
      expect(await reasonOf(processor.process(noise, 'notifications'))).toBe('corrupt');
    }
  });
});

describe('HEIC', () => {
  it('decodes a real HEIC (HEVC) and converts it', async () => {
    const result = await processor.process(heicSample(), 'notifications');
    expect(result.source).toEqual({
      format: 'heic',
      bytes: heicSample().length,
      width: HEIC_SAMPLE_WIDTH,
      height: HEIC_SAMPLE_HEIGHT,
    });
    expect([result.width, result.height]).toEqual([HEIC_SAMPLE_WIDTH, HEIC_SAMPLE_HEIGHT]);
    expect((await metadataOf(result.canonical.body)).format).toBe('webp');
    expect((await metadataOf(result.derivatives[0]!.body)).format).toBe('jpeg');
  });

  it('keeps the picture: the converted HEIC is not blank', async () => {
    const result = await processor.process(heicSample(), 'notifications');
    const { data } = await rawOf(result.canonical.body);
    const distinct = new Set<number>();
    for (let i = 0; i < data.length; i += 4)
      distinct.add(data[i]! * 65536 + data[i + 1]! * 256 + data[i + 2]!);
    expect(distinct.size).toBeGreaterThan(10); // the test pattern has many colours
  });

  it('shows that Sharp alone cannot do this (why a separate decoder is needed)', async () => {
    await expect(sharp(heicSample()).webp().toBuffer()).rejects.toThrow(
      /HEVC|not been built in|compression format/i,
    );
  });

  it('refuses HEIC when it is switched off, saying so, and decodes nothing', async () => {
    expect(await reasonOf(noHeic.process(heicSample(), 'notifications'))).toBe('heic_disabled');
  });

  it('still handles JPEG, PNG and WebP when HEIC is switched off', async () => {
    for (const input of [await realJpeg(), await realPng(), await realWebp()]) {
      expect((await noHeic.process(input, 'notifications')).canonical.contentType).toBe('image/webp');
    }
  });

  it('refuses a HEIC that is damaged', async () => {
    const sample = heicSample();
    expect(await reasonOf(processor.process(sample.subarray(0, 300), 'notifications'))).toBe('corrupt');
    expect(await reasonOf(processor.process(isoBmffHeader('heic', ['mif1']), 'notifications'))).toBe(
      'corrupt',
    );
  });

  it('applies the pixel limit: the decoder is told the HEIC cap', async () => {
    const decode = vi.fn(async (): Promise<DecodedRaster> => ({
      width: 2,
      height: 2,
      rgba: new Uint8Array(16).fill(200),
    }));
    await new ImageProcessor({ heic: { decode } }).process(heicSample(), 'notifications');
    expect(decode).toHaveBeenCalledWith(expect.any(Uint8Array), HEIC_MAX_PIXELS);
  });

  it('passes on whatever refusal the decoder gives', async () => {
    const decoder: HeicDecoder = {
      decode: async () => {
        throw new ImageRejectedError('dimensions');
      },
    };
    expect(await reasonOf(new ImageProcessor({ heic: decoder }).process(heicSample(), 'notifications'))).toBe(
      'dimensions',
    );
  });

  it('converts whatever pixels a decoder returns, upright, without an alpha channel', async () => {
    const rgba = new Uint8Array(6 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([10, 200, 30, 255], i);
    const decoder: HeicDecoder = { decode: async () => ({ width: 6, height: 4, rgba }) };
    const result = await new ImageProcessor({ heic: decoder }).process(heicSample(), 'exercises');
    const meta = await metadataOf(result.canonical.body);
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([6, 4, false]);
    const [r, g, b] = (await rawOf(result.canonical.body)).at(2, 2);
    expect([r, g, b].map((v) => Math.round(v! / 10))).toEqual([1, 20, 3]);
  });
});

describe('the result', () => {
  it('says which feature it is for and what was uploaded', async () => {
    const input = await realPng({ width: 50, height: 30 });
    const result = await processor.process(input, 'exercises');
    expect(result.feature).toBe('exercises');
    expect(result.source).toEqual({ format: 'png', bytes: input.length, width: 50, height: 30 });
  });

  it('does not hand back the uploaded bytes', async () => {
    const input = await realWebp();
    const result = await processor.process(input, 'notifications');
    expect(result.canonical.body.equals(input)).toBe(false); // always re-encoded, even a WebP, so metadata cannot ride along
  });

  it('can run several conversions at the same time', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, async (_, i) =>
        processor.process(await realJpeg({ width: 100 + i, height: 80 }), 'notifications'),
      ),
    );
    expect(results.map((r) => r.source.width)).toEqual([100, 101, 102, 103, 104, 105]);
  });
});

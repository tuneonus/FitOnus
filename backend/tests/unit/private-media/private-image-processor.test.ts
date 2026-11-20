import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageRejectedError } from '../../../src/shared/images/image-errors.js';
import { ImageProcessor } from '../../../src/shared/images/image-processor.js';
import { LibheifDecoder } from '../../../src/shared/images/libheif-decoder.js';
import { PrivateImageProcessor } from '../../../src/shared/private-media/private-image-processor.js';
import {
  GIF_BYTES,
  animatedWebp,
  heicSample,
  makeJpeg,
  realJpeg,
  realPng,
  realWebp,
  redLeftBlueRight,
} from '../../helpers/images.js';

const processor = new PrivateImageProcessor({ intake: new ImageProcessor({ heic: new LibheifDecoder() }) });

const meta = (body: Buffer) => sharp(body).metadata();

describe('PrivateImageProcessor: avatar', () => {
  it('stores the centre square at 400 px and a 128 px square thumbnail, both WebP', async () => {
    const result = await processor.process(await realJpeg({ width: 3000, height: 2000 }), 'avatar');

    expect(result.canonical.contentType).toBe('image/webp');
    expect(result.canonical).toMatchObject({ width: 400, height: 400 });
    expect(result.thumbnail).toMatchObject({ width: 128, height: 128 });
    expect((await meta(result.canonical.body)).format).toBe('webp');
    expect((await meta(result.thumbnail.body)).format).toBe('webp');
    expect(result.thumbnail.body.byteLength).toBeLessThan(result.canonical.body.byteLength);
  });

  it('crops the centre, not the corner', async () => {
    // 120 px wide: left third red, middle third green, right third blue, 40 px tall. The centre square is the green.
    const pixels = Buffer.alloc(120 * 40 * 3);
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        const at = (y * 120 + x) * 3;
        const band = Math.floor(x / 40);
        pixels[at] = band === 0 ? 255 : 0;
        pixels[at + 1] = band === 1 ? 255 : 0;
        pixels[at + 2] = band === 2 ? 255 : 0;
      }
    }
    const input = await sharp(pixels, { raw: { width: 120, height: 40, channels: 3 } })
      .png()
      .toBuffer();
    const result = await processor.process(input, 'avatar');
    expect(result.canonical).toMatchObject({ width: 40, height: 40 });
    const { data } = await sharp(result.canonical.body)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const centre = (20 * 40 + 20) * 3;
    expect(data[centre + 1]).toBeGreaterThan(200); // green
    expect(data[centre]).toBeLessThan(60);
    expect(data[centre + 2]).toBeLessThan(60);
  });

  it('never enlarges a small picture: a 90x60 upload becomes a 60 px square', async () => {
    const result = await processor.process(await realPng({ width: 90, height: 60 }), 'avatar');
    expect(result.canonical).toMatchObject({ width: 60, height: 60 });
    expect(result.thumbnail).toMatchObject({ width: 60, height: 60 });
  });

  it('applies EXIF orientation before cropping', async () => {
    const upright = await processor.process(
      await realJpeg({ pixels: redLeftBlueRight(160, 80), width: 160, height: 80, orientation: 6 }),
      'avatar',
    );
    // Orientation 6 turns a 160x80 landscape into an 80x160 portrait: the square is 80 px.
    expect(upright.canonical).toMatchObject({ width: 80, height: 80 });
  });
});

describe('PrivateImageProcessor: progress photo', () => {
  it('keeps the whole picture at most 1600 px on the long side and makes a 200 px wide thumbnail', async () => {
    const result = await processor.process(await realJpeg({ width: 3000, height: 4000 }), 'progress');
    expect(result.canonical).toMatchObject({ width: 1200, height: 1600 });
    expect(result.thumbnail.width).toBe(200);
    expect(result.thumbnail.height).toBe(267);
    expect((await meta(result.canonical.body)).format).toBe('webp');
    expect((await meta(result.thumbnail.body)).format).toBe('webp');
  });

  it('does not re-encode the shared pipeline output a second time', async () => {
    const input = await realJpeg({ width: 800, height: 600 });
    const viaShared = await new ImageProcessor({ heic: null }).process(input, 'exercises');
    const result = await processor.process(input, 'progress');
    expect(result.canonical.body.equals(viaShared.canonical.body)).toBe(true);
  });

  it('never enlarges the thumbnail of a small picture', async () => {
    const result = await processor.process(await realPng({ width: 120, height: 90 }), 'progress');
    expect(result.canonical).toMatchObject({ width: 120, height: 90 });
    expect(result.thumbnail).toMatchObject({ width: 120, height: 90 });
  });

  it('accepts a phone HEIC photo', async () => {
    const result = await processor.process(heicSample(), 'progress');
    expect(result.source.format).toBe('heic');
    expect((await meta(result.canonical.body)).format).toBe('webp');
  });
});

describe.each(['avatar', 'progress'] as const)('PrivateImageProcessor: privacy of the %s result', (kind) => {
  it('carries no EXIF, no GPS and no camera details in either file', async () => {
    const input = await realJpeg({ exif: true, width: 400, height: 300 });
    expect((await meta(input)).exif).toBeDefined(); // the fixture really carries it
    const result = await processor.process(input, kind);
    for (const variant of [result.canonical, result.thumbnail]) {
      const info = await meta(variant.body);
      expect(info.exif).toBeUndefined();
      expect(info.xmp).toBeUndefined();
      expect(info.icc).toBeUndefined();
      const text = variant.body.toString('latin1');
      for (const marker of ['Exif', 'GPS', 'PrivateCameraMaker', 'PrivateModel', 'PrivateEditor']) {
        expect(text.includes(marker), marker).toBe(false);
      }
    }
  });

  it('carries no metadata from a WebP upload either', async () => {
    const result = await processor.process(await realWebp({ exif: true }), kind);
    expect((await meta(result.canonical.body)).exif).toBeUndefined();
  });

  it('refuses what the shared pipeline refuses, with the same reasons', async () => {
    const cases: [Buffer, string][] = [
      [Buffer.alloc(0), 'empty'],
      [GIF_BYTES, 'unsupported_format'],
      [makeJpeg({ width: 100, height: 100 }), 'corrupt'], // valid header, no real pixels
      [await animatedWebp(), 'animated'],
    ];
    for (const [input, reason] of cases) {
      const error = await processor.process(input, kind).catch((e: unknown) => e);
      expect(error, reason).toBeInstanceOf(ImageRejectedError);
      expect((error as ImageRejectedError).reason).toBe(reason);
    }
  });

  it('refuses HEIC when the server has HEIC switched off', async () => {
    const noHeic = new PrivateImageProcessor({ intake: new ImageProcessor({ heic: null }) });
    await expect(noHeic.process(heicSample(), kind)).rejects.toMatchObject({ reason: 'heic_disabled' });
  });
});

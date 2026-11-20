import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { ImageProcessor } from '../../../src/shared/images/image-processor.js';
import { LibheifDecoder } from '../../../src/shared/images/libheif-decoder.js';
import { heicRotatedSample, heicSample, realJpeg } from '../../helpers/images.js';

/**
 * Files as they come out of real cameras, phones, editors and screenshot tools, which differ from the tidy RGB files
 * a test usually builds: other colour models and bit depths, other encodings, extra data after the picture. Each one
 * is an ordinary, legitimate picture that an admin could pick, so each must convert, not be refused as "damaged".
 */

vi.setConfig({ testTimeout: 60_000 });

const processor = new ImageProcessor({ heic: null });

const colour = { r: 30, g: 120, b: 200 };
const solid = (channels: 3 | 4 = 3, width = 120, height = 80) =>
  sharp({ create: { width, height, channels, background: { ...colour, alpha: 0.6 } } });

/** Converts and checks the two outputs are a real WebP and a real JPEG of the expected size. */
async function convert(input: Buffer, expected = { width: 120, height: 80 }) {
  const result = await processor.process(input, 'notifications');
  const webp = await sharp(result.canonical.body).metadata();
  expect(webp.format).toBe('webp');
  expect([webp.width, webp.height]).toEqual([expected.width, expected.height]);
  const jpeg = await sharp(result.derivatives[0]!.body).metadata();
  expect(jpeg.format).toBe('jpeg');
  expect([jpeg.width, jpeg.height]).toEqual([expected.width, expected.height]);
  return { result, webp, jpeg };
}

/** The mean colour of the stored WebP, to prove the picture survived and was not blanked or colour-shifted. */
async function meanColour(body: Buffer): Promise<[number, number, number]> {
  const { channels } = await sharp(body).removeAlpha().stats();
  return [channels[0]!.mean, channels[1]!.mean, channels[2]!.mean];
}

describe('colour models and bit depths', () => {
  it('a greyscale JPEG', async () => {
    // 'b-w' makes a genuine single-channel file (greyscale() alone still writes three channels).
    const input = await solid().toColourspace('b-w').jpeg().toBuffer();
    expect((await sharp(input).metadata()).channels).toBe(1);
    const { result } = await convert(input);
    const [r, g, b] = await meanColour(result.canonical.body);
    expect(Math.abs(r - g)).toBeLessThan(3);
    expect(Math.abs(g - b)).toBeLessThan(3);
  });

  it('a greyscale PNG with transparency', async () => {
    const input = await sharp({
      create: { width: 120, height: 80, channels: 4, background: { r: 90, g: 90, b: 90, alpha: 0.5 } },
    })
      .greyscale()
      .png()
      .toBuffer();
    const { webp } = await convert(input);
    expect(webp.hasAlpha).toBe(true);
  });

  it('a 16-bit PNG', async () => {
    const input = await solid().toColourspace('rgb16').png().toBuffer();
    expect((await sharp(input).metadata()).depth).toBe('ushort');
    const { result } = await convert(input);
    const [r, g, b] = await meanColour(result.canonical.body);
    expect(r).toBeCloseTo(colour.r, -1);
    expect(g).toBeCloseTo(colour.g, -1);
    expect(b).toBeCloseTo(colour.b, -1);
  });

  it('an indexed (palette) PNG with transparency', async () => {
    const input = await solid(4).png({ palette: true, colours: 16 }).toBuffer();
    const { webp } = await convert(input);
    expect(webp.hasAlpha).toBe(true);
  });

  it('a CMYK JPEG (print and some editing tools), converted to RGB without a colour cast', async () => {
    const input = await solid().toColourspace('cmyk').jpeg().toBuffer();
    expect((await sharp(input).metadata()).space).toBe('cmyk');
    const { result } = await convert(input);
    const [r, , b] = await meanColour(result.canonical.body);
    // Not blank and not inverted: the picture is still predominantly blue.
    expect(b).toBeGreaterThan(r);
  });

  it('a 1-bit black and white PNG', async () => {
    const input = await solid().greyscale().threshold(128).png({ colours: 2 }).toBuffer();
    await convert(input);
  });

  it('a lossless WebP with transparency', async () => {
    const input = await solid(4).webp({ lossless: true }).toBuffer();
    const { webp } = await convert(input);
    expect(webp.hasAlpha).toBe(true);
  });
});

describe('encodings and extra data', () => {
  it('a progressive JPEG', async () => {
    await convert(await solid().jpeg({ progressive: true }).toBuffer());
  });

  it('a JPEG with 4:4:4 chroma and one with 4:2:0', async () => {
    await convert(await solid().jpeg({ chromaSubsampling: '4:4:4' }).toBuffer());
    await convert(await solid().jpeg({ chromaSubsampling: '4:2:0' }).toBuffer());
  });

  it('a JPEG with trailing zero padding after the end marker (some cameras and upload tools append it)', async () => {
    const jpeg = await solid().jpeg().toBuffer();
    await convert(Buffer.concat([jpeg, Buffer.alloc(2048)]));
  });

  it('a JPEG with a second JPEG appended (Ultra HDR and multi-picture phone photos carry a gain map this way)', async () => {
    const primary = await solid().jpeg().toBuffer();
    const gainMap = await solid(3, 30, 20).jpeg().toBuffer();
    const { result } = await convert(Buffer.concat([primary, gainMap]));
    // The picture is the primary image, not the small appended one.
    expect([result.width, result.height]).toEqual([120, 80]);
  });

  it('a very small picture (1 x 1)', async () => {
    const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: colour } })
      .png()
      .toBuffer();
    await convert(input, { width: 1, height: 1 });
  });

  it('a very wide, thin banner', async () => {
    const input = await solid(3, 3000, 40).jpeg().toBuffer();
    const { result } = await convert(input, { width: 1440, height: 19 });
    expect(result.source).toMatchObject({ width: 3000, height: 40 });
  });

  it('a JPEG with an unusual EXIF orientation on a PNG-sized picture (orientation 8: rotated a quarter turn)', async () => {
    const input = await realJpeg({ width: 300, height: 100, orientation: 8 });
    const { result } = await convert(input, { width: 100, height: 300 });
    expect(result.source).toMatchObject({ width: 300, height: 100 });
  });

  it('a WebP that carries EXIF and an ICC profile', async () => {
    const input = await solid()
      .withExif({ IFD0: { Make: 'PrivateCameraMaker' } })
      .withIccProfile('p3')
      .webp()
      .toBuffer();
    const { result } = await convert(input);
    const out = Buffer.from(result.canonical.body);
    expect(out.includes(Buffer.from('PrivateCameraMaker'))).toBe(false);
    expect((await sharp(out).metadata()).icc).toBeUndefined();
  });
});

describe('HEIC orientation (how an iPhone marks a portrait photo)', () => {
  const withHeic = new ImageProcessor({ heic: new LibheifDecoder() });

  /** Mean absolute difference per channel between two same-size images. */
  async function difference(a: Buffer, b: Buffer): Promise<number> {
    const [x, y] = await Promise.all(
      [a, b].map((body) => sharp(body).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
    );
    expect([x!.info.width, x!.info.height]).toEqual([y!.info.width, y!.info.height]);
    let total = 0;
    for (let i = 0; i < x!.data.length; i += 1) total += Math.abs(x!.data[i]! - y!.data[i]!);
    return total / x!.data.length;
  }

  it('turns a photo whose file says "rotate a quarter turn" upright, instead of storing it sideways', async () => {
    const plain = await withHeic.process(heicSample(), 'notifications');
    const portrait = await withHeic.process(heicRotatedSample(), 'notifications');

    // The stored pixels are 96 x 64; the file asks for them to be shown 64 x 96.
    expect([plain.width, plain.height]).toEqual([96, 64]);
    expect([portrait.width, portrait.height]).toEqual([64, 96]);
    expect(portrait.source).toMatchObject({ format: 'heic', width: 64, height: 96 });

    // And it is the same picture turned the right way (counter-clockwise), not merely a differently shaped one.
    const counterClockwise = await sharp(plain.canonical.body).rotate(270).toBuffer();
    const clockwise = await sharp(plain.canonical.body).rotate(90).toBuffer();
    const right = await difference(portrait.canonical.body, counterClockwise);
    const wrong = await difference(portrait.canonical.body, clockwise);
    expect(right).toBeLessThan(8);
    expect(wrong).toBeGreaterThan(right * 3);
  });

  it('the push JPEG is turned the same way', async () => {
    const portrait = await withHeic.process(heicRotatedSample(), 'notifications');
    const meta = await sharp(portrait.derivatives[0]!.body).metadata();
    expect([meta.width, meta.height]).toEqual([64, 96]);
  });
});

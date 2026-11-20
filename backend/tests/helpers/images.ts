import { readFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';

/**
 * Builders for test images.
 *
 * Two kinds, on purpose:
 * - `real*` use Sharp's encoders and make genuine, decodable pictures. Use these for anything that must go through the
 *   image pipeline successfully.
 * - `makePng` / `makeJpeg` below write only the structure (signature, header, size, end marker) with stub pixel data.
 *   They look like a PNG/JPEG to anything that reads headers but cannot be decoded, which makes them the right fixture
 *   for "valid header, damaged body", for declared-dimension limits, and for size-limit tests.
 */

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export interface PngOptions {
  width?: number;
  height?: number;
  /** Pads the file (with an ancillary text chunk before IEND) to exactly this many bytes. */
  totalBytes?: number;
  /**
   * Writes stub pixel data (too little for the declared size) so the file has a valid header and end chunk but cannot
   * be decoded. Defaults to true for large pictures, which would otherwise take real memory to build, and false for
   * small ones, which then are genuine, decodable PNGs.
   */
  stubPixels?: boolean;
}

/** A PNG with correct signature, IHDR, IDAT and IEND chunks (real pixel data for small sizes). */
export function makePng({
  width = 2,
  height = 2,
  totalBytes,
  stubPixels = width * height > 65_536,
}: PngOptions = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = stubPixels ? Buffer.alloc(8) : Buffer.alloc(height * (1 + width * 4));
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
  ];
  const iend = pngChunk('IEND', Buffer.alloc(0));
  const base = parts.reduce((sum, part) => sum + part.length, 0) + iend.length;
  if (totalBytes !== undefined) {
    if (totalBytes < base) throw new Error(`A PNG needs at least ${base} bytes`);
    // A chunk costs 12 bytes of framing; `totalBytes === base + 1..11` cannot be padded exactly.
    if (totalBytes > base) {
      if (totalBytes - base < 12) throw new Error('Cannot pad a PNG by fewer than 12 bytes');
      parts.push(pngChunk('tEXt', Buffer.alloc(totalBytes - base - 12, 0x61)));
    }
  }
  return Buffer.concat([...parts, iend]);
}

export interface JpegOptions {
  width?: number;
  height?: number;
  /** Uses SOF2 (progressive) instead of SOF0 (baseline). */
  progressive?: boolean;
  /** Puts an APP1 (EXIF-sized) segment of this many bytes before the frame header. */
  exifBytes?: number;
  /** Puts a DHT segment (0xFFC4, which looks like a frame marker but is not one) before the frame header. */
  dhtBeforeFrame?: boolean;
  /** Pads the file with trailing zero bytes (after EOI) to exactly this many bytes. */
  totalBytes?: number;
}

const u16 = (value: number): Buffer => Buffer.from([(value >> 8) & 0xff, value & 0xff]);

/** A JPEG with SOI, JFIF, a frame header carrying the size, a scan stub and EOI. */
export function makeJpeg({
  width = 2,
  height = 2,
  progressive = false,
  exifBytes,
  dhtBeforeFrame = false,
  totalBytes,
}: JpegOptions = {}): Buffer {
  const segments: Buffer[] = [
    Buffer.from([0xff, 0xd8]),
    Buffer.concat([
      Buffer.from([0xff, 0xe0]),
      u16(16),
      Buffer.from('JFIF\0', 'ascii'),
      Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ]),
  ];
  if (exifBytes !== undefined) {
    segments.push(
      Buffer.concat([Buffer.from([0xff, 0xe1]), u16(exifBytes + 2), Buffer.alloc(exifBytes, 0x45)]),
    );
  }
  if (dhtBeforeFrame)
    segments.push(Buffer.concat([Buffer.from([0xff, 0xc4]), u16(5), Buffer.from([0, 0, 0])]));
  segments.push(
    Buffer.concat([
      Buffer.from([0xff, progressive ? 0xc2 : 0xc0]),
      u16(17),
      Buffer.from([8]),
      u16(height),
      u16(width),
      Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ]),
    Buffer.concat([
      Buffer.from([0xff, 0xda]),
      u16(12),
      Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
      Buffer.from([0x12, 0x34, 0x56]),
    ]),
    Buffer.from([0xff, 0xd9]),
  );
  const file = Buffer.concat(segments);
  if (totalBytes === undefined) return file;
  if (totalBytes < file.length) throw new Error(`A JPEG needs at least ${file.length} bytes`);
  return Buffer.concat([file, Buffer.alloc(totalBytes - file.length)]);
}

export const GIF_BYTES = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff;', 'binary');
export const HTML_BYTES = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
export const PDF_BYTES = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');

// ---------------------------------------------------------------- real, decodable images (Sharp)

export interface RealImageOptions {
  width?: number;
  height?: number;
  color?: { r: number; g: number; b: number };
}

const base = ({ width = 64, height = 48, color = { r: 200, g: 60, b: 60 } }: RealImageOptions = {}) =>
  sharp({ create: { width, height, channels: 3, background: color } });

/** A JPEG. `exif` adds camera and GPS metadata; `orientation` sets the EXIF Orientation tag (1-8). */
export async function realJpeg(
  options: RealImageOptions & { exif?: boolean; orientation?: number; pixels?: Buffer } = {},
): Promise<Buffer> {
  let image = options.pixels
    ? sharp(options.pixels, {
        raw: { width: options.width ?? 64, height: options.height ?? 48, channels: 3 },
      })
    : base(options);
  if (options.exif) {
    image = image.withExif({
      IFD0: { Make: 'PrivateCameraMaker', Model: 'PrivateModel', Software: 'PrivateEditor' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '12/1 58/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '77/1 35/1 0/1',
      },
    });
  }
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  return image.jpeg({ quality: 90 }).toBuffer();
}

/** A PNG. `alpha` (0-1) makes every pixel that translucent. */
export async function realPng(options: RealImageOptions & { alpha?: number } = {}): Promise<Buffer> {
  const { width = 64, height = 48, color = { r: 0, g: 160, b: 80 }, alpha } = options;
  return sharp({
    create: {
      width,
      height,
      channels: alpha === undefined ? 3 : 4,
      background: { ...color, alpha: alpha ?? 1 },
    },
  })
    .png()
    .toBuffer();
}

export async function realWebp(options: RealImageOptions & { exif?: boolean } = {}): Promise<Buffer> {
  let image = base(options);
  if (options.exif) image = image.withExif({ IFD0: { Make: 'PrivateCameraMaker' } });
  return image.webp().toBuffer();
}

/** A WebP with two frames. */
export async function animatedWebp(width = 16, height = 16): Promise<Buffer> {
  const frame = (value: number) => Buffer.alloc(width * height * 3, value);
  return sharp(Buffer.concat([frame(40), frame(220)]), {
    raw: { width, height: height * 2, channels: 3, pageHeight: height },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

/**
 * Pads a real, decodable PNG to exactly `totalBytes` with valid ancillary text chunks placed before IEND, so the result
 * is still a genuine picture of exactly that size (for the upload size limit, where a stub PNG would be refused as
 * damaged long before the limit mattered). Chunks stay under 1 MB each, well inside what PNG decoders accept.
 */
export function padPng(png: Buffer, totalBytes: number): Buffer {
  let gap = totalBytes - png.length;
  if (gap < 0) throw new Error(`The PNG is already ${png.length} bytes`);
  if (gap === 0) return png;
  if (gap < 20) throw new Error('Cannot pad a PNG by fewer than 20 bytes');
  const chunks: Buffer[] = [];
  while (gap > 0) {
    let take = Math.min(gap, 1_000_000);
    if (gap - take > 0 && gap - take < 20) take = gap - 20; // never leave a remainder too small for a chunk
    // 12 bytes of framing and an 8 byte keyword ("Comment" and a NUL) leave the rest for padding.
    chunks.push(
      pngChunk('tEXt', Buffer.concat([Buffer.from('Comment\0', 'latin1'), Buffer.alloc(take - 20, 0x61)])),
    );
    gap -= take;
  }
  return Buffer.concat([png.subarray(0, png.length - 12), ...chunks, png.subarray(png.length - 12)]);
}

/** Left half red, right half blue, as raw RGB, so an orientation or crop mistake shows up in the pixels. */
export function redLeftBlueRight(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      const left = x < width / 2;
      pixels[at] = left ? 230 : 20;
      pixels[at + 1] = 20;
      pixels[at + 2] = left ? 20 : 230;
    }
  }
  return pixels;
}

/** The checked-in HEIC (see tests/fixtures/images/README.md): 96x64, HEVC. */
export const HEIC_SAMPLE_WIDTH = 96;
export const HEIC_SAMPLE_HEIGHT = 64;
export const heicSample = (): Buffer =>
  readFileSync(path.resolve(import.meta.dirname, '../fixtures/images/sample.heic'));
/**
 * The same picture with an `irot` property (a quarter turn counter-clockwise), the way an iPhone marks a portrait photo:
 * the stored pixels are 96x64 and the file says to display them as 64x96.
 */
export const heicRotatedSample = (): Buffer =>
  readFileSync(path.resolve(import.meta.dirname, '../fixtures/images/sample-rotated.heic'));

/** The start of an ISO-BMFF file (HEIC, AVIF, MP4...): an `ftyp` box naming a major brand and compatible brands. */
export function isoBmffHeader(majorBrand: string, compatible: string[] = []): Buffer {
  const size = 16 + compatible.length * 4; // size, 'ftyp', major brand, minor version, then one entry per brand
  const box = Buffer.alloc(size);
  box.writeUInt32BE(size, 0);
  box.write('ftyp', 4, 'latin1');
  box.write(majorBrand, 8, 'latin1');
  compatible.forEach((brand, index) => box.write(brand, 16 + index * 4, 'latin1'));
  return Buffer.concat([box, Buffer.alloc(64)]);
}

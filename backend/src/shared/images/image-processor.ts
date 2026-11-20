import sharp from 'sharp';
import { ImageRejectedError } from './image-errors.js';
import { sniffImageFormat, type AcceptedFormat } from './image-format.js';
import {
  DERIVATIVE_FORMAT,
  FEATURE_PROFILES,
  HEIC_MAX_PIXELS,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_PIXELS,
  IMAGE_UPLOAD_MAX_BYTES,
  type DerivativeName,
  type DerivativeProfile,
  type PublicImageFeature,
} from './image-policy.js';

/** Pixels straight from a decoder, 8 bits per channel, RGBA, already upright. */
export interface DecodedRaster {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Turns HEIC bytes into pixels. Refuses anything beyond `maxPixels` before allocating memory for it. */
export interface HeicDecoder {
  decode(bytes: Uint8Array, maxPixels: number): Promise<DecodedRaster>;
}

export interface StoredVariant {
  body: Buffer;
  contentType: string;
}

export interface ProcessedImage {
  feature: PublicImageFeature;
  /** The image to store and to show: WebP, no metadata, sRGB, upright, within the feature's size. */
  canonical: StoredVariant & { contentType: 'image/webp' };
  /** Other formats some consumer needs (a JPEG for FCM). Stored beside the canonical image. */
  derivatives: (StoredVariant & { name: DerivativeName })[];
  /** Size of the canonical image. */
  width: number;
  height: number;
  /** What was uploaded, for the audit trail. */
  source: { format: AcceptedFormat; bytes: number; width: number; height: number };
}

/** A Sharp pipeline. Derived from the factory because the library's own type is a namespace member. */
type Pipeline = ReturnType<typeof sharp>;

interface Opened {
  /** Builds a fresh pipeline over the decoded source (a pipeline is single-use). */
  pipeline: () => Pipeline;
  format: AcceptedFormat;
  width: number;
  height: number;
  hasAlpha: boolean;
}

interface Raster {
  data: Buffer;
  width: number;
  height: number;
  channels: 3 | 4;
}

const rawInput = (raster: Raster): Pipeline =>
  sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: raster.channels } });

/** JPEG quality steps and the shrink factors tried, in order, until a derivative fits its size budget. */
const QUALITY_STEP = 8;
const SHRINK_FACTORS = [1, 0.85, 0.7, 0.55, 0.4] as const;

/**
 * The one place images are decoded and re-encoded. Everything uploaded to the public bucket passes through here, so
 * the result never depends on what the client sent:
 *
 * - the format is decided from the bytes (JPEG, PNG, WebP or HEIC), and anything else never reaches a decoder;
 * - the file is fully decoded, so a damaged, truncated or mislabelled file is refused rather than stored;
 * - size, dimensions and decoded pixel count are limited, and animated images are refused;
 * - EXIF orientation is applied, then ALL metadata (EXIF including GPS, XMP, ICC, thumbnails) is dropped and the
 *   colours are converted to sRGB, so the picture looks the same but carries nothing about where or how it was taken;
 * - the result is a resized, optimized WebP, plus any derivative the feature's profile asks for.
 */
export class ImageProcessor {
  constructor(private readonly deps: { heic: HeicDecoder | null }) {}

  async process(input: Uint8Array, feature: PublicImageFeature): Promise<ProcessedImage> {
    const profile = FEATURE_PROFILES[feature];
    if (input.byteLength === 0) throw new ImageRejectedError('empty');
    if (input.byteLength > IMAGE_UPLOAD_MAX_BYTES) throw new ImageRejectedError('too_large');

    const sniffed = sniffImageFormat(input);
    if (!sniffed.accepted) throw new ImageRejectedError('unsupported_format', sniffed.format);

    try {
      const opened =
        sniffed.format === 'heic' ? await this.openHeic(input) : await this.openStill(input, sniffed.format);
      const raster = await this.normalise(opened, profile.maxEdge);

      const canonical = await rawInput(raster)
        // Opaque pictures are stored without an alpha channel; a transparent PNG keeps its transparency.
        .webp({ quality: profile.webpQuality, effort: 4, smartSubsample: true })
        .toBuffer();

      const derivatives: ProcessedImage['derivatives'] = [];
      for (const derivative of profile.derivatives) {
        derivatives.push({
          name: derivative.name,
          body: await fitJpeg(raster, derivative),
          contentType: DERIVATIVE_FORMAT[derivative.name].contentType,
        });
      }

      return {
        feature,
        canonical: { body: canonical, contentType: 'image/webp' },
        derivatives,
        width: raster.width,
        height: raster.height,
        source: {
          format: opened.format,
          bytes: input.byteLength,
          width: opened.width,
          height: opened.height,
        },
      };
    } catch (error) {
      if (error instanceof ImageRejectedError) throw error;
      // Whatever the decoder or encoder said (it can name internal paths) stays inside; the caller gets a category.
      throw new ImageRejectedError('corrupt');
    }
  }

  private async openStill(input: Uint8Array, format: Exclude<AcceptedFormat, 'heic'>): Promise<Opened> {
    // failOn "warning" (the default) makes truncated and damaged files fail instead of decoding to a half-grey picture.
    const open = () =>
      sharp(input, { limitInputPixels: IMAGE_MAX_PIXELS, failOn: 'warning', animated: false });
    // Reading the header decodes no pixels, so it is done without the library's pixel cap: that cap would otherwise
    // fire here and turn "too many pixels" into "damaged file". Our own check below gives the right answer, and the
    // pipeline that actually decodes (`open`) keeps the cap as a second line of defence.
    const meta = await sharp(input, {
      limitInputPixels: false,
      failOn: 'warning',
      animated: false,
    }).metadata();
    // The decoder must have read the same format the header sniffing found: a mismatch means a crafted file.
    if (meta.format !== format) throw new ImageRejectedError('corrupt');
    if ((meta.pages ?? 1) > 1) throw new ImageRejectedError('animated');
    const { width, height } = meta;
    if (!width || !height) throw new ImageRejectedError('corrupt');
    if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION || width * height > IMAGE_MAX_PIXELS) {
      throw new ImageRejectedError('dimensions');
    }
    return { pipeline: open, format, width, height, hasAlpha: meta.hasAlpha === true };
  }

  private async openHeic(input: Uint8Array): Promise<Opened> {
    if (!this.deps.heic) throw new ImageRejectedError('heic_disabled');
    // Sharp cannot decode HEVC, so the pixels come from the HEIC decoder and Sharp takes over from there.
    const decoded = await this.deps.heic.decode(input, HEIC_MAX_PIXELS);
    const pixels = Buffer.from(decoded.rgba.buffer, decoded.rgba.byteOffset, decoded.rgba.byteLength);
    return {
      pipeline: () => sharp(pixels, { raw: { width: decoded.width, height: decoded.height, channels: 4 } }),
      format: 'heic',
      width: decoded.width,
      height: decoded.height,
      // A phone photo is opaque; the decoder's alpha channel is always full, so it is not carried over.
      hasAlpha: false,
    };
  }

  /** Upright, sRGB, no larger than `maxEdge`, as raw pixels that every output is then encoded from. */
  private async normalise(opened: Opened, maxEdge: number): Promise<Raster> {
    const base = opened
      .pipeline()
      .autoOrient()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb');
    const { data, info } = await (opened.hasAlpha ? base.ensureAlpha() : base.removeAlpha())
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3 && info.channels !== 4) throw new ImageRejectedError('corrupt');
    return { data, width: info.width, height: info.height, channels: info.channels };
  }
}

/**
 * A baseline JPEG that fits the derivative's size budget: quality steps down first, and if even the lowest quality is
 * too big the picture is made smaller. JPEG has no transparency, so transparent areas are flattened onto white.
 */
async function fitJpeg(raster: Raster, profile: DerivativeProfile): Promise<Buffer> {
  const fitScale = Math.min(1, profile.maxEdge / Math.max(raster.width, raster.height));
  for (const shrink of SHRINK_FACTORS) {
    const width = Math.max(1, Math.round(raster.width * fitScale * shrink));
    const height = Math.max(1, Math.round(raster.height * fitScale * shrink));
    const resized =
      width === raster.width && height === raster.height
        ? rawInput(raster)
        : rawInput(raster).resize(width, height, { fit: 'fill' });
    for (let quality = profile.startQuality; quality >= profile.minQuality; quality -= QUALITY_STEP) {
      // The mozjpeg encoder's size optimisations, but NOT its `mozjpeg: true` shorthand: that also turns on
      // optimiseScans, which forces a progressive JPEG. A baseline file is what every Android decoder handles.
      const jpeg = await resized
        .clone()
        .flatten({ background: '#ffffff' })
        .jpeg({
          quality,
          trellisQuantisation: true,
          overshootDeringing: true,
          quantisationTable: 3,
          chromaSubsampling: '4:2:0',
          progressive: false,
        })
        .toBuffer();
      if (jpeg.length < profile.maxBytes) return jpeg;
    }
  }
  throw new ImageRejectedError('too_large');
}

import sharp from 'sharp';
import { ImageRejectedError } from '../images/image-errors.js';
import type { ProcessedImage } from '../images/image-processor.js';
import type { PublicImageFeature } from '../images/image-policy.js';
import {
  PRIVATE_IMAGE_PROFILES,
  PRIVATE_INTAKE_FEATURE,
  type PrivateImageKind,
  type PrivateImageProfile,
} from './private-image-policy.js';

export interface PrivateImageVariant {
  body: Buffer;
  contentType: 'image/webp';
  width: number;
  height: number;
}

export interface PrivateProcessedImage {
  kind: PrivateImageKind;
  /** The picture to store and show: WebP, no metadata, sRGB, upright, within the kind's size. */
  canonical: PrivateImageVariant;
  /** The small copy for headers, lists and grids. */
  thumbnail: PrivateImageVariant;
  /** What was uploaded, for the log (never the picture itself). */
  source: ProcessedImage['source'];
}

/** What this needs from the shared pipeline: decode and validate an upload into a clean WebP. */
export interface ImageIntake {
  process(input: Uint8Array, feature: PublicImageFeature): Promise<ProcessedImage>;
}

type Pipeline = ReturnType<typeof sharp>;

const toVariant = async (pipeline: Pipeline): Promise<PrivateImageVariant> => {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { body: data, contentType: 'image/webp', width: info.width, height: info.height };
};

/**
 * Turns an uploaded picture into the stored picture and its thumbnail for a member photo (avatar or progress photo).
 *
 * Everything that must never differ from the rest of the platform is the shared `ImageProcessor`'s job and is not
 * repeated here: the format comes from the bytes (JPEG, PNG, WebP, HEIC), the file must fully decode, size, dimension
 * and pixel limits apply, animated images are refused, EXIF orientation is applied and ALL metadata (including GPS)
 * is removed. Its output (a validated WebP of at most 1600 px) is the intake this class crops and resizes:
 *
 * - avatar: the centre square, at most 400 px (never enlarged), thumbnail 128 px;
 * - progress photo: the whole picture, at most 1600 px on the long side (the intake as it is, no second lossy
 *   encode), thumbnail 200 px wide.
 */
export class PrivateImageProcessor {
  constructor(private readonly deps: { intake: ImageIntake }) {}

  async process(input: Uint8Array, kind: PrivateImageKind): Promise<PrivateProcessedImage> {
    const profile = PRIVATE_IMAGE_PROFILES[kind];
    // Throws ImageRejectedError for anything that is not an acceptable picture.
    const intake = await this.deps.intake.process(input, PRIVATE_INTAKE_FEATURE);

    try {
      const canonical =
        profile.shape === 'square'
          ? await this.cropSquare(intake.canonical.body, profile.maxEdge, profile.webpQuality)
          : {
              body: intake.canonical.body,
              contentType: 'image/webp' as const,
              width: intake.width,
              height: intake.height,
            };
      const thumbnail = await this.thumbnail(canonical, profile);
      return { kind, canonical, thumbnail, source: intake.source };
    } catch (error) {
      if (error instanceof ImageRejectedError) throw error;
      // The intake is our own validated WebP, so a failure here is not the member's file: keep the library's text inside.
      throw new ImageRejectedError('corrupt');
    }
  }

  /** The centre square of the picture, scaled down to at most `edge` (a smaller picture keeps its own, smaller, square). */
  private cropSquare(webp: Buffer, edge: number, quality: number): Promise<PrivateImageVariant> {
    return sharp(webp)
      .metadata()
      .then(({ width, height }) => {
        if (!width || !height) throw new ImageRejectedError('corrupt');
        const side = Math.min(width, height, edge);
        return toVariant(
          sharp(webp)
            .resize(side, side, { fit: 'cover', position: 'centre' })
            .webp({ quality, effort: 4, smartSubsample: true }),
        );
      });
  }

  private thumbnail(
    canonical: PrivateImageVariant,
    profile: PrivateImageProfile,
  ): Promise<PrivateImageVariant> {
    const { size, webpQuality } = profile.thumbnail;
    const source = sharp(canonical.body);
    const resized =
      profile.shape === 'square'
        ? source.resize(Math.min(size, canonical.width), Math.min(size, canonical.width), { fit: 'cover' })
        : source.resize({ width: size, withoutEnlargement: true });
    return toVariant(resized.webp({ quality: webpQuality, effort: 4, smartSubsample: true }));
  }
}

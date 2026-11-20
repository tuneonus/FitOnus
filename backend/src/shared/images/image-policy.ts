import { randomBytes } from 'node:crypto';

/**
 * The storage policy for every image this backend writes to the PUBLIC media bucket.
 *
 * - One root prefix, `onusfit/`, then one folder per feature: `onusfit/notifications/`, `onusfit/exercises/` and
 *   `onusfit/workouts/` (the cover of a system workout template).
 * - Every stored image is a WebP named by 128 random bits: `onusfit/<feature>/<32 hex>.webp`. The name says nothing
 *   about the file or its owner, can be neither guessed nor chosen by a client, and is never reused.
 * - Anything a feature needs in another format is a *derivative* stored next to the canonical image under a name
 *   computed from it, so no extra database column is needed to find it.
 *
 * The bucket is public. The list of features below is therefore closed and holds only admin-authored content. Member
 * photos (meals, progress, avatars) are private and must never be added here: they are not stored in this bucket
 * at all, and nothing in this module can be pointed at them.
 */

export const IMAGE_KEY_ROOT = 'onusfit';

export const PUBLIC_IMAGE_FEATURES = ['notifications', 'exercises', 'workouts'] as const;
export type PublicImageFeature = (typeof PUBLIC_IMAGE_FEATURES)[number];

export const isPublicImageFeature = (value: unknown): value is PublicImageFeature =>
  typeof value === 'string' && (PUBLIC_IMAGE_FEATURES as readonly string[]).includes(value);

// ---------------------------------------------------------------- what may be uploaded

/**
 * Content-Type values an upload may declare. The declared type only decides whether the body is read at all; the
 * bytes are then inspected for what they really are, and a mismatch between the two is harmless because the image is
 * decoded and re-encoded either way.
 */
export const ACCEPTED_UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const isAcceptedUploadContentType = (mediaType: string): boolean =>
  (ACCEPTED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(mediaType);

/** Largest file accepted. A 12 MP phone photo is 2-6 MB; the stored result is far smaller. */
export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Longest side, in pixels, of the file as uploaded. */
export const IMAGE_MAX_DIMENSION = 8192;
/** Decoded size cap. A small file can still describe a huge bitmap; this bounds the memory decoding may use. */
export const IMAGE_MAX_PIXELS = 40_000_000;
/**
 * HEIC is decoded in WebAssembly, which needs several times more memory per pixel (about 180 MB measured for 12 MP).
 * 16 MP covers every 12 MP phone photo with room to spare and keeps a decode inside a small instance.
 */
export const HEIC_MAX_PIXELS = 16_000_000;

// ---------------------------------------------------------------- what is stored

/** The stored name is random and never reused, so a cache may keep the file for as long as it likes. */
export const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type DerivativeName = 'push';

export interface DerivativeProfile {
  name: DerivativeName;
  /** Longest side of the derivative. */
  maxEdge: number;
  /** JPEG quality to start from, stepping down until the file fits. */
  startQuality: number;
  minQuality: number;
  /** The file must be smaller than this. */
  maxBytes: number;
}

export interface FeatureImageProfile {
  /** Longest side of the stored image. Larger uploads are scaled down; smaller ones are never enlarged. */
  maxEdge: number;
  webpQuality: number;
  derivatives: readonly DerivativeProfile[];
}

export const FEATURE_PROFILES: Readonly<Record<PublicImageFeature, FeatureImageProfile>> = {
  notifications: {
    // Android shows the picture about 2:1 and scales it to the screen; 1440 px is sharp on any phone.
    maxEdge: 1440,
    webpQuality: 80,
    derivatives: [
      {
        // FCM documents JPEG, PNG and BMP as fully supported on every platform and says WebP "has varying levels of
        // support across platforms and platform versions", with a 1 MB image limit on Android. The push therefore
        // carries this JPEG, while the WebP stays the canonical copy. Kept under 1,000,000 bytes to be safe.
        name: 'push',
        maxEdge: 1440,
        startQuality: 82,
        minQuality: 45,
        maxBytes: 1_000_000,
      },
    ],
  },
  exercises: { maxEdge: 1600, webpQuality: 80, derivatives: [] },
  // The cover of a system workout template, drawn across the full width of a phone card. Scaled down, never cropped:
  // the app decides how to crop it for each place it is shown.
  workouts: { maxEdge: 1600, webpQuality: 80, derivatives: [] },
};

export const DERIVATIVE_FORMAT: Readonly<
  Record<DerivativeName, { extension: 'jpg'; contentType: 'image/jpeg' }>
> = {
  push: { extension: 'jpg', contentType: 'image/jpeg' },
};

// ---------------------------------------------------------------- object keys

const HEX = '[0-9a-f]{32}';
const FEATURE_ALTERNATION = PUBLIC_IMAGE_FEATURES.join('|');

/** The only shape of a stored image's key: `onusfit/<feature>/<32 hex>.webp`. */
export const CANONICAL_IMAGE_KEY_PATTERN = new RegExp(
  `^${IMAGE_KEY_ROOT}/(?:${FEATURE_ALTERNATION})/${HEX}\\.webp$`,
);

export function isCanonicalImageKey(value: unknown, feature?: PublicImageFeature): value is string {
  if (typeof value !== 'string' || !CANONICAL_IMAGE_KEY_PATTERN.test(value)) return false;
  return feature === undefined || value.startsWith(`${IMAGE_KEY_ROOT}/${feature}/`);
}

export function newImageKey(
  feature: PublicImageFeature,
  random: (size: number) => Uint8Array = randomBytes,
): string {
  return `${IMAGE_KEY_ROOT}/${feature}/${Buffer.from(random(16)).toString('hex')}.webp`;
}

export const featureOfKey = (key: string): PublicImageFeature | null =>
  isCanonicalImageKey(key) ? (key.split('/')[1] as PublicImageFeature) : null;

/** Where a derivative of a canonical image lives: `onusfit/notifications/<hex>.push.jpg`. */
export function derivativeKey(canonicalKey: string, name: DerivativeName): string {
  if (!isCanonicalImageKey(canonicalKey)) throw new Error('Not a canonical image key');
  return `${canonicalKey.slice(0, -'.webp'.length)}.${name}.${DERIVATIVE_FORMAT[name].extension}`;
}

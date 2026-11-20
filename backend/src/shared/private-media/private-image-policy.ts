import { randomBytes } from 'node:crypto';
import type { PublicImageFeature } from '../images/image-policy.js';

/**
 * The storage policy for member photos (avatars and progress photos) in the PRIVATE bucket.
 *
 * This is deliberately a different module, bucket, credential and key space from `shared/images/image-policy.ts`:
 * that one describes the PUBLIC media bucket (admin-authored artwork behind a public domain) and must never learn
 * about member photos. Nothing here can name a public key, and nothing there can name a private one.
 *
 * - One root prefix, `members/`, then the owner's id, then the kind: `members/<user id>/<kind>/<32 hex>.webp`.
 *   The owner's id in the key lets the database (a CHECK) and the code (`isOwnedPrivateImageKey`) both refuse a key
 *   that belongs to someone else, and lets a person audit a bucket listing by owner.
 * - The 32 hex digits are 128 random bits chosen by the server, never reused. A *replacement* is therefore always a
 *   new key, which is also what makes client caches safe: a stale picture can never be served for a new key.
 * - The thumbnail sits beside the image under a name computed from it (`<same name>.thumb.webp`), so no column has to
 *   remember it.
 * - The bucket has no public access and no public domain. Pictures are read only through short-lived signed URLs
 *   that the backend issues after it has checked who owns the picture.
 */

export const PRIVATE_KEY_ROOT = 'members';

export const PRIVATE_IMAGE_KINDS = ['avatar', 'progress'] as const;
export type PrivateImageKind = (typeof PRIVATE_IMAGE_KINDS)[number];

// ---------------------------------------------------------------- what is stored

/** Names are random and never reused, so a client may keep a picture for as long as it likes. `private`: no shared caches. */
export const PRIVATE_IMAGE_CACHE_CONTROL = 'private, max-age=31536000, immutable';

export interface PrivateImageProfile {
  /** Longest side (progress) or side of the square (avatar) of the stored image. Smaller uploads are never enlarged. */
  maxEdge: number;
  webpQuality: number;
  /** `square` crops to the centre; `inside` keeps the whole picture. */
  shape: 'square' | 'inside';
  thumbnail: {
    /** Square side (avatar) or width (progress). */
    size: number;
    webpQuality: number;
  };
}

export const PRIVATE_IMAGE_PROFILES: Readonly<Record<PrivateImageKind, PrivateImageProfile>> = {
  // Shown at most about 120 pt wide: 400 px is sharp on a 3x screen. The thumbnail is for headers and lists.
  avatar: { maxEdge: 400, webpQuality: 82, shape: 'square', thumbnail: { size: 128, webpQuality: 78 } },
  // 1600 px on the long side is the documented 1200 px width of a 3:4 portrait. The 200 px thumbnail is for the grid.
  progress: { maxEdge: 1600, webpQuality: 80, shape: 'inside', thumbnail: { size: 200, webpQuality: 75 } },
};

/**
 * The size profile of the shared (public) pipeline that does the decoding and validation of an upload. Private
 * pictures reuse that pipeline untouched for everything that must never differ (format sniffing, size and pixel
 * limits, HEIC, animated images, orientation, metadata and GPS removal) and are then cropped and resized from its
 * validated output, which is at most 1600 px. A test pins that this profile stays big enough and derivative-free.
 */
export const PRIVATE_INTAKE_FEATURE: PublicImageFeature = 'exercises';
export const PRIVATE_INTAKE_MIN_EDGE = 1600;

// ---------------------------------------------------------------- object keys

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const HEX = '[0-9a-f]{32}';

/** Every object this backend may write to the private bucket (an image or its thumbnail). */
export const PRIVATE_OBJECT_KEY_PATTERN = new RegExp(
  `^${PRIVATE_KEY_ROOT}/(${UUID})/(${PRIVATE_IMAGE_KINDS.join('|')})/(${HEX})(\\.thumb)?\\.webp$`,
);

export interface ParsedPrivateKey {
  ownerId: string;
  kind: PrivateImageKind;
  /** The 32 random hex digits: what identifies one stored picture, and changes whenever a picture is replaced. */
  token: string;
  thumbnail: boolean;
}

export function parsePrivateObjectKey(value: unknown): ParsedPrivateKey | null {
  if (typeof value !== 'string') return null;
  const match = PRIVATE_OBJECT_KEY_PATTERN.exec(value);
  if (!match) return null;
  return {
    ownerId: match[1]!,
    kind: match[2] as PrivateImageKind,
    token: match[3]!,
    thumbnail: match[4] !== undefined,
  };
}

export const isPrivateObjectKey = (value: unknown): value is string => parsePrivateObjectKey(value) !== null;

/** True only for a canonical (not thumbnail) key of this kind that belongs to this user. */
export function isOwnedPrivateImageKey(
  value: unknown,
  ownerId: string,
  kind: PrivateImageKind,
): value is string {
  const parsed = parsePrivateObjectKey(value);
  return parsed !== null && !parsed.thumbnail && parsed.ownerId === ownerId && parsed.kind === kind;
}

export function newPrivateImageKey(
  ownerId: string,
  kind: PrivateImageKind,
  random: (size: number) => Uint8Array = randomBytes,
): string {
  const key = `${PRIVATE_KEY_ROOT}/${ownerId}/${kind}/${Buffer.from(random(16)).toString('hex')}.webp`;
  // A malformed owner id (not a lower-case UUID) must never produce a key: fail here, not in storage.
  if (!isOwnedPrivateImageKey(key, ownerId, kind))
    throw new Error('Not a valid owner id for a private image key');
  return key;
}

/** Where the thumbnail of a canonical image lives: `members/<id>/avatar/<hex>.thumb.webp`. */
export function privateThumbnailKey(canonicalKey: string): string {
  const parsed = parsePrivateObjectKey(canonicalKey);
  if (!parsed || parsed.thumbnail) throw new Error('Not a canonical private image key');
  return `${canonicalKey.slice(0, -'.webp'.length)}.thumb.webp`;
}

/** The image and its thumbnail: every object a stored picture owns. */
export const privateObjectKeysOf = (canonicalKey: string): [string, string] => [
  canonicalKey,
  privateThumbnailKey(canonicalKey),
];

/** What identifies a stored picture and changes on every replacement: the clients' cache key. */
export function imageVersionOf(canonicalKey: string): string {
  const parsed = parsePrivateObjectKey(canonicalKey);
  if (!parsed || parsed.thumbnail) throw new Error('Not a canonical private image key');
  return parsed.token;
}

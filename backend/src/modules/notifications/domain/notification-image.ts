import { IMAGE_KEY_ROOT, derivativeKey, isCanonicalImageKey } from '../../../shared/images/image-policy.js';

/**
 * How a notification refers to its picture.
 *
 * Two key shapes exist, and both stay valid:
 *
 * - canonical (current): `onusfit/notifications/<32 hex>.webp`. The image policy (shared/images) produced it: an
 *   optimized WebP with no metadata, and beside it a JPEG for the push (`....push.jpg`), because FCM only guarantees
 *   JPEG and PNG.
 * - legacy: `notifications/<32 hex>.jpg|png`, written before the policy. The file is exactly what was uploaded then.
 *   Existing campaigns hold these keys and phones may already have shown their URLs, so they are never rewritten,
 *   moved or deleted: they keep resolving to the same public URL and are sent to FCM as they are.
 *
 * What is stored on a campaign is only ever a key, never a URL; every URL is built here from the trusted media origin.
 */

export const LEGACY_NOTIFICATION_IMAGE_KEY_PATTERN = /^notifications\/[0-9a-f]{32}\.(?:jpg|png)$/;

/** Every key a notification may hold. The database CHECK (migration 0022) allows exactly these two shapes. */
export const NOTIFICATION_IMAGE_KEY_PATTERN = new RegExp(
  `^(?:notifications/[0-9a-f]{32}\\.(?:jpg|png)|${IMAGE_KEY_ROOT}/notifications/[0-9a-f]{32}\\.webp)$`,
);

export const isLegacyNotificationImageKey = (value: unknown): value is string =>
  typeof value === 'string' && LEGACY_NOTIFICATION_IMAGE_KEY_PATTERN.test(value);

export const isNotificationImageKey = (value: unknown): value is string =>
  typeof value === 'string' && NOTIFICATION_IMAGE_KEY_PATTERN.test(value);

/**
 * The objects that must exist for the notification to be sendable: a canonical image needs its push JPEG as well, a
 * legacy image is the one file. Checking all of them means a half-written pair is never used.
 */
export const requiredObjectKeys = (key: string): string[] =>
  isCanonicalImageKey(key, 'notifications') ? [key, derivativeKey(key, 'push')] : [key];

/** The media type of a Content-Type header, lower-cased and without parameters (`image/PNG; x=1` -> `image/png`). */
export { mediaTypeOf } from '../../../shared/images/public-image-upload.js';

// ---------------------------------------------------------------- public URLs

/** Maps a stored key to a public URL, or null when there is no image or the media domain is not configured. */
export type ImageUrlResolver = (key: string | null) => string | null;

const trimmed = (publicBaseUrl: string | null): string | null =>
  publicBaseUrl ? publicBaseUrl.replace(/\/+$/, '') : null;

/**
 * The public URL of the stored image, for showing it (admin preview, history). A stored value that is not a
 * well-formed key (impossible through the API, but a database row can be edited by hand) resolves to nothing rather
 * than to a URL.
 */
export function createImageUrlResolver(publicBaseUrl: string | null): ImageUrlResolver {
  const base = trimmed(publicBaseUrl);
  return (key) => (base && isNotificationImageKey(key) ? `${base}/${key}` : null);
}

/**
 * The URL FCM is given. A canonical image is delivered as its JPEG derivative (FCM documents JPEG and PNG as fully
 * supported on every platform and WebP as having "varying levels of support"); a legacy image is already JPEG or PNG
 * and is delivered as it always was, at the same URL.
 */
export function createPushImageUrlResolver(publicBaseUrl: string | null): ImageUrlResolver {
  const base = trimmed(publicBaseUrl);
  return (key) => {
    if (!base || !isNotificationImageKey(key)) return null;
    return `${base}/${isCanonicalImageKey(key, 'notifications') ? derivativeKey(key, 'push') : key}`;
  };
}

export const NO_IMAGE_URLS: ImageUrlResolver = () => null;

/**
 * Getting a meal photo ready to send to the AI.
 *
 * The photo travels as base64 text inside a JSON request, which is a third bigger than the file, and the server turns
 * down anything over 10 million characters. A modern phone camera easily produces a photo near that size, and
 * waiting for a long upload only to be told "too large" is the worst way to find out. So the app compresses harder
 * (a meal does not need print quality: the AI recognises food from a 0.5-quality JPEG just as well), checks the size
 * before uploading anything, and fixes the file type labels some phones attach.
 *
 * Shrinking the pixel dimensions as well would need `expo-image-manipulator`, which this app does not ship yet.
 */

/** JPEG quality asked of the camera and gallery pickers (0-1). */
export const MEAL_PHOTO_QUALITY = 0.5;

/** The server's limit on the base64 text of a photo (backend shared/ai/body-limits.ts, ai-backend core/image.py). */
export const MEAL_PHOTO_MAX_BASE64_CHARS = 10 * 1024 * 1024;

const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type MealPhotoMimeType = (typeof SUPPORTED)[number];

const ALIASES: Record<string, MealPhotoMimeType> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/heif': 'image/heic',
};

const BY_EXTENSION: Record<string, MealPhotoMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
};

export const MEAL_PHOTO_TOO_LARGE_MESSAGE =
  'That photo is too large to analyze. Take it again with a lower camera resolution, or pick a smaller photo.';
export const MEAL_PHOTO_UNREADABLE_MESSAGE = 'We couldn’t read that photo. Please try again.';
export const MEAL_PHOTO_UNSUPPORTED_MESSAGE = 'Use a JPEG, PNG, WebP or HEIC photo.';

export interface PickedMealPhoto {
  uri?: string | null | undefined;
  base64?: string | null | undefined;
  mimeType?: string | null | undefined;
}

export type PreparedMealPhoto =
  | { ok: true; base64: string; mimeType: MealPhotoMimeType }
  | { ok: false; message: string };

function resolveMimeType(photo: PickedMealPhoto): MealPhotoMimeType | null {
  const declared = photo.mimeType?.toLowerCase().trim();
  if (declared) {
    const alias = ALIASES[declared];
    if (alias) return alias;
    return (SUPPORTED as readonly string[]).includes(declared) ? (declared as MealPhotoMimeType) : null;
  }
  // The picker did not say: the file extension is the next best evidence, and the camera's default is JPEG.
  const extension = photo.uri?.split('?')[0]?.split('.').pop()?.toLowerCase();
  return (extension && BY_EXTENSION[extension]) || 'image/jpeg';
}

export function prepareMealPhoto(photo: PickedMealPhoto): PreparedMealPhoto {
  const base64 = photo.base64?.trim();
  if (!base64) return { ok: false, message: MEAL_PHOTO_UNREADABLE_MESSAGE };

  const mimeType = resolveMimeType(photo);
  if (!mimeType) return { ok: false, message: MEAL_PHOTO_UNSUPPORTED_MESSAGE };

  if (base64.length > MEAL_PHOTO_MAX_BASE64_CHARS) {
    return { ok: false, message: MEAL_PHOTO_TOO_LARGE_MESSAGE };
  }
  return { ok: true, base64, mimeType };
}

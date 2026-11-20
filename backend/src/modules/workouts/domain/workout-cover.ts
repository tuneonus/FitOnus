import { isCanonicalImageKey } from '../../../shared/images/image-policy.js';
import type { PublicImageUrlResolver } from '../../../shared/images/public-image-url.js';

/**
 * How a workout template refers to its cover picture: an image an admin uploaded, stored as a canonical
 * `onusfit/workouts/<32 hex>.webp` key and never as a URL. The public URL is built from the trusted media origin.
 * Unlike an exercise there is no external-address fallback: a template either has an uploaded cover or none.
 */
export const isWorkoutCoverKey = (value: unknown): value is string => isCanonicalImageKey(value, 'workouts');

/** The resolver for when media storage is not configured: a cover then has no URL (the app shows no cover). */
export const NO_WORKOUT_COVER_URLS: PublicImageUrlResolver = () => null;

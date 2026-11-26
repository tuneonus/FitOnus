import { images } from '@/shared/constants/images';
import { SEED_UUID_TO_SLUG } from '../data/workoutsMock';

/**
 * OnusFit Exercise Asset Standardization Specification.
 *
 * Defines canonical dimensions, formats, and content rules for workout infographics.
 */
export const EXERCISE_ASSET_STANDARD = {
  preferred: {
    width: 1200,
    height: 960,
    aspectRatio: 1200 / 960, // 5:4 (1.25)
    format: 'image/webp' as const,
  },
  compatible: [
    {
      width: 1024,
      height: 1024,
      aspectRatio: 1, // 1:1 (1.0)
      format: 'image/webp' as const,
    },
    {
      width: 1200,
      height: 896,
      aspectRatio: 1200 / 896, // ~4:3 (1.339)
      format: 'image/jpeg' as const,
    },
    {
      width: 1080,
      height: 1350,
      aspectRatio: 1080 / 1350, // 4:5 portrait (0.8) - OnusFit workout infographic
      format: 'image/webp' as const,
    },
  ],
  contentRules: {
    character: 'Realistic muscular male character with consistent face and Man Bun hairstyle',
    attire: 'Fitted black athletic briefs covering private areas on front and back anatomy figures',
    definition: 'Sharp anatomical muscle definition with biomechanical target highlighting',
    muscleColors: {
      primary: 'Red (#E53935 / #DC2626)',
      secondary: 'Orange (#FB8C00 / #EA580C)',
    },
    theme: 'Compact navy-blue (#0A1128) background with orange branding accents',
    labels: 'Bottom horizontal primary and secondary muscle tags',
    prohibited:
      'No sets, reps, rest, difficulty badges, or How-to instructions embedded inside image assets',
    required: 'Legible exercise name, anatomical muscle highlighting, and OnusFit brand identity',
  },
} as const;

/**
 * 4:5 portrait (1080 x 1350) OnusFit workout infographic.
 *
 * This is only the placeholder ratio used until an image's real size is known. What is
 * actually displayed always follows the image's own width and height, so any ratio
 * (4:5, 5:4, 1:1 ...) is shown whole, at full width, with no cropping or letterboxing.
 */
export const EXERCISE_INFOGRAPHIC_ASPECT_RATIO = 1080 / 1350;

/**
 * Width / height for a pair of pixel dimensions, or null when either value is missing,
 * non-numeric, non-finite or not positive (so a bad value never reaches layout).
 */
export function aspectRatioFromSize(width: unknown, height: unknown): number | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

/** Maximum accepted length for remote image addresses */
const MAX_URL_LENGTH = 2048;

/**
 * Validates whether a given string is a safe absolute http or https URL.
 */
export function isSafeExerciseImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
      ? trimmed
      : null;
  } catch {
    return null;
  }
}

/**
 * Stable exercise ID to bundled asset map.
 * Exercises without a bundled asset (such as Barbell Bench Press) safely resolve to null,
 * allowing them to show admin-uploaded images from the backend or the safe fallback.
 * Mapping is strictly keyed by stable ID, never by list index or fuzzy name.
 */
export const STABLE_EXERCISE_ASSET_MAP: Record<string, any> = {
  'push-up': images.pushUp,
};

export interface ResolveExerciseImageParams {
  exerciseId?: string | null | undefined;
  imageUrl?: string | null | undefined;
  imageKey?: string | null | undefined;
  updatedAt?: string | null | undefined;
}

export interface ResolvedExerciseImage {
  /** Validated remote URL if available */
  uri: string | null;
  /** Bundled local asset source if mapped */
  localSource: any | null;
  /** Whether the image is a safe fallback */
  isFallback: boolean;
  /** Cache key for expo-image or cache busting */
  cacheKey: string;
  /**
   * Placeholder width / height used until the image's real size is known. The component
   * replaces it with the measured ratio (bundled assets immediately, remote on load).
   */
  aspectRatio: number;
}

/**
 * Resolves an exercise to its verified image source based on stable exercise ID and database record.
 * Prioritizes backend uploaded/external URL, falls back to stable ID-based bundled asset,
 * or safely indicates fallback.
 */
export function resolveExerciseImage(params: ResolveExerciseImageParams): ResolvedExerciseImage {
  const { exerciseId, imageUrl, imageKey, updatedAt } = params;

  // 1. Check for valid remote URL (from backend PostgreSQL record or admin upload)
  const safeUrl = isSafeExerciseImageUrl(imageUrl);
  if (safeUrl) {
    const versionKey = imageKey || updatedAt || safeUrl;
    const cacheKey = `exercise-img-${exerciseId || 'remote'}-${versionKey}`;
    return {
      uri: safeUrl,
      localSource: null,
      isFallback: false,
      cacheKey,
      aspectRatio: EXERCISE_INFOGRAPHIC_ASPECT_RATIO,
    };
  }

  // 2. Check for stable bundled asset by exercise ID (UUID or slug)
  if (exerciseId) {
    const stableSlug = SEED_UUID_TO_SLUG[exerciseId] ?? exerciseId.toLowerCase().trim();
    const bundled = STABLE_EXERCISE_ASSET_MAP[stableSlug];
    if (bundled) {
      return {
        uri: null,
        localSource: bundled,
        isFallback: false,
        cacheKey: `exercise-local-${stableSlug}`,
        aspectRatio: EXERCISE_INFOGRAPHIC_ASPECT_RATIO,
      };
    }
  }

  // 3. Safe fallback when no asset is available
  return {
    uri: null,
    localSource: null,
    isFallback: true,
    cacheKey: `exercise-fallback-${exerciseId || 'unknown'}`,
    aspectRatio: EXERCISE_INFOGRAPHIC_ASPECT_RATIO,
  };
}

/**
 * Computes container dimensions for responsive display while preserving aspect ratio.
 */
export function calculateResponsiveImageDimensions(
  containerWidth: number,
  aspectRatio: number = EXERCISE_ASSET_STANDARD.preferred.aspectRatio,
): { width: number; height: number } {
  const safeWidth = Math.max(0, containerWidth);
  const safeRatio = aspectRatio > 0 ? aspectRatio : EXERCISE_ASSET_STANDARD.preferred.aspectRatio;
  return {
    width: safeWidth,
    height: Math.round(safeWidth / safeRatio),
  };
}

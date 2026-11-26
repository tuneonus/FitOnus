import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  type ImageLoadEvent,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import { Dumbbell } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { resolveExerciseImage, aspectRatioFromSize } from '../utils/exercise-image';

/** Real width / height of remote images, remembered so revisiting a screen never re-flows. */
const measuredRatios = new Map<string, number>();

/** Width / height of a bundled asset; known synchronously, so there is no layout jump. */
function bundledAssetRatio(source: ImageSourcePropType): number | null {
  try {
    const asset = Image.resolveAssetSource(source);
    return aspectRatioFromSize(asset?.width, asset?.height);
  } catch {
    return null;
  }
}

export interface ExerciseImageProps {
  /** Stable exercise ID (UUID or slug) */
  exerciseId?: string | null | undefined;
  /** Remote URL or local asset reference */
  uri?: string | null | undefined;
  /** Direct local bundled asset (if provided) */
  localSource?: any;
  /** Public key of uploaded image for cache busting */
  imageKey?: string | null | undefined;
  /** Last updated ISO timestamp for cache busting */
  updatedAt?: string | null | undefined;
  /** Accessible description / exercise name */
  alt?: string | undefined;
  /** Visual presentation variant */
  variant?: 'hero' | 'thumbnail' | undefined;
  /** Optional aspect ratio override (width / height). Normally the image's own ratio is used. */
  aspectRatio?: number | undefined;
  /**
   * Edge-to-edge presentation: square corners, no side margins. The image already takes 100% of
   * its parent's width, so the parent must not add horizontal padding (the exercise detail screen
   * zeroes it). No negative margins are used, so the image can never shift or be clipped.
   */
  fullBleed?: boolean | undefined;
  /** Outer container style override */
  style?: StyleProp<ViewStyle> | undefined;
  /** Inner image style override */
  imageStyle?: StyleProp<ImageStyle> | undefined;
  /** Test identifier */
  testID?: string | undefined;
}

/**
 * Responsive, aspect-ratio-preserving exercise image component.
 *
 * Rules enforced:
 * - Always 100% of the available width; height is derived from the image's own ratio
 *   (4:5 infographics, 5:4, 1:1 ... all shown whole), never a fixed pixel height.
 * - The ratio is measured from the image (bundled assets at once, remote images on load) and
 *   remembered, so the infographic is neither cropped nor letterboxed.
 * - Enforces resizeMode="contain" as a safety net so anatomical figures, branding, and
 *   muscle labels remain 100% visible on all mobile screen widths.
 * - Gracefully falls back to a branded placeholder on missing asset or loading failure.
 * - Busses cache whenever imageKey or updatedAt changes.
 */
export function ExerciseImage({
  exerciseId,
  uri,
  localSource,
  imageKey,
  updatedAt,
  alt = 'Exercise',
  variant = 'hero',
  aspectRatio,
  fullBleed = false,
  style,
  imageStyle,
  testID,
}: ExerciseImageProps) {
  const { colors } = useTheme();

  const resolved = resolveExerciseImage({
    exerciseId,
    imageUrl: typeof uri === 'string' ? uri : null,
    imageKey,
    updatedAt,
  });

  const localAsset = localSource ?? resolved.localSource ?? null;
  const source = localAsset ?? (resolved.uri ? { uri: resolved.uri } : null);

  // Error and measured-size state are tied to the current source, so a new image (different
  // exercise, new upload) starts clean instead of inheriting the previous one's state.
  const sourceKey = resolved.cacheKey;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [measured, setMeasured] = useState<{ key: string; ratio: number } | null>(null);
  const loadError = failedKey === sourceKey;

  const intrinsicRatio = localAsset
    ? bundledAssetRatio(localAsset)
    : measured?.key === sourceKey
      ? measured.ratio
      : (measuredRatios.get(sourceKey) ?? null);
  const effectiveAspectRatio = aspectRatio ?? intrinsicRatio ?? resolved.aspectRatio;

  const isUnavailable = resolved.isFallback || source === null || loadError;

  const handleLoad = (event: ImageLoadEvent) => {
    const { width, height } = event.nativeEvent.source;
    const ratio = aspectRatioFromSize(width, height);
    if (ratio === null) return;
    measuredRatios.set(sourceKey, ratio);
    setMeasured({ key: sourceKey, ratio });
  };

  // Thumbnail mode (for list items in exercise library)
  if (variant === 'thumbnail') {
    if (isUnavailable) {
      return (
        <View
          testID={testID}
          style={[styles.thumbnailContainer, { backgroundColor: colors.surface2 }, style]}
        >
          <Dumbbell size={23} color={colors.accentStrong} />
        </View>
      );
    }

    return (
      <View
        testID={testID}
        style={[styles.thumbnailContainer, { backgroundColor: colors.surface2 }, style]}
      >
        <Image
          source={source}
          style={[styles.thumbnailImage, imageStyle]}
          resizeMode="contain"
          accessible
          accessibilityLabel={alt}
          onError={() => setFailedKey(sourceKey)}
        />
      </View>
    );
  }

  // Hero mode (for ExerciseDetailScreen and workout viewports)
  const containerStyle = [
    styles.heroContainer,
    {
      backgroundColor: colors.surface2,
      aspectRatio: effectiveAspectRatio,
    },
    fullBleed && styles.fullBleedContainer,
    style,
  ];

  if (isUnavailable) {
    return (
      <View testID={testID} style={containerStyle}>
        <Dumbbell size={44} color={colors.muted} />
      </View>
    );
  }

  return (
    <View testID={testID} style={containerStyle}>
      <Image
        source={source}
        style={[styles.heroImage, imageStyle]}
        resizeMode="contain"
        accessible
        accessibilityLabel={`${alt} infographic`}
        accessibilityIgnoresInvertColors
        onLoad={handleLoad}
        onError={() => setFailedKey(sourceKey)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: premium.radius.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBleedContainer: {
    borderRadius: 0,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    alignSelf: 'center',
  },
  thumbnailContainer: {
    width: 52,
    height: 64,
    borderRadius: premium.radius.control,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});

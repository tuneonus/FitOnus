import React, { useState } from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { workoutCoverUri } from '../utils/workout-cover';

interface WorkoutCoverProps {
  /** The `coverImageUrl` the backend sent for the routine (null or absent when it has none). */
  uri: string | null | undefined;
  /** Size, margins and corners: the card and the detail screen place the same picture differently. */
  style?: StyleProp<ImageStyle>;
}

/**
 * The cover picture of a curated workout routine. Renders nothing at all when there is no cover, or when the picture
 * cannot be loaded, so the surrounding layout never shows a broken image or an empty box: the card and the detail
 * screen simply look as they did before covers existed. Decorative (the routine's name is right next to it), so it is
 * hidden from screen readers.
 */
export function WorkoutCover({ uri, style }: WorkoutCoverProps) {
  const { colors } = useTheme();
  const source = workoutCoverUri(uri);
  // Remember WHICH address failed, so a routine that later gets a different cover is tried again.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (source === null || failedUri === source) return null;

  return (
    <Image
      source={{ uri: source }}
      style={[styles.image, { backgroundColor: colors.surface2 }, style]}
      resizeMode="cover"
      accessible={false}
      importantForAccessibility="no"
      accessibilityIgnoresInvertColors
      onError={() => setFailedUri(source)}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    // Wide, like the pictures admins are asked to upload; the picture is cropped to fit, never stretched.
    aspectRatio: 16 / 9,
    alignSelf: 'stretch',
  },
});

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { images } from '@/shared/constants/images';

export type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  tone?: 'default' | 'hero';
  /** Show the "Own Your Fitness." tagline under the wordmark. */
  withTagline?: boolean;
};

export function Logo({
  size = 40,
  withWordmark = false,
  tone = 'default',
  withTagline = false,
}: LogoProps) {
  const { colors } = useTheme();

  const textColor = tone === 'hero' ? colors.heroInk : colors.ink;
  const mutedColor = tone === 'hero' ? colors.heroMuted : colors.muted;

  return (
    <View style={styles.container}>
      <View
        accessibilityRole="image"
        accessibilityLabel="OnusFit"
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            // A radius larger than the artwork's own corner keeps its square edges hidden.
            borderRadius: size * 0.26,
          },
        ]}
      >
        <Image source={images.brandIcon} style={styles.mark} resizeMode="cover" />
      </View>

      {withWordmark && (
        <View>
          <Text style={[styles.wordmark, { color: textColor, fontSize: Math.max(18, size * 0.5) }]}>
            OnusFit
          </Text>
          {withTagline ? (
            <Text style={[styles.tagline, { color: mutedColor }]}>Own Your Fitness.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tile: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  mark: {
    width: '100%',
    height: '100%',
    // The artwork carries generous built-in padding; enlarge it so the mark reads at small sizes.
    transform: [{ scale: 1.32 }],
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  tagline: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 1,
  },
});

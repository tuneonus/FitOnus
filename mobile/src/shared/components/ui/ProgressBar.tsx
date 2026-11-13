import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type ProgressBarProps = {
  value?: number | undefined; // 0 to 1 (or value / max if max provided)
  progress?: number | undefined;
  max?: number | undefined;
  color?: string | undefined;
  trackColor?: string | undefined;
  height?: number | undefined;
  style?: ViewStyle | undefined;
  accessibilityLabel?: string | undefined;
};

export function ProgressBar({
  value,
  progress,
  max,
  color,
  trackColor,
  height = 8,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const { colors } = useTheme();

  const numValue = value ?? progress ?? 0;
  const ratio = max && max > 0 ? numValue / max : numValue;
  const clamped = Math.max(0, Math.min(1, isNaN(ratio) ? 0 : ratio));
  const fillColor = color ?? colors.accentStrong;
  const bgTrack = trackColor ?? colors.surface2;

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        accessibilityLabel ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined
      }
      style={[
        styles.track,
        {
          height,
          borderRadius: height / 2,
          backgroundColor: bgTrack,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

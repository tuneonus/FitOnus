import React from 'react';
import { View, StyleSheet, ViewStyle, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { useTween } from '@/hooks/use-tween';
import { progressOffset } from '@/shared/theme/motion';

export type ProgressBarProps = {
  value?: number | undefined; // 0 to 1 (or value / max if max provided)
  progress?: number | undefined;
  max?: number | undefined;
  color?: string | undefined;
  trackColor?: string | undefined;
  height?: number | undefined;
  style?: ViewStyle | undefined;
  accessibilityLabel?: string | undefined;
  /** Ease the fill toward each new value instead of jumping. Default true. */
  animated?: boolean | undefined;
  /** Grow from empty the first time it appears. Default true; turn off for a bar that starts full (a draining timer). */
  animateOnMount?: boolean | undefined;
  /** Length of one move of the fill. Default 400 ms. */
  tweenMs?: number | undefined;
  /** Move at constant speed: a bar updated once a second can then glide continuously instead of stepping. */
  linear?: boolean | undefined;
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
  animated = true,
  animateOnMount = true,
  tweenMs,
  linear = false,
}: ProgressBarProps) {
  const { colors } = useTheme();

  const numValue = value ?? progress ?? 0;
  const ratio = max && max > 0 ? numValue / max : numValue;
  const clamped = Math.max(0, Math.min(1, isNaN(ratio) ? 0 : ratio));
  const fillColor = color ?? colors.accentStrong;
  const bgTrack = trackColor ?? colors.surface2;

  // The fill is a full-width bar slid along the clipped track with a transform (cheap, runs on the UI thread),
  // not a width that changes every frame. It stays hidden until the track has been measured, so it never flashes full.
  const shown = useTween(clamped, {
    durationMs: animated ? tweenMs : 0,
    linear,
    fromZero: animated && animateOnMount,
  });
  const trackWidth = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => ({
    opacity: trackWidth.get() > 0 ? 1 : 0,
    transform: [{ translateX: progressOffset(shown.get(), trackWidth.get()) }],
  }));
  const onLayout = (event: LayoutChangeEvent) => {
    trackWidth.set(event.nativeEvent.layout.width);
  };

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        accessibilityLabel ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined
      }
      onLayout={onLayout}
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
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: fillColor,
          },
          fillStyle,
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
    width: '100%',
  },
});

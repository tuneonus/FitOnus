import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  radius?: number;
  style?: ViewStyle;
};

/** The pulse this placeholder has always had: breathing between these opacities, 800 ms each way. */
const PULSE_LOW = 0.4;
const PULSE_HIGH = 0.85;
const PULSE_MS = 800;
/** Reduced motion: no pulse, a steady in-between opacity. */
const STEADY = 0.7;

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 12,
  radius,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  // Follows the system setting live, so switching Reduce Motion on stops every placeholder at once.
  const reduceMotion = useReduceMotion();
  const effectiveRadius = radius !== undefined ? radius : borderRadius;
  const opacity = useSharedValue(reduceMotion ? STEADY : PULSE_LOW);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.set(STEADY);
      return;
    }
    const timing = { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) };
    opacity.set(PULSE_LOW);
    opacity.set(
      withRepeat(withSequence(withTiming(PULSE_HIGH, timing), withTiming(PULSE_LOW, timing)), -1),
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height: height as any,
          borderRadius: effectiveRadius,
          backgroundColor: colors.surface2,
        },
        pulseStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
});

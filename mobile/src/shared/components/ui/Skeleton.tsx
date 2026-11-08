import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  radius?: number;
  style?: ViewStyle;
};

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 12,
  radius,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const effectiveRadius = radius !== undefined ? radius : borderRadius;
  const [opacityAnim] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.85,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height: height as any,
          borderRadius: effectiveRadius,
          backgroundColor: colors.surface2,
          opacity: opacityAnim,
        },
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

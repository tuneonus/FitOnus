import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { useTween } from '@/hooks/use-tween';
import { motion, ringDashOffset } from '@/shared/theme/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  size: number;
  stroke?: number;
  strokeWidth?: number;
  value: number; // 0 to 1
  color?: string;
  trackColor?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
};

export function ProgressRing({
  size,
  stroke = 10,
  strokeWidth,
  value,
  color,
  trackColor,
  style,
  children,
}: ProgressRingProps) {
  const { colors, isDark } = useTheme();
  const effectiveStroke = strokeWidth ?? stroke;
  const radius = (size - effectiveStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, isNaN(value) ? 0 : value));

  // The ring sweeps from empty on first paint and then follows its value (a logged meal moves it smoothly). With
  // reduced motion it is simply drawn at its value, as it always was.
  const shown = useTween(progress, { durationMs: motion.duration.chart, fromZero: true });
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: ringDashOffset(circumference, shown.get()),
    // A round cap draws a dot even on a zero-length arc, so the ring stays invisible until it has started to sweep.
    opacity: shown.get() > 0.001 ? 1 : 0,
  }));

  const ringColor = color ?? colors.accentStrong;
  const track = trackColor ?? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)');

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {/* Background track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={track}
            strokeWidth={effectiveStroke}
            fill="transparent"
          />
          {/* Progress ring */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={effectiveStroke}
            strokeDasharray={circumference}
            animatedProps={ringProps}
            strokeLinecap="round"
            fill="transparent"
          />
        </G>
      </Svg>

      {children && <View style={styles.childContainer}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  childContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

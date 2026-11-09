import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';

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
  const strokeDashoffset = circumference * (1 - progress);

  const ringColor = color ?? colors.accent;
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
          {progress > 0 && (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth={effectiveStroke}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          )}
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

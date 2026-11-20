import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { polylineLength, type ChartPoint2D } from './chart-motion';
import { useLineDraw } from './use-line-draw';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type SparklineProps = {
  values?: number[];
  points?: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeColor?: string;
  style?: ViewStyle;
};

export function Sparkline({
  values,
  points,
  width = 72,
  height = 24,
  color,
  strokeColor,
  style,
}: SparklineProps) {
  const { colors } = useTheme();

  const data = values ?? points ?? [];
  const stroke = strokeColor ?? color ?? colors.accentStrong;

  const line = useMemo(() => {
    if (!data || data.length < 2) return { d: '', length: 0 };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const pad = 2;
    const effW = width - pad * 2;
    const effH = height - pad * 2;

    const coords: ChartPoint2D[] = data.map((val, idx) => ({
      x: pad + (idx * effW) / (data.length - 1),
      y: pad + (1 - (val - min) / range) * effH,
    }));
    return {
      d: coords
        .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(' '),
      length: polylineLength(coords),
    };
  }, [data, width, height]);
  const path = line.d;

  const { dash, lineProps } = useLineDraw(path, line.length);

  if (!path) return <View style={[{ width, height }, style]} />;

  return (
    <View style={[{ width, height }, styles.container, style]}>
      <Svg width={width} height={height}>
        <AnimatedPath
          d={path}
          stroke={stroke}
          strokeDasharray={dash}
          animatedProps={lineProps}
          strokeWidth={1.8}
          fill="transparent"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';

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
  const stroke = strokeColor ?? color ?? colors.accent;

  const path = useMemo(() => {
    if (!data || data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const pad = 2;
    const effW = width - pad * 2;
    const effH = height - pad * 2;

    return data
      .map((val, idx) => {
        const x = pad + (idx * effW) / (data.length - 1);
        const y = pad + (1 - (val - min) / range) * effH;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  if (!path) return <View style={[{ width, height }, style]} />;

  return (
    <View style={[{ width, height }, styles.container, style]}>
      <Svg width={width} height={height}>
        <Path
          d={path}
          stroke={stroke}
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

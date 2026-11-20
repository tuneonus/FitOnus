import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { ChartPoint } from '../../types/health';
import { useTheme } from '@/hooks/use-theme';
import { useAnimatedColor } from '@/hooks/use-animated-color';
import { useTween } from '@/hooks/use-tween';
import { motion } from '@/shared/theme/motion';
import { barGrowDelay } from './chart-motion';

export type BarChartProps = {
  data: ChartPoint[];
  ariaLabel?: string | undefined;
  height?: number | undefined;
  goal?: number | undefined;
  highlightIndex?: number | undefined;
  barColor?: string | undefined;
  color?: string | undefined;
  mutedBarColor?: string | undefined;
  formatValue?: ((value: number) => string) | undefined;
  style?: ViewStyle | undefined;
};

/**
 * One bar. It rises from the baseline (a clipped slot, with the bar sliding up into it, so the rounded corners are never
 * squashed), each a little after the one before it, and again if its height changes. Picking a bar fades its colour.
 */
function GrowingBar({
  index,
  barHeight,
  color,
}: {
  index: number;
  barHeight: number;
  color: string;
}) {
  const grown = useTween(1, {
    durationMs: motion.duration.chart,
    fromZero: true,
    restartKey: Math.round(barHeight * 10),
    delayMs: barGrowDelay(index),
  });
  const fill = useAnimatedColor(color);
  const barStyle = useAnimatedStyle(() => ({
    backgroundColor: fill.get(),
    transform: [{ translateY: (1 - grown.get()) * barHeight }],
  }));
  return (
    <View style={[styles.slot, { height: barHeight }]}>
      <Animated.View style={[styles.bar, { height: barHeight }, barStyle]} />
    </View>
  );
}

export function BarChart({
  data,
  height = 120,
  goal,
  highlightIndex,
  barColor,
  color,
  mutedBarColor,
  formatValue = (v) => v.toLocaleString(),
  style,
}: BarChartProps) {
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState<number>(highlightIndex ?? Math.max(0, data.length - 1));

  const maxValue = Math.max(...data.map((d) => d.value), goal ?? 0) * 1.08 || 1;
  const activeColor = barColor ?? color ?? colors.ink;
  const inactiveColor =
    mutedBarColor ?? (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)');

  return (
    <View style={[styles.container, style]}>
      {/* Inspector header */}
      <View style={styles.inspectorHeader}>
        <Text style={[styles.inspectorLabel, { color: colors.muted }]}>
          {data[selected]?.label ?? ''}
        </Text>
        <Text style={[styles.inspectorValue, { color: colors.ink }]}>
          {formatValue(data[selected]?.value ?? 0)}
        </Text>
      </View>

      {/* Bars container */}
      <View style={[styles.barsWrapper, { height }]}>
        {/* Goal line */}
        {goal !== undefined && (
          <View
            style={[
              styles.goalLine,
              {
                bottom: `${(goal / maxValue) * 100}%`,
                borderColor: colors.muted,
              },
            ]}
          />
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const isSelected = i === selected;
          const barHeight = Math.max(4, (d.value / maxValue) * height);
          return (
            <TouchableOpacity
              key={`${d.label}-${i}`}
              activeOpacity={0.8}
              onPress={() => setSelected(i)}
              style={styles.barColumn}
            >
              <GrowingBar
                index={i}
                barHeight={barHeight}
                color={isSelected ? activeColor : inactiveColor}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* X-axis labels */}
      <View style={styles.labelsRow}>
        {data.map((d, i) => (
          <Text
            key={`lbl-${d.label}-${i}`}
            style={[
              styles.axisLabel,
              {
                color: i === selected ? colors.ink : colors.muted,
                fontWeight: i === selected ? '600' : '400',
              },
            ]}
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 4,
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inspectorLabel: {
    fontSize: 12,
  },
  inspectorValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  barsWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
    position: 'relative',
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  slot: {
    width: '100%',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  axisLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10.5,
  },
});

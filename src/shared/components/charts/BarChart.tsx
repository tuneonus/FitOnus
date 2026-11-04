import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import type { ChartPoint } from '../../types/health';
import { useTheme } from '@/hooks/use-theme';

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
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number>(
    highlightIndex ?? Math.max(0, data.length - 1)
  );

  const maxValue = Math.max(...data.map((d) => d.value), goal ?? 0) * 1.08 || 1;
  const activeColor = barColor ?? color ?? colors.ink;
  const inactiveColor = mutedBarColor ?? (colors.ink === '#F4F4EE' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)');

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
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isSelected ? activeColor : inactiveColor,
                  },
                ]}
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

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path, Line as SvgLine, Circle, G, Rect } from 'react-native-svg';
import type { ChartPoint } from '../../types/health';
import { useTheme } from '@/hooks/use-theme';

export type Band = { lower: number; upper: number };

export type LineChartProps = {
  points: ChartPoint[];
  ariaLabel?: string | undefined;
  height?: number | undefined;
  target?: number | undefined;
  targetLabel?: string | undefined;
  projection?: ChartPoint[] | undefined;
  projectionBand?: Band[] | undefined;
  strokeColor?: string | undefined;
  dotColor?: string | undefined;
  formatValue?: ((value: number) => string) | undefined;
  style?: ViewStyle | undefined;
  subtitle?: string | undefined;
};

const CHART_WIDTH = 320;

export function LineChart({
  points,
  height = 160,
  target,
  targetLabel,
  projection = [],
  projectionBand = [],
  strokeColor,
  dotColor,
  formatValue = (v) => v.toLocaleString(),
  style,
  subtitle,
}: LineChartProps) {
  const { colors } = useTheme();
  const all = useMemo(() => [...points, ...projection], [points, projection]);
  const [selected, setSelected] = useState(Math.max(0, points.length - 1));

  const padT = 16;
  const padB = 26;
  const padX = 14;

  const { min, max } = useMemo(() => {
    const vals = [
      ...all.map((p) => p.value),
      ...projectionBand.flatMap((b) => [b.lower, b.upper]),
      ...(target !== undefined ? [target] : []),
    ];

    const lo = Math.min(...(vals.length ? vals : [0]));
    const hi = Math.max(...(vals.length ? vals : [100]));
    const pad = (hi - lo) * 0.12 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [all, projectionBand, target]);

  const getX = (i: number) =>
    padX + (i * (CHART_WIDTH - padX * 2)) / Math.max(1, all.length - 1);
  const getY = (v: number) =>
    padT + (1 - (v - min) / Math.max(1, max - min)) * (height - padT - padB);

  const mainPath = useMemo(() => {
    return points
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.value).toFixed(1)}`
      )
      .join(' ');
  }, [points, min, max, height]);

  const projStart = Math.max(0, points.length - 1);
  const projPath = useMemo(() => {
    if (!projection.length || !points[projStart]) return '';
    return (
      `M ${getX(projStart).toFixed(1)} ${getY(points[projStart].value).toFixed(1)} ` +
      projection
        .map(
          (p, i) =>
            `L ${getX(projStart + 1 + i).toFixed(1)} ${getY(p.value).toFixed(1)}`
        )
        .join(' ')
    );
  }, [projection, points, projStart, min, max, height]);

  const stroke = strokeColor ?? colors.ink;
  const dot = dotColor ?? colors.ink;

  const selPoint = points[selected] ?? points[0];

  return (
    <View style={[styles.container, style]}>
      {/* Inspector header */}
      {selPoint && (
        <View style={styles.header}>
          <View>
            <Text style={[styles.label, { color: colors.muted }]}>
              {selPoint.label}
            </Text>
            {subtitle ? (
              <Text style={{ color: colors.accentStrong, fontSize: 11, fontWeight: '500' }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.val, { color: colors.ink }]}>
            {formatValue(selPoint.value)}
          </Text>
        </View>
      )}

      {/* SVG Canvas */}
      <View style={{ width: '100%', alignItems: 'center' }}>
        <Svg width={CHART_WIDTH} height={height}>
          {/* Target line */}
          {target !== undefined && (
            <SvgLine
              x1={padX}
              y1={getY(target)}
              x2={CHART_WIDTH - padX}
              y2={getY(target)}
              stroke={colors.muted}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}

          {/* Main solid line */}
          {mainPath ? (
            <Path
              d={mainPath}
              stroke={stroke}
              strokeWidth={2.5}
              fill="transparent"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Projection dashed line */}
          {projPath ? (
            <Path
              d={projPath}
              stroke={colors.accentStrong}
              strokeDasharray="4 4"
              strokeWidth={2}
              fill="transparent"
            />
          ) : null}

          {/* Data Points */}
          {points.map((p, i) => {
            const isSel = i === selected;
            const cx = getX(i);
            const cy = getY(p.value);
            return (
              <G key={`pt-${i}`}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={isSel ? 5.5 : 3.5}
                  fill={isSel ? colors.accentStrong : dot}
                  stroke={colors.surface}
                  strokeWidth={isSel ? 2 : 1}
                />
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Touch selector buttons */}
      <View style={styles.touchBar}>
        {points.map((p, i) => (
          <TouchableOpacity
            key={`touch-${i}`}
            onPress={() => setSelected(i)}
            style={styles.touchTarget}
          >
            <Text
              style={[
                styles.xLabel,
                {
                  color: i === selected ? colors.ink : colors.muted,
                  fontWeight: i === selected ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 12,
  },
  val: {
    fontSize: 15,
    fontWeight: '700',
  },
  touchBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  touchTarget: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  xLabel: {
    fontSize: 10.5,
  },
});

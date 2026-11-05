import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import type { StageSegment } from '../data/sleepMock';
import { useTheme } from '@/hooks/use-theme';

const rows: { stage: StageSegment['stage']; label: string; colorKey: 'warn' | 'rem' | 'light' | 'deep' }[] = [
  { stage: 'awake', label: 'Awake', colorKey: 'warn' },
  { stage: 'rem', label: 'REM', colorKey: 'rem' },
  { stage: 'light', label: 'Light', colorKey: 'light' },
  { stage: 'deep', label: 'Deep', colorKey: 'deep' },
];

export function Hypnogram({
  segments,
  start,
  end,
}: {
  segments: StageSegment[];
  start: string;
  end: string;
}) {
  const { colors } = useTheme();
  const lastSeg = segments[segments.length - 1]!;
  const total = lastSeg.start + lastSeg.dur;
  const W = 280;
  const rowH = 22;

  const colorMap = {
    warn: colors.warn,
    rem: 'rgba(124, 58, 237, 0.7)',
    light: 'rgba(124, 58, 237, 0.35)',
    deep: '#7C3AED',
  };

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        <View style={styles.labelsCol}>
          {rows.map((r) => (
            <Text
              key={r.stage}
              style={[styles.stageLabel, { color: colors.muted, height: rowH, lineHeight: rowH }]}
            >
              {r.label}
            </Text>
          ))}
        </View>

        <View style={styles.svgWrapper}>
          <Svg viewBox={`0 0 ${W} ${rowH * 4}`} width="100%" height={rowH * 4}>
            {rows.map((r, i) => (
              <Line
                key={r.stage}
                x1={0}
                x2={W}
                y1={i * rowH + rowH / 2}
                y2={i * rowH + rowH / 2}
                stroke={colors.line}
                strokeWidth={rowH - 4}
              />
            ))}
            {segments.map((s, i) => {
              const rowIdx = rows.findIndex((r) => r.stage === s.stage);
              const color = colorMap[rows[rowIdx]?.colorKey ?? 'deep'];
              return (
                <Rect
                  key={i}
                  x={(s.start / total) * W}
                  y={rowIdx * rowH + 3}
                  width={Math.max(1.5, (s.dur / total) * W - 1)}
                  height={rowH - 6}
                  rx={3}
                  fill={color}
                />
              );
            })}
          </Svg>
        </View>
      </View>

      <View style={styles.timesRow}>
        <Text style={[styles.timeLabel, { color: colors.muted }]}>{start}</Text>
        <Text style={[styles.timeLabel, { color: colors.muted }]}>{end}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chartRow: {
    flexDirection: 'row',
  },
  labelsCol: {
    width: 48,
  },
  stageLabel: {
    fontSize: 11,
  },
  svgWrapper: {
    flex: 1,
  },
  timesRow: {
    marginLeft: 48,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: 11,
  },
});


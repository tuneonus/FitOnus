import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Info } from 'lucide-react-native';
import { LineChart } from '../../../../shared/components/charts/LineChart';
import { BarChart } from '../../../../shared/components/charts/BarChart';
import { SourceTag } from '../../../../shared/components/ui/SourceTag';
import { Badge } from '../../../../shared/components/ui/Badge';
import type { Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

const confidenceTone = { low: 'warn', medium: 'neutral', high: 'good' } as const;

export function ChartBlock({ block }: { block: Extract<Block, { type: 'chart' }> }) {
  const { colors } = useTheme();
  const fmt = (v: number) =>
    `${Number.isInteger(v) ? v : v.toFixed(1)}${block.unit ? ` ${block.unit}` : ''}`;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.ink }]}>{block.title}</Text>
        {block.confidence && (
          <Badge tone={confidenceTone[block.confidence]}>
            {block.confidence} confidence
          </Badge>
        )}
      </View>

      <View style={styles.chartWrap}>
        {block.chart === 'line' ? (
          <LineChart
            points={block.points}
            projection={block.projection}
            projectionBand={block.band}
            target={block.target}
            targetLabel={block.targetLabel}
            ariaLabel={block.title}
            height={150}
            formatValue={fmt}
          />
        ) : (
          <BarChart
            data={block.points}
            ariaLabel={block.title}
            height={110}
            formatValue={fmt}
            barColor={colors.accent}
          />
        )}
      </View>

      <View style={styles.captionRow}>
        <Info size={12} color={colors.muted} />
        <Text style={[styles.caption, { color: colors.muted }]}>
          {block.caption}
        </Text>
      </View>

      <View style={{ marginTop: 8 }}>
        <SourceTag source={block.source} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  chartWrap: {
    marginTop: 10,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
});


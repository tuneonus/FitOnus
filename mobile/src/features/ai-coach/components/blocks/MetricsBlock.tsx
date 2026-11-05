import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SourceTag } from '../../../../shared/components/ui/SourceTag';
import type { Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

export function MetricsBlock({ block }: { block: Extract<Block, { type: 'metrics' }> }) {
  const { colors } = useTheme();

  const toneColor = {
    good: colors.good,
    warn: colors.warn,
    bad: colors.bad,
    neutral: colors.muted,
  };

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
      <Text style={[styles.title, { color: colors.ink }]}>{block.title}</Text>
      <View style={styles.grid}>
        {block.items.map((m) => (
          <View key={m.label} style={styles.metricItem}>
            <Text style={[styles.label, { color: colors.muted }]}>{m.label}</Text>
            <View style={styles.valueRow}>
              <Text style={[styles.value, { color: colors.ink }]}>{m.value}</Text>
              {m.unit && <Text style={[styles.unit, { color: colors.muted }]}> {m.unit}</Text>}
            </View>
            {m.delta && (
              <Text
                style={[
                  styles.delta,
                  { color: toneColor[m.tone ?? 'neutral'] },
                ]}
              >
                {m.delta}
              </Text>
            )}
            <View style={{ marginTop: 4 }}>
              <SourceTag source={m.source} />
            </View>
          </View>
        ))}
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
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  grid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metricItem: {
    width: '47%',
  },
  label: {
    fontSize: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  value: {
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  unit: {
    fontSize: 12,
  },
  delta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});


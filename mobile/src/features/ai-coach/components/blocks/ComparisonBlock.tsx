import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

export function ComparisonBlock({ block }: { block: Extract<Block, { type: 'comparison' }> }) {
  const { colors } = useTheme();

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

      <View style={styles.tableHeader}>
        <Text style={[styles.colHeader, { flex: 2, color: colors.muted }]}>
          Metric
        </Text>
        <Text style={[styles.colHeaderRight, { flex: 1, color: colors.muted }]}>
          {block.columns[0]}
        </Text>
        <Text style={[styles.colHeaderRight, { flex: 1, color: colors.muted }]}>
          {block.columns[1]}
        </Text>
      </View>

      <View style={styles.tableBody}>
        {block.rows.map((r, idx) => (
          <View
            key={r.label}
            style={[
              styles.tableRow,
              idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
            ]}
          >
            <Text style={[styles.rowLabel, { flex: 2, color: colors.ink }]}>
              {r.label}
            </Text>
            <Text
              style={[
                styles.rowVal,
                {
                  flex: 1,
                  color: r.better === 'a' ? colors.good : colors.ink,
                  fontWeight: r.better === 'a' ? '600' : '400',
                },
              ]}
            >
              {r.a}
            </Text>
            <Text
              style={[
                styles.rowVal,
                {
                  flex: 1,
                  color: r.better === 'b' ? colors.good : colors.muted,
                  fontWeight: r.better === 'b' ? '600' : '400',
                },
              ]}
            >
              {r.b}
            </Text>
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
  tableHeader: {
    flexDirection: 'row',
    marginTop: 10,
    paddingBottom: 6,
  },
  colHeader: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  colHeaderRight: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'right',
  },
  tableBody: {
    marginTop: 2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  rowVal: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});


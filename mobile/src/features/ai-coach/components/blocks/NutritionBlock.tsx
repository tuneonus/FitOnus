import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from '../../../../shared/components/ui/ProgressBar';
import type { Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

export function NutritionBlock({ block }: { block: Extract<Block, { type: 'nutrition' }> }) {
  const { colors } = useTheme();

  const macroColors: Record<string, string> = {
    Protein: colors.move,
    Carbs: colors.sky,
    Fat: colors.warn,
    Fiber: colors.accent,
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
      {block.headline && (
        <View style={styles.headRow}>
          <Text style={[styles.bigHead, { color: colors.ink }]}>
            {block.headline.value}
          </Text>
          <Text style={[styles.headLabel, { color: colors.muted }]}>
            {block.headline.label}
          </Text>
        </View>
      )}

      {block.rows && block.rows.length > 0 && (
        <View style={styles.rowsList}>
          {block.rows.map((r, idx) => (
            <View
              key={r.label}
              style={[
                styles.rowItem,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
              ]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowLabel, { color: colors.ink }]}>
                  {r.label}
                </Text>
                <View style={styles.rowValWrap}>
                  <Text style={[styles.rowVal, { color: colors.ink }]}>
                    {r.value}
                  </Text>
                  {r.estimated && (
                    <View
                      style={[
                        styles.estTag,
                        { borderColor: colors.muted },
                      ]}
                    >
                      <Text style={[styles.estTagText, { color: colors.muted }]}>
                        Est.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {r.detail && (
                <Text style={[styles.rowDetail, { color: colors.muted }]}>
                  {r.detail}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {block.macros && (
        <View style={styles.macrosGrid}>
          {block.macros.map((m) => (
            <View key={m.label} style={styles.macroCol}>
              <View style={styles.macroHeader}>
                <Text style={[styles.macroLabel, { color: colors.muted }]}>
                  {m.label}
                </Text>
                <Text style={[styles.macroNumbers, { color: colors.ink }]}>
                  {m.value}/{m.goal}g
                </Text>
              </View>
              <ProgressBar
                value={m.value}
                max={m.goal}
                color={macroColors[m.label] || colors.accentStrong}
                height={6}
                style={{ marginTop: 4 }}
              />
            </View>
          ))}
        </View>
      )}

      {block.note && (
        <Text style={[styles.note, { color: colors.muted }]}>{block.note}</Text>
      )}
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
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    gap: 6,
  },
  bigHead: {
    fontSize: 30,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  headLabel: {
    fontSize: 13,
  },
  rowsList: {
    marginTop: 10,
  },
  rowItem: {
    paddingVertical: 10,
  },
  rowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rowLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  rowValWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowVal: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  estTag: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  estTagText: {
    fontSize: 10,
  },
  rowDetail: {
    fontSize: 12.5,
    marginTop: 2,
  },
  macrosGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  macroCol: {
    width: '47%',
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroLabel: {
    fontSize: 12,
  },
  macroNumbers: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  note: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 16,
  },
});


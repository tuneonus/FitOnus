import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dumbbell } from 'lucide-react-native';
import type { Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

export function WorkoutBlock({ block }: { block: Extract<Block, { type: 'workout' }> }) {
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
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: `${colors.accent}40` },
          ]}
        >
          <Dumbbell size={18} color={colors.accentInk} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.focus, { color: colors.muted }]}>{block.focus}</Text>
          <Text style={[styles.title, { color: colors.ink }]}>{block.title}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {block.durationMin} min · {block.exercises.length} exercises
          </Text>
        </View>
      </View>

      <View style={styles.exerciseList}>
        {block.exercises.map((e, idx) => (
          <View
            key={e.name}
            style={[
              styles.exerciseRow,
              idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
            ]}
          >
            <Text style={[styles.exerciseName, { color: colors.ink }]}>
              {e.name}
            </Text>
            <Text style={[styles.exerciseDetail, { color: colors.muted }]}>
              {e.detail}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  focus: {
    fontSize: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 1,
  },
  meta: {
    fontSize: 12.5,
    marginTop: 2,
  },
  exerciseList: {
    marginTop: 12,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  exerciseName: {
    fontSize: 13.5,
    flex: 1,
  },
  exerciseDetail: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});


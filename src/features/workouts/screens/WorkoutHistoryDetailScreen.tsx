import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { Button } from '../../../shared/components/ui/Button';
import { useWorkoutStore } from '../store/workoutStore';
import { useTheme } from '@/hooks/use-theme';

export function WorkoutHistoryDetailScreen() {
  const { colors } = useTheme();
  const { id } = useRouteParams<{ id?: string }>();
  const { navigate } = useNavigation();
  const log = useWorkoutStore((s) => s.history.find((h) => h.id === id) ?? s.history[0]);

  if (!log) return null;
  const synced = log.source === 'Apple Watch';

  return (
    <Screen title={log.date}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.ink }]}>{log.title}</Text>
        <View style={{ marginTop: 6 }}>
          <SourceTag
            source={
              synced
                ? { kind: 'synced', label: 'Recorded on Apple Watch · synced' }
                : { kind: 'manual', label: 'Logged in FitOnus' }
            }
          />
        </View>

        <View style={[styles.statsGrid, { borderColor: colors.line }]}>
          {[
            ['Duration', `${log.durationMin} min`],
            ['Volume', log.volumeKg ? `${(log.volumeKg / 1000).toFixed(1)} t` : '—'],
            ['Avg HR', log.avgHr ? `${log.avgHr}` : '—'],
            ['Sets', log.sets ? `${log.sets}` : '—'],
            ['Calories', `${log.calories}`],
            ['PRs', `${log.prs}`],
          ].map(([l, v]) => (
            <View key={l} style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{l}</Text>
              <Text style={[styles.statVal, { color: colors.ink }]}>{v}</Text>
            </View>
          ))}
        </View>

        {!synced && (
          <Text style={[styles.calorieHint, { color: colors.muted }]}>
            Calories are estimated when no heart-rate data is attached.
          </Text>
        )}

        <Text style={[styles.exercisesTitle, { color: colors.ink }]}>
          Exercises
        </Text>
        <View style={styles.exercisesList}>
          {log.exercises.map((e, idx) => (
            <View
              key={e.name}
              style={[
                styles.exRow,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
              ]}
            >
              <Text style={[styles.exName, { color: colors.ink }]}>{e.name}</Text>
              <Text style={[styles.exBest, { color: colors.muted }]}>{e.best}</Text>
            </View>
          ))}
        </View>

        <Button
          variant="outline"
          fullWidth
          title="Ask coach to review"
          onPress={() => navigate('coach', { q: 'Compare this month with last month' })}
          style={{ marginTop: 24 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 14,
    marginTop: 20,
  },
  statCol: {
    width: '33.33%',
    paddingVertical: 6,
  },
  statLabel: {
    fontSize: 12,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  calorieHint: {
    fontSize: 12,
    marginTop: 8,
  },
  exercisesTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 24,
  },
  exercisesList: {
    marginTop: 8,
  },
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  exName: {
    fontSize: 15,
    flex: 1,
  },
  exBest: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});


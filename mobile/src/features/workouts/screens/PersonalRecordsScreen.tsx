import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { Screen } from '../../../shared/components/ui/Screen';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { workoutApi } from '../api/workout-api';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { analyticsApi } from '@/features/analytics/api/analytics-api';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import type { PersonalRecordView } from '../types/workout';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';

export function PersonalRecordsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const userId = useAuthStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: ['dashboard', 'personal-records', userId],
    queryFn: () => workoutApi.getPersonalRecords(),
    enabled: !!userId,
  });
  const records = query.data ?? [];
  const [selectedLift, setSelectedLift] = useState('');
  const activeRec = records.find((record) => record.id === selectedLift) || records[0];
  const progression = useQuery({
    queryKey: ['dashboard', 'record-progression', userId, activeRec?.exerciseId],
    queryFn: () => analyticsApi.getExerciseProgression(activeRec!.exerciseId),
    enabled: !!userId && !!activeRec,
  });
  const activeE1rm =
    activeRec?.weightKg != null && activeRec.reps != null
      ? Math.round(activeRec.weightKg * (1 + activeRec.reps / 30))
      : null;
  const describeRecord = (record: PersonalRecordView) =>
    record.metricType === 'weight'
      ? `${record.value} kg${record.reps != null ? ` × ${record.reps}` : ''}`
      : record.metricType === 'reps'
        ? `${record.value} reps`
        : `${record.value} kg volume`;
  const points =
    progression.data?.progression.map((point) => ({
      label: point.date.slice(5),
      value:
        activeRec?.metricType === 'weight'
          ? point.topWeightKg
          : activeRec?.metricType === 'reps'
            ? point.reps
            : point.volumeKg,
    })) ?? [];

  return (
    <Screen
      title="Personal records"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching || progression.isRefetching}
          onRefresh={() => {
            void query.refetch();
            if (activeRec) void progression.refetch();
          }}
          tintColor={colors.accentStrong}
        />
      }
    >
      {query.isError || progression.isError ? (
        <StatusBanner
          tone="error"
          title="Couldn’t refresh your records"
          body="Pull to try again. Previously loaded values may be out of date."
        />
      ) : null}
      <View style={styles.content}>
        {!activeRec || records.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No personal records yet"
            body="Complete your first workout to establish your baseline personal records."
            actionLabel="Start a workout"
            onAction={() => navigate('activeWorkout')}
          />
        ) : (
          <>
            {/* Selected Lift Detail Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text style={[styles.liftName, { color: colors.muted }]}>
                {activeRec.exerciseName}
              </Text>
              <Text style={[styles.liftBest, { color: colors.ink }]}>
                {describeRecord(activeRec)}
              </Text>
              <Text style={[styles.e1rmText, { color: colors.muted }]}>
                Estimated 1RM{' '}
                <Text style={{ color: colors.ink, fontWeight: '600' }}>
                  {activeE1rm != null ? `${activeE1rm} kg` : '—'}
                </Text>{' '}
                · set{' '}
                {new Date(activeRec.achievedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>

              <View style={{ marginTop: 12 }}>
                <LineChart
                  points={points}
                  ariaLabel={`${activeRec.exerciseName} top set trend`}
                  height={130}
                  formatValue={(v) => `${v} ${activeRec.metricType === 'reps' ? 'reps' : 'kg'}`}
                  strokeColor={colors.accent}
                />
              </View>

              <Text style={[styles.formulaNote, { color: colors.muted }]}>
                Estimated 1RM uses the Epley formula — a guide, not a tested max.
              </Text>
            </View>

            {/* All Lifts List */}
            <View style={styles.liftsList}>
              {records.map((r, idx) => {
                const isSelected = r.id === activeRec.id;
                const rWeight = r.weightKg ?? r.value ?? 0;
                const rReps = r.reps ?? 1;

                return (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.7}
                    onPress={() => setSelectedLift(r.id)}
                    style={[
                      styles.liftRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                    ]}
                  >
                    <Trophy size={18} color={isSelected ? colors.accent : colors.muted} />
                    <View style={styles.liftTextCol}>
                      <Text
                        style={[
                          styles.rowLiftName,
                          {
                            color: colors.ink,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {r.exerciseName}
                      </Text>
                      <Text style={[styles.rowLiftBest, { color: colors.muted }]}>
                        {describeRecord(r)} ·{' '}
                        {new Date(r.achievedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>

                    <Sparkline points={[rWeight]} strokeColor={colors.ink} width={64} height={28} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
    gap: 20,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  liftName: {
    fontSize: 13,
  },
  liftBest: {
    fontSize: 32,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginTop: 2,
  },
  e1rmText: {
    fontSize: 13,
    marginTop: 4,
  },
  formulaNote: {
    fontSize: 11.5,
    marginTop: 10,
  },
  liftsList: {
    marginTop: 4,
  },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  liftTextCol: {
    flex: 1,
  },
  rowLiftName: {
    fontSize: 15,
  },
  rowLiftBest: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
});

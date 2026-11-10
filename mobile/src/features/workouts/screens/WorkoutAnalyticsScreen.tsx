import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { BarChart3, Sparkles } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { useWorkoutStore } from '../store/workoutStore';
import { useAdvancedAnalyticsStore } from '@/features/analytics/store/advancedAnalyticsStore';
import { useTheme } from '@/hooks/use-theme';

type ViewType = 'frequency' | 'volume';

export function WorkoutAnalyticsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [view, setView] = useState<ViewType>('frequency');
  const { history, loadHistoryFromBackend } = useWorkoutStore();
  const { workouts, fetchWorkouts } = useAdvancedAnalyticsStore();

  React.useEffect(() => {
    loadHistoryFromBackend();
    fetchWorkouts('30d').catch(() => {});
  }, [loadHistoryFromBackend, fetchWorkouts]);

  const backendWorkoutData = workouts['30d'];

  const [now] = useState(() => Date.now());
  const sessions30d = React.useMemo(() => {
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    return history.filter((h) => {
      const t = h.completedAt ? Date.parse(h.completedAt) : NaN;
      return !isNaN(t) && t >= thirtyDaysAgo;
    });
  }, [history, now]);

  const sessionCount = backendWorkoutData ? backendWorkoutData.totalSessions : sessions30d.length;
  const avgDurationMin = backendWorkoutData
    ? backendWorkoutData.avgDurationMin
    : sessionCount > 0
      ? Math.round(sessions30d.reduce((sum, h) => sum + (h.durationMin || 0), 0) / sessionCount)
      : 0;
  const totalVolumeKg = backendWorkoutData
    ? backendWorkoutData.totalVolumeKg
    : sessions30d.reduce((sum, h) => sum + (h.volumeKg || 0), 0);
  const prs30d = sessions30d.reduce((sum, h) => sum + (h.prs || 0), 0);

  // Weekly aggregates for the last 4 weeks (fallback)
  const weeksData = React.useMemo(() => {
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    return [3, 2, 1, 0].map((wOffset) => {
      const start = now - (wOffset + 1) * oneWeekMs;
      const end = now - wOffset * oneWeekMs;
      const weekSessions = history.filter((h) => {
        const t = h.completedAt ? Date.parse(h.completedAt) : NaN;
        return !isNaN(t) && t >= start && t < end;
      });
      const label = wOffset === 0 ? 'This wk' : `W-${wOffset}`;
      return {
        label,
        frequency: weekSessions.length,
        volume: weekSessions.reduce((sum, h) => sum + (h.volumeKg || 0), 0),
      };
    });
  }, [history, now]);

  const frequencyChartData =
    backendWorkoutData && backendWorkoutData.frequencySeries.length > 0
      ? backendWorkoutData.frequencySeries
      : weeksData.map((d) => ({ label: d.label, value: d.frequency }));

  const volumeChartData =
    backendWorkoutData && backendWorkoutData.volumeSeries.length > 0
      ? backendWorkoutData.volumeSeries
      : weeksData.map((d) => ({ label: d.label, value: d.volume }));

  const hasNoWorkouts =
    history.length === 0 && (!backendWorkoutData || backendWorkoutData.totalSessions === 0);

  return (
    <Screen title="Workout analytics">
      {hasNoWorkouts ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          body="Complete workouts in FitOnus to see 30-day session volume, frequency trends and strength progression."
          actionLabel="Start a workout"
          onAction={() => navigate('activeWorkout')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Last 30 days headline */}
          <View style={styles.headerSection}>
            <Text style={[styles.sectionSub, { color: colors.muted }]}>Last 30 days</Text>
            <Text style={[styles.bigSessions, { color: colors.ink }]}>
              {sessionCount}
              <Text style={[styles.sessionsUnit, { color: colors.muted }]}> sessions</Text>
            </Text>

            <View style={[styles.statsStrip, { borderTopColor: colors.line }]}>
              <View style={styles.statCol}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Avg length</Text>
                <Text style={[styles.statVal, { color: colors.ink }]}>{avgDurationMin} min</Text>
              </View>
              <View style={styles.statCol}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Volume</Text>
                <Text style={[styles.statVal, { color: colors.ink }]}>
                  {(totalVolumeKg / 1000).toFixed(1)} t
                </Text>
              </View>
              <View style={styles.statCol}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>New PRs</Text>
                <Text style={[styles.statVal, { color: colors.ink }]}>{prs30d}</Text>
              </View>
            </View>
          </View>

          {/* Training Trend Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <SegmentedControl
              label="Trend metric"
              options={[
                { value: 'frequency', label: 'Sessions / week' },
                { value: 'volume', label: 'Volume / week' },
              ]}
              value={view}
              onChange={(val) => setView(val as ViewType)}
            />

            <View style={{ marginTop: 16 }}>
              {view === 'frequency' ? (
                <BarChart
                  data={frequencyChartData}
                  formatValue={(v) => `${v} sessions`}
                  barColor={colors.accent}
                  height={120}
                />
              ) : (
                <BarChart
                  data={volumeChartData}
                  formatValue={(v) => `${v.toLocaleString()} kg`}
                  barColor={colors.accent}
                  height={120}
                />
              )}
            </View>

            <Text style={[styles.cardNote, { color: colors.muted }]}>
              {view === 'frequency'
                ? `Logged sessions over the past 4 weeks`
                : 'Total lifted volume across completed workouts'}
            </Text>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 16,
  },
  headerSection: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  sectionSub: {
    fontSize: 13,
  },
  bigSessions: {
    fontSize: 40,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: 2,
  },
  sessionsUnit: {
    fontSize: 15,
  },
  statsStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 14,
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardNote: {
    fontSize: 12,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  musclesList: {
    marginTop: 14,
    gap: 12,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  muscleGroup: {
    width: 76,
    fontSize: 13,
  },
  trackBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    position: 'relative',
    overflow: 'visible',
  },
  fillBar: {
    height: '100%',
    borderRadius: 4,
  },
  targetTick: {
    position: 'absolute',
    top: -4,
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  muscleNumbers: {
    width: 50,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  allLiftsLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  aiInsightCard: {
    flexDirection: 'row',
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  aiInsightTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  aiInsightDesc: {
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 4,
  },
});

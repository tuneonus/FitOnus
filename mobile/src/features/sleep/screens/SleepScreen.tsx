import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Moon, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SourceTag } from '@/shared/components/ui/SourceTag';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { BarChart } from '@/shared/components/charts/BarChart';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { formatMinutes, lastNightStages, sleepNights } from '../data/sleepMock';
import { Hypnogram } from '../components/Hypnogram';
import { useTheme } from '@/hooks/use-theme';

export function SleepScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const { data: dashboardData } = useDashboard();
  const serverSleepScore = dashboardData?.summary?.sleepScore;
  const hasData = serverSleepScore != null && hasDevice;
  const [view, setView] = useState<'night' | 'trends'>('night');

  if (!hasData) {
    return (
      <Screen title="Sleep">
        <EmptyState
          icon={Moon}
          title="No sleep data yet"
          body="Sleep duration and stages come from Apple Watch or a Health Connect device. Your phone alone can’t measure them, so we won’t estimate."
          actionLabel="Connect a device"
          onAction={() => navigate('healthIntegration')}
        />
      </Screen>
    );
  }

  const night = sleepNights[sleepNights.length - 1]!;
  const lightMin = night.minutes - night.deepMin - night.remMin - night.awakeMin;
  const avg = Math.round(sleepNights.slice(-7).reduce((s, n) => s + n.minutes, 0) / 7);
  const bedSpread =
    Math.max(...sleepNights.slice(-7).map((n) => n.bedOffset)) -
    Math.min(...sleepNights.slice(-7).map((n) => n.bedOffset));

  const stages = [
    { label: 'Deep', min: night.deepMin, color: '#7C3AED' },
    { label: 'REM', min: night.remMin, color: 'rgba(124, 58, 237, 0.7)' },
    { label: 'Light', min: lightMin, color: 'rgba(124, 58, 237, 0.35)' },
    { label: 'Awake', min: night.awakeMin, color: colors.warn },
  ];

  return (
    <Screen title="Sleep" contentContainerStyle={styles.container}>
      <SegmentedControl
          options={[
            { value: 'night', label: 'Last night' },
            { value: 'trends', label: 'Trends' },
          ]}
          value={view}
          onChange={(val) => setView(val as 'night' | 'trends')}
        />

        {view === 'night' ? (
          <View style={styles.viewContent}>
            {/* Sleep Summary Card */}
            <View style={[styles.card, styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <ProgressRing
                size={104}
                strokeWidth={9}
                value={night.score / 100}
                color="#7C3AED"
                trackColor={colors.line}
              >
                <View style={styles.scoreCenter}>
                  <Text style={[styles.scoreNumber, { color: colors.ink }]}>{night.score}</Text>
                  <Text style={[styles.scoreLabel, { color: colors.muted }]}>Score</Text>
                </View>
              </ProgressRing>

              <View style={styles.summaryDetails}>
                <Text style={[styles.sleepDuration, { color: colors.ink }]}>
                  {formatMinutes(night.minutes)}
                </Text>
                <Text style={[styles.sleepHours, { color: colors.muted }]}>
                  {night.bedtime} → {night.wake}
                </Text>
                <Text style={[styles.sleepDiff, { color: colors.good }]}>
                  +{formatMinutes(night.minutes - avg)} vs 7-day avg
                </Text>
                <View style={{ marginTop: 6 }}>
                  <SourceTag source={{ kind: 'synced', label: 'Apple Watch · 6:42 AM' }} />
                </View>
              </View>
            </View>

            {/* Stages Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Stages</Text>
              <View style={{ marginTop: 12 }}>
                <Hypnogram segments={lastNightStages} start={night.bedtime} end={night.wake} />
              </View>
              <View style={styles.stagesGrid}>
                {stages.map((s) => (
                  <View key={s.label} style={styles.stageCol}>
                    <View style={styles.stageDotRow}>
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text style={[styles.stageLabel, { color: colors.muted }]}>{s.label}</Text>
                    </View>
                    <Text style={[styles.stageMin, { color: colors.ink }]}>{formatMinutes(s.min)}</Text>
                    <Text style={[styles.stagePct, { color: colors.muted }]}>
                      {Math.round((s.min / night.minutes) * 100)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Coach Insight */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigate('coach', { q: 'Why am I feeling tired today?' })}
              style={[styles.coachCard, { backgroundColor: colors.surface2 }]}
            >
              <View style={{ marginTop: 2 }}>
                <Sparkles size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.coachHeading, { color: colors.ink }]}>
                  Your best night in 6 days
                </Text>
                <Text style={[styles.coachBody, { color: colors.muted }]}>
                  Bedtime before 11 PM gave you 1h 32m of deep sleep — 18 min above your average. Repeating this tonight would help your Saturday leg session.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.viewContent}>
            {/* Duration 14 nights */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.ink }]}>Duration · 14 nights</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>Avg {formatMinutes(avg)}</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <BarChart
                  data={sleepNights.map((n) => ({ label: n.day, value: n.minutes }))}
                  goal={450}
                  barColor="#7C3AED"
                  height={110}
                  formatValue={formatMinutes}
                />
              </View>
              <Text style={[styles.footnote, { color: colors.muted }]}>Dashed line: 7h 30m target</Text>
            </View>

            {/* Consistency */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.ink }]}>Consistency</Text>
                <Text style={[styles.cardSub, { color: colors.muted }]}>
                  Bedtime spread {bedSpread} min
                </Text>
              </View>
              <View style={styles.consistencyList}>
                {sleepNights.slice(-7).map((n) => (
                  <View key={n.date} style={styles.consistencyRow}>
                    <Text style={[styles.cDate, { color: colors.muted }]}>
                      {n.date.replace('Oct ', 'O ').replace('Sep ', 'S ')}
                    </Text>
                    <View style={[styles.cTrack, { backgroundColor: colors.surface2 }]}>
                      <View
                        style={[
                          styles.cFill,
                          {
                            left: `${(n.bedOffset / 180) * 100}%`,
                            width: `${(n.minutes / 600) * 100}%`,
                            backgroundColor: '#7C3AED',
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.cBed, { color: colors.ink }]}>
                      {n.bedtime.replace(' PM', 'p').replace(' AM', 'a')}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.footnote, { color: colors.muted }]}>
                A spread under 30 min is ideal. Wednesday’s 12:12 AM bedtime is the outlier.
              </Text>
            </View>

            {/* Sleep History */}
            <View style={styles.historyBlock}>
              <Text style={[styles.historyHeading, { color: colors.ink }]}>History</Text>
              <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                {[...sleepNights]
                  .reverse()
                  .slice(0, 7)
                  .map((n, idx) => (
                    <View
                      key={n.date}
                      style={[
                        styles.historyRow,
                        { borderBottomColor: colors.line },
                        idx === 6 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={{ gap: 2 }}>
                        <Text style={[styles.rowDate, { color: colors.ink }]}>{n.date}</Text>
                        <Text style={[styles.rowStages, { color: colors.muted }]}>
                          Deep {formatMinutes(n.deepMin)} · REM {formatMinutes(n.remMin)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={[styles.rowDur, { color: colors.ink }]}>
                          {formatMinutes(n.minutes)}
                        </Text>
                        <Text style={[styles.rowScore, { color: colors.muted }]}>
                          Score {n.score}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          </View>
        )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  viewContent: {
    gap: 16,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  scoreCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  summaryDetails: {
    flex: 1,
    gap: 2,
  },
  sleepDuration: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  sleepHours: {
    fontSize: 13,
  },
  sleepDiff: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  stagesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
  },
  stageCol: {
    gap: 2,
  },
  stageDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stageLabel: {
    fontSize: 12,
  },
  stageMin: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stagePct: {
    fontSize: 11,
  },
  coachCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 18,
    borderRadius: 24,
  },
  coachHeading: {
    fontSize: 15,
    fontWeight: '600',
  },
  coachBody: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardSub: {
    fontSize: 12,
  },
  footnote: {
    fontSize: 12,
    marginTop: 8,
  },
  consistencyList: {
    gap: 8,
    marginTop: 12,
  },
  consistencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cDate: {
    width: 44,
    fontSize: 11.5,
  },
  cTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  cFill: {
    position: 'absolute',
    height: 10,
    borderRadius: 5,
    opacity: 0.7,
  },
  cBed: {
    width: 50,
    textAlign: 'right',
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  historyBlock: {
    gap: 8,
  },
  historyHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowStages: {
    fontSize: 12,
  },
  rowDur: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowScore: {
    fontSize: 11.5,
  },
});


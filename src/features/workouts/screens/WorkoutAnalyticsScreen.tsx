import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { weeklyVolume } from '../data/workoutsMock';
import {
  benchE1rm,
  muscleSplit,
  sessionsPerWeek,
  workoutSummary as s,
} from '../data/workoutAnalyticsMock';
import { useTheme } from '@/hooks/use-theme';

type ViewType = 'frequency' | 'volume';

export function WorkoutAnalyticsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [view, setView] = useState<ViewType>('frequency');

  return (
    <Screen title="Workout analytics">
      <View style={styles.content}>
        {/* Last 30 days headline */}
        <View style={styles.headerSection}>
          <Text style={[styles.sectionSub, { color: colors.muted }]}>
            Last 30 days
          </Text>
          <Text style={[styles.bigSessions, { color: colors.ink }]}>
            {s.sessions30d}
            <Text style={[styles.sessionsUnit, { color: colors.muted }]}>
              {' '}
              sessions
            </Text>
          </Text>

          <View style={[styles.statsStrip, { borderTopColor: colors.line }]}>
            <View style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.muted }]}>
                Avg length
              </Text>
              <Text style={[styles.statVal, { color: colors.ink }]}>
                {s.avgDurationMin} min
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.muted }]}>
                Volume
              </Text>
              <Text style={[styles.statVal, { color: colors.ink }]}>
                {(s.totalVolumeKg / 1000).toFixed(1)} t
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.muted }]}>
                New PRs
              </Text>
              <Text style={[styles.statVal, { color: colors.ink }]}>
                {s.prs30d}
              </Text>
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
                data={sessionsPerWeek}
                goal={5}
                formatValue={(v) => `${v} sessions`}
                barColor={colors.accent}
                height={120}
              />
            ) : (
              <BarChart
                data={weeklyVolume}
                formatValue={(v) => `${v.toLocaleString()} kg`}
                barColor={colors.accent}
                height={120}
              />
            )}
          </View>

          <Text style={[styles.cardNote, { color: colors.muted }]}>
            {view === 'frequency'
              ? `Plan: 5 per week · ${Math.round(s.consistency * 100)}% adherence over 8 weeks`
              : 'Includes logged and Apple Watch strength sessions'}
          </Text>
        </View>

        {/* Muscle Split */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.ink }]}>
            Weekly sets by muscle group
          </Text>
          <View style={styles.musclesList}>
            {muscleSplit.map((m) => {
              const under = m.sets < m.target * 0.75;
              const fillPct = Math.min(100, (m.sets / 20) * 100);
              const targetPct = (m.target / 20) * 100;

              return (
                <View key={m.group} style={styles.muscleRow}>
                  <Text style={[styles.muscleGroup, { color: colors.ink }]}>
                    {m.group}
                  </Text>
                  <View
                    style={[
                      styles.trackBar,
                      { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <View
                      style={[
                        styles.fillBar,
                        {
                          width: `${fillPct}%`,
                          backgroundColor: under ? colors.warn : colors.accent,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.targetTick,
                        {
                          left: `${targetPct}%`,
                          backgroundColor: colors.ink,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.muscleNumbers,
                      { color: under ? colors.warn : colors.muted },
                    ]}
                  >
                    {m.sets}/{m.target}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.cardNote, { color: colors.muted }]}>
            Tick = recommended weekly sets for your goal.
          </Text>
        </View>

        {/* Bench Press E1RM */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <View style={styles.chartHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>
              Bench press · estimated 1RM
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigate('personalRecords')}
            >
              <Text style={[styles.allLiftsLink, { color: colors.muted }]}>
                All lifts
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: 12 }}>
            <LineChart
              points={benchE1rm}
              formatValue={(v) => `${v} kg`}
              height={130}
              strokeColor={colors.accent}
            />
          </View>
          <Text style={[styles.cardNote, { color: colors.muted }]}>
            Estimated from your best set each session (Epley formula) — not a tested max.
          </Text>
        </View>

        {/* AI Insight Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() =>
            navigate('coach', { q: 'Create a 45-minute fat-loss workout' })
          }
          style={[
            styles.aiInsightCard,
            { backgroundColor: colors.hero },
          ]}
        >
          <Sparkles size={18} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiInsightTitle, { color: colors.heroInk }]}>
              Core and legs are under-trained
            </Text>
            <Text style={[styles.aiInsightDesc, { color: colors.heroMuted }]}>
              Core is at 4 of 8 sets. Adding a 10-minute finisher twice a week would close the gap. Tap to plan it.
            </Text>
          </View>
        </TouchableOpacity>
      </View>
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


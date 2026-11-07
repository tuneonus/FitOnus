import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Award, FileText, Medal, Scale, Target, Trophy } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Chip } from '@/shared/components/ui/Chip';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { LineChart } from '@/shared/components/charts/LineChart';
import { BarChart } from '@/shared/components/charts/BarChart';
import type { TimeRange } from '@/shared/types/health';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { MetricKey, progressMetrics, rangeLabels } from '../data/progressMock';
import { aiInsights } from '../data/insightsMock';
import { InsightCard } from '../components/InsightCard';
import { useTheme } from '@/hooks/use-theme';
import { useProgressStore } from '../store/progressStore';

const fmt = (v: number, unit: string) =>
  unit === 'h'
    ? `${Math.floor(v)}h ${Math.round((v % 1) * 60)}m`
    : `${v.toLocaleString()}${unit ? ` ${unit}` : ''}`;

export function ProgressScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const [range, setRange] = useState<TimeRange>('M');
  const [metric, setMetric] = useState<MetricKey>('weight');

  const {
    analyticsData,
    periodComparison,
    achievements: storeAchievements,
    isRefreshing,
    refreshAll,
    fetchAnalytics,
    fetchPeriodComparison,
    fetchAchievements,
  } = useProgressStore();

  useEffect(() => {
    fetchAnalytics(metric, range).catch(() => {});
    const period = range === 'W' ? 'week' : 'month';
    fetchPeriodComparison(period).catch(() => {});
    fetchAchievements().catch(() => {});
  }, [metric, range, fetchAnalytics, fetchPeriodComparison, fetchAchievements]);

  const liveData = analyticsData[`${metric}-${range}`];
  const m = progressMetrics[metric];

  const points = liveData && liveData.points ? liveData.points : [];
  const hasEmptyPoints = points.length === 0;

  const first = liveData ? liveData.firstValue : points[0]?.value ?? 0;
  const last = liveData ? liveData.latestValue : points[points.length - 1]?.value ?? 0;
  const delta = liveData ? liveData.delta : last - first;
  const improving = (liveData?.lowerIsBetter ?? m.lowerIsBetter) ? delta < 0 : delta > 0;
  const blocked =
    (m.requiresDevice ||
      (liveData && !liveData.hasDeviceData && ['sleep', 'recovery', 'steps'].includes(metric))) &&
    !hasDevice;

  const comparisonTitle = periodComparison?.title ?? (range === 'W' ? 'This Week vs Last Week' : 'This Month vs Last Month');
  const comparisonItems =
    periodComparison && periodComparison.comparisons.length > 0
      ? periodComparison.comparisons.map(
          (c) => [c.label, c.current, c.previous, c.better] as const,
        )
      : ([
          ['Workouts', '0', '0', true],
          ['Weight change', '0.0 kg', '0.0 kg', true],
          ['Avg sleep', '—', '—', true],
          ['Avg protein', '—', '—', true],
          ['Avg calories', '—', '—', true],
        ] as const);

  const activeAchievements = storeAchievements ?? [];

  return (
    <Screen title="Progress" subtitle="Trends, goals and AI reports">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshAll}
            tintColor={colors.accent}
          />
        }
      >
        <SegmentedControl
          options={[
            { value: 'D', label: 'Daily' },
            { value: 'W', label: 'Weekly' },
            { value: 'M', label: 'Monthly' },
            { value: 'Y', label: 'Yearly' },
          ]}
          value={range}
          onChange={(val) => setRange(val as TimeRange)}
        />

        {/* Metric selection chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {(Object.keys(progressMetrics) as MetricKey[]).map((k) => (
            <Chip
              key={k}
              label={progressMetrics[k].label}
              selected={k === metric}
              onPress={() => setMetric(k)}
            />
          ))}
        </ScrollView>

        {/* Metric chart card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {blocked ? (
            <EmptyState
              compact
              icon={m.label === 'Sleep' ? FileText : Target}
              title={`${m.label} needs a wearable`}
              body="Connect Apple Health or Health Connect to see this trend."
              actionLabel="Connect"
              onAction={() => navigate('healthIntegration')}
            />
          ) : (
            <>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>
                {m.label} · {rangeLabels[range]}
              </Text>
              <View style={styles.metricValRow}>
                <Text style={[styles.metricNumber, { color: colors.ink }]}>{fmt(last, m.unit)}</Text>
                <Text
                  style={[
                    styles.metricDelta,
                    { color: improving ? colors.good : colors.warn },
                  ]}
                >
                  {delta > 0 ? '+' : ''}
                  {m.unit === 'h' ? fmt(Math.abs(delta), 'h') : `${Number(delta.toFixed(1)).toLocaleString()}`}{' '}
                  vs start
                </Text>
              </View>
              <View style={styles.chartWrapper}>
                {hasEmptyPoints ? (
                  <View style={{ height: 160, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>
                      No {m.label.toLowerCase()} entries recorded for {rangeLabels[range].toLowerCase()}.
                    </Text>
                  </View>
                ) : m.chart === 'line' ? (
                  <LineChart
                    key={`${metric}-${range}`}
                    points={points}
                    target={m.goal}
                    targetLabel={m.goal ? `Goal ${m.goal}` : undefined}
                    subtitle={metric === 'weight' ? 'EMA trend smoothed' : undefined}
                    formatValue={(v) => fmt(v, m.unit)}
                    height={170}
                    strokeColor={colors.accent}
                  />
                ) : (
                  <BarChart
                    key={`${metric}-${range}`}
                    data={points}
                    goal={m.goal}
                    formatValue={(v) => fmt(v, m.unit)}
                    height={150}
                    barColor={colors.accent}
                  />
                )}
              </View>
            </>
          )}
        </View>

        {/* Month comparison */}
        <View style={styles.sectionBlock}>
          <SectionHeader
            title={comparisonTitle}
            action="Ask coach"
            onAction={() => navigate('coach', { q: 'Compare this month with last month' })}
          />
          <View style={[styles.compareCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {comparisonItems.map(([label, a, b, better], idx, arr) => (
              <View
                key={label as string}
                style={[
                  styles.compareRow,
                  { borderBottomColor: colors.line },
                  idx === arr.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.compareLabel, { color: colors.ink }]}>{label as string}</Text>
                <View style={styles.compareVals}>
                  <Text
                    style={[
                      styles.compareA,
                      { color: better ? colors.good : colors.ink, fontWeight: better ? '700' : '500' },
                    ]}
                  >
                    {a as string}
                  </Text>
                  <Text style={[styles.compareB, { color: colors.muted }]}>{b as string}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* AI Insights */}
        <View style={styles.sectionBlock}>
          <SectionHeader title="AI insights" />
          <View style={{ gap: 10 }}>
            {aiInsights
              .filter((i) => hasDevice || !i.requiresDevice)
              .map((i) => (
                <InsightCard
                  key={i.id}
                  insight={i}
                  onAsk={() => navigate('coach', { q: i.question })}
                />
              ))}
          </View>
          <Text style={[styles.footnote, { color: colors.muted }]}>
            Insights are patterns in your data, not diagnoses.
          </Text>
        </View>

        {/* Achievements */}
        <View style={styles.sectionBlock}>
          <SectionHeader title="Achievements" />
          {activeAchievements.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, textAlign: 'center', padding: 12, fontSize: 13 }}>
                No achievements earned yet. Log workouts, nutrition and weigh-ins to unlock milestones.
              </Text>
            </View>
          ) : (
            <View style={styles.achievementsGrid}>
              {activeAchievements.map((a) => (
                <View
                  key={a.title}
                  style={[
                    styles.achCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                      borderStyle: a.earned ? 'solid' : 'dashed',
                    },
                  ]}
                >
                  <Medal size={20} color={a.earned ? colors.accent : colors.muted} />
                  <Text style={[styles.achTitle, { color: colors.ink }]}>{a.title}</Text>
                  <Text style={[styles.achDetail, { color: colors.muted }]}>
                    {a.earned ? a.detail : `In progress · ${a.detail}`}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Quick Nav Links */}
        <ListGroup>
          <ListRow
            icon={Award}
            title="Challenges & Badges"
            subtitle="Earn points, level up, and unlock rewards"
            onPress={() => navigate('challenges')}
          />
          <ListRow
            icon={FileText}
            title="AI reports"
            subtitle="Weekly every Sunday · monthly on the 1st"
            onPress={() => navigate('reports')}
          />
          <ListRow
            icon={Target}
            title="Goals"
            subtitle="View and track your targets"
            onPress={() => navigate('goals')}
          />
          <ListRow
            icon={Scale}
            title="Weight & body"
            onPress={() => navigate('weight')}
          />
          <ListRow
            icon={Trophy}
            title="Personal records"
            onPress={() => navigate('personalRecords')}
          />
        </ListGroup>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 18,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  metricLabel: {
    fontSize: 12,
  },
  metricValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 4,
  },
  metricNumber: {
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  metricDelta: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chartWrapper: {
    marginTop: 12,
  },
  sectionBlock: {
    gap: 10,
  },
  compareCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  compareLabel: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  compareVals: {
    flexDirection: 'row',
    gap: 16,
  },
  compareA: {
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  compareB: {
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  footnote: {
    fontSize: 11.5,
    paddingHorizontal: 4,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  achCard: {
    width: '48.5%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  achTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  achDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
});


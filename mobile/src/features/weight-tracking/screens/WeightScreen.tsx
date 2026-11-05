import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { ChevronRight, Plus, Ruler, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { SourceTag } from '@/shared/components/ui/SourceTag';
import { LineChart } from '@/shared/components/charts/LineChart';
import type { TimeRange } from '@/shared/types/health';
import { useTheme } from '@/hooks/use-theme';
import { useWeightStore } from '../store/weightStore';
import { weightByMonth } from '../data/weightMock';
import { AddWeightSheet } from '../components/AddWeightSheet';

export function WeightScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { entries, goalWeight, startWeight } = useWeightStore();
  const [range, setRange] = useState<TimeRange>('W');
  const [adding, setAdding] = useState(false);

  const latest = entries[entries.length - 1]!;
  const points =
    range === 'D'
      ? entries.slice(-7).map((e) => ({ label: e.date, value: e.value }))
      : range === 'W'
      ? entries.map((e) => ({ label: e.date, value: e.value }))
      : range === 'M'
      ? [...weightByMonth.slice(-5, -1), { label: 'Oct', value: latest.value }]
      : [...weightByMonth.slice(0, -1), { label: 'Oct', value: latest.value }];

  const firstPt = points[0]?.value ?? latest.value;
  const lastPt = points[points.length - 1]?.value ?? latest.value;
  const change = lastPt - firstPt;
  const lost = startWeight - latest.value;

  return (
    <Screen
      title="Weight"
      footer={
        <Button size="lg" fullWidth icon={Plus} onPress={() => setAdding(true)}>
          Log weight
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Current Weight Hero */}
        <View style={styles.currentSection}>
          <Text style={[styles.currentLabel, { color: colors.muted }]}>Current</Text>
          <View style={styles.weightNumberRow}>
            <Text style={[styles.weightBig, { color: colors.ink }]}>{latest.value.toFixed(1)}</Text>
            <Text style={[styles.weightUnit, { color: colors.muted }]}>kg</Text>
          </View>
          <View style={styles.badgeRow}>
            <Text
              style={[
                styles.changeText,
                { color: change <= 0 ? colors.good : colors.warn },
              ]}
            >
              {change > 0 ? '+' : ''}
              {change.toFixed(1)} kg this view
            </Text>
            <SourceTag
              source={
                latest.source === 'synced'
                  ? { kind: 'synced', label: 'Smart scale' }
                  : { kind: 'manual', label: `Logged ${latest.time ?? ''}` }
              }
            />
          </View>
        </View>

        {/* Time range + Line Chart */}
        <View style={styles.chartBlock}>
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
          <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <LineChart
              key={range}
              points={points}
              target={goalWeight}
              targetLabel={`Goal ${goalWeight}`}
              formatValue={(v) => `${v.toFixed(1)} kg`}
              height={170}
              strokeColor={colors.accent}
            />
          </View>
        </View>

        {/* Goal progress card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.goalHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Goal · {goalWeight} kg</Text>
            <Text style={[styles.goalSub, { color: colors.muted }]}>
              {(latest.value - goalWeight).toFixed(1)} kg to go
            </Text>
          </View>
          <ProgressBar
            value={lost}
            max={startWeight - goalWeight}
            color={colors.accent}
            trackColor={colors.surface2}
            style={{ marginTop: 12, height: 8 }}
          />
          <Text style={[styles.goalFootnote, { color: colors.muted }]}>
            Started at {startWeight} kg in January ·{' '}
            {Math.round((lost / (startWeight - goalWeight)) * 100)}% there
          </Text>
        </View>

        {/* Coach Insight */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('coach', { q: 'Why has my weight stopped changing?' })}
          style={[styles.coachCard, { backgroundColor: colors.surface2 }]}
        >
          <View style={{ marginTop: 2 }}>
            <Sparkles size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.coachHeading, { color: colors.ink }]}>
              Your pace slowed this week
            </Text>
            <Text style={[styles.coachBody, { color: colors.muted }]}>
              −0.4 kg over 10 days vs −0.9 kg before. Weekend calories look like the cause. Tap for the breakdown.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Measurements Link */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigate('measurements')}
          style={[styles.measurementsCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={[styles.rulerIconBox, { backgroundColor: colors.surface2 }]}>
            <Ruler size={18} color={colors.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.measurementsTitle, { color: colors.ink }]}>Body measurements</Text>
            <Text style={[styles.measurementsSub, { color: colors.muted }]}>
              Body fat 18.6% · Waist 86.5 cm · Oct 4
            </Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </TouchableOpacity>

        {/* History */}
        <View style={styles.historyBlock}>
          <Text style={[styles.historyHeading, { color: colors.ink }]}>History</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {[...entries]
              .reverse()
              .slice(0, 8)
              .map((e, i, arr) => {
                const prev = arr[i + 1];
                const d = prev ? e.value - prev.value : 0;
                return (
                  <View
                    key={e.date}
                    style={[
                      styles.historyRow,
                      { borderBottomColor: colors.line },
                      i === Math.min(arr.length, 8) - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={{ gap: 3 }}>
                      <Text style={[styles.rowDate, { color: colors.ink }]}>{e.date}</Text>
                      <SourceTag
                        source={
                          e.source === 'synced'
                            ? { kind: 'synced', label: 'Apple Health' }
                            : { kind: 'manual', label: e.note ?? 'Manual' }
                        }
                      />
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={[styles.rowWeight, { color: colors.ink }]}>{e.value.toFixed(1)}</Text>
                      {prev && (
                        <Text
                          style={[
                            styles.rowDiff,
                            { color: d <= 0 ? colors.good : colors.warn },
                          ]}
                        >
                          {d > 0 ? '+' : ''}
                          {d.toFixed(1)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
          </View>
        </View>
      </ScrollView>

      <AddWeightSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  currentSection: {
    paddingHorizontal: 4,
    gap: 2,
  },
  currentLabel: {
    fontSize: 13,
  },
  weightNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  weightBig: {
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  weightUnit: {
    fontSize: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chartBlock: {
    gap: 14,
  },
  chartCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  goalSub: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  goalFootnote: {
    fontSize: 12.5,
    marginTop: 8,
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
  measurementsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  rulerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measurementsTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  measurementsSub: {
    fontSize: 12.5,
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
  rowWeight: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowDiff: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});

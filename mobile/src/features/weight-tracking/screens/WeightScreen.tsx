import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { ChevronRight, Plus, Ruler, Sparkles, Trash2 } from 'lucide-react-native';
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
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { kgToLb } from '@/shared/utils/unit-conversion';
import { AddWeightSheet } from '../components/AddWeightSheet';
import { showToast } from '@/shared/stores/toastStore';

export function WeightScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const units = useSettingsStore((s) => s.units);
  const {
    entries,
    goalWeight,
    startWeight,
    points: storePoints,
    isLoading,
    fetchWeightHistory,
    deleteEntry,
  } = useWeightStore();
  const [range, setRange] = useState<TimeRange>('W');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchWeightHistory(range).catch(() => {});
  }, [range, fetchWeightHistory]);

  const latest = entries[entries.length - 1];
  const measurements = useWeightStore((s) => s.measurements);
  const latestMeas = measurements[0];

  const points =
    storePoints && storePoints.length > 0
      ? storePoints
      : entries.map((e) => ({ label: e.date, value: e.value }));

  const firstPt = points[0]?.value ?? latest?.value ?? 0;
  const lastPt = points[points.length - 1]?.value ?? latest?.value ?? 0;
  const rawChange = points.length > 1 ? lastPt - firstPt : 0;

  const displayLatest = latest
    ? units === 'imperial'
      ? (kgToLb(latest.value) ?? latest.value).toFixed(1)
      : latest.value.toFixed(1)
    : '—';

  const displayChange =
    units === 'imperial'
      ? (kgToLb(Math.abs(rawChange)) ?? Math.abs(rawChange)).toFixed(1)
      : Math.abs(rawChange).toFixed(1);

  const weightUnit = units === 'imperial' ? 'lb' : 'kg';
  const lost = latest ? startWeight - latest.value : 0;

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const ok = await deleteEntry(id);
    if (ok) {
      showToast({ message: 'Weight entry deleted' });
    }
  };

  return (
    <Screen
      title="Weight"
      footer={
        <Button size="lg" fullWidth icon={Plus} onPress={() => setAdding(true)}>
          Log weight
        </Button>
      }
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => fetchWeightHistory(range, true)}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.container}>
        {/* Current Weight Hero */}
        <View style={styles.currentSection}>
          <Text style={[styles.currentLabel, { color: colors.muted }]}>Current</Text>
          <View style={styles.weightNumberRow}>
            <Text style={[styles.weightBig, { color: colors.ink }]}>{displayLatest}</Text>
            {latest && <Text style={[styles.weightUnit, { color: colors.muted }]}>{weightUnit}</Text>}
          </View>
          <View style={styles.badgeRow}>
            {latest ? (
              <>
                <Text
                  style={[
                    styles.changeText,
                    { color: rawChange <= 0 ? colors.good : colors.warn },
                  ]}
                >
                  {rawChange > 0 ? '+' : rawChange < 0 ? '-' : ''}
                  {displayChange} {weightUnit} this view
                </Text>
                <SourceTag
                  source={
                    latest.source === 'synced'
                      ? { kind: 'synced', label: 'Smart scale' }
                      : { kind: 'manual', label: `Logged ${latest.time ?? ''}` }
                  }
                />
              </>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>No weight logged yet</Text>
            )}
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
            {points.length > 0 ? (
              <LineChart
                key={range}
                points={points}
                target={goalWeight}
                targetLabel={`Goal ${goalWeight}`}
                subtitle="EMA trend smoothed"
                formatValue={(v) => `${v.toFixed(1)} kg`}
                height={170}
                strokeColor={colors.accent}
              />
            ) : (
              <View style={{ height: 170, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>
                  No weight entries recorded for this time range.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Goal progress card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.goalHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Goal · {goalWeight} kg</Text>
            <Text style={[styles.goalSub, { color: colors.muted }]}>
              {latest ? `${(latest.value - goalWeight).toFixed(1)} kg to go` : 'Target set'}
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
              {latestMeas?.values?.waist
                ? `Waist ${latestMeas.values.waist} cm · ${latestMeas.date}`
                : 'Track waist, chest, arms and more'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </TouchableOpacity>

        {/* History */}
        <View style={styles.historyBlock}>
          <Text style={[styles.historyHeading, { color: colors.ink }]}>History</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {entries.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: 'center', padding: 16, fontSize: 13 }}>
                No weight history recorded yet.
              </Text>
            ) : (
              [...entries]
                .reverse()
                .slice(0, 8)
                .map((e, i, arr) => {
                  const prev = arr[i + 1];
                  const d = prev ? e.value - prev.value : 0;
                  return (
                    <View
                      key={e.id || `${e.date}-${i}`}
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.rowWeight, { color: colors.ink }]}>{e.value.toFixed(1)}</Text>
                          {e.id && (
                            <TouchableOpacity
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onPress={() => handleDelete(e.id)}
                            >
                              <Trash2 size={14} color={colors.muted} />
                            </TouchableOpacity>
                          )}
                        </View>
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
                })
            )}
          </View>
        </View>
      </View>

      <AddWeightSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
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

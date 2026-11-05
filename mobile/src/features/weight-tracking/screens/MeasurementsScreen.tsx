import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Plus, Sparkles } from 'lucide-react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Stepper } from '@/shared/components/ui/Stepper';
import { showToast } from '@/shared/stores/toastStore';
import { useWeightStore } from '../store/weightStore';
import { measurementMeta } from '../data/weightMock';
import { useTheme } from '@/hooks/use-theme';
import type { MeasurementKey } from '../types/weight';

export function MeasurementsScreen() {
  const { colors } = useTheme();
  const { measurements, addMeasurement } = useWeightStore();
  const [open, setOpen] = useState(false);
  const latest = measurements[0]!;
  const prev = measurements[1];
  const [draft, setDraft] = useState<Partial<Record<MeasurementKey, number>>>(latest.values);

  const save = () => {
    addMeasurement({ date: 'Oct 9', values: draft });
    setOpen(false);
    showToast({ message: 'Measurements saved' });
  };

  return (
    <Screen
      title="Body measurements"
      footer={
        <Button
          size="lg"
          fullWidth
          icon={Plus}
          onPress={() => {
            setDraft(latest.values);
            setOpen(true);
          }}
        >
          Add measurements
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subDate, { color: colors.muted }]}>
          Latest · {latest.date} · logged manually
        </Text>

        {/* Measurements Grid */}
        <View style={styles.grid}>
          {measurementMeta.map((m) => {
            const v = latest.values[m.key];
            const p = prev?.values[m.key];
            const d = v !== undefined && p !== undefined ? v - p : 0;
            const good = m.goodWhenLower ? d < 0 : d > 0;

            return (
              <View
                key={m.key}
                style={[styles.gridCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
              >
                <Text style={[styles.cardLabel, { color: colors.muted }]}>{m.label}</Text>
                <View style={styles.valRow}>
                  <Text style={[styles.cardVal, { color: colors.ink }]}>{v ?? '—'}</Text>
                  <Text style={[styles.cardUnit, { color: colors.muted }]}>{m.unit}</Text>
                </View>
                {d !== 0 && (
                  <Text
                    style={[
                      styles.cardDiff,
                      { color: good ? colors.good : colors.warn },
                    ]}
                  >
                    {d > 0 ? '+' : ''}
                    {d.toFixed(1)} vs {prev?.date}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Coach Insight */}
        <View style={[styles.coachCard, { backgroundColor: colors.surface2 }]}>
          <View style={{ marginTop: 2 }}>
            <Sparkles size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.coachText, { color: colors.muted }]}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>Losing fat, keeping muscle. </Text>
              Waist is down 3 cm in four weeks while muscle mass rose 0.4 kg. Body-fat readings from bio-impedance can swing ±2%, so I weight the trend over single readings.
            </Text>
          </View>
        </View>

        {/* History Table */}
        <View style={styles.historyBlock}>
          <Text style={[styles.historyHeading, { color: colors.ink }]}>History</Text>
          <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.colDate, styles.headerCell, { color: colors.muted }]}>Date</Text>
              <Text style={[styles.colVal, styles.headerCell, { color: colors.muted }]}>Fat %</Text>
              <Text style={[styles.colVal, styles.headerCell, { color: colors.muted }]}>Waist</Text>
              <Text style={[styles.colVal, styles.headerCell, { color: colors.muted }]}>Arm</Text>
            </View>

            {/* Table Rows */}
            {measurements.map((m, idx) => (
              <View
                key={m.date}
                style={[
                  styles.tableRow,
                  { borderBottomColor: colors.line },
                  idx === measurements.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.colDate, styles.dataCellText, { color: colors.ink }]}>{m.date}</Text>
                <Text style={[styles.colVal, styles.dataCellNum, { color: colors.ink }]}>
                  {m.values.bodyFat ?? '—'}
                </Text>
                <Text style={[styles.colVal, styles.dataCellNum, { color: colors.ink }]}>
                  {m.values.waist ?? '—'}
                </Text>
                <Text style={[styles.colVal, styles.dataCellNum, { color: colors.ink }]}>
                  {m.values.arm ?? '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Add Measurements Sheet */}
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add measurements"
        description="Fri, Oct 9 · cm unless noted"
        footer={
          <Button size="lg" fullWidth onPress={save}>
            Save
          </Button>
        }
      >
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          {measurementMeta.map((m, idx) => (
            <View
              key={m.key}
              style={[
                styles.sheetRow,
                { borderBottomColor: colors.line },
                idx === measurementMeta.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <Text style={[styles.sheetLabel, { color: colors.ink }]}>{m.label}</Text>
              <View style={styles.sheetStepperBox}>
                <Stepper
                  label={m.label}
                  value={draft[m.key] ?? 0}
                  onChange={(v) => setDraft({ ...draft, [m.key]: v })}
                  step={m.unit === '%' ? 0.1 : 0.5}
                  decimals={1}
                  unit={m.unit}
                />
              </View>
            </View>
          ))}
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  subDate: {
    fontSize: 13,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48.5%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  cardLabel: {
    fontSize: 12,
  },
  valRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 2,
  },
  cardVal: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardUnit: {
    fontSize: 12,
  },
  cardDiff: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  coachCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 18,
    borderRadius: 24,
  },
  coachText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  historyBlock: {
    gap: 8,
  },
  historyHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  tableCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tableHeader: {
    paddingVertical: 10,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '600',
  },
  colDate: {
    flex: 1.5,
  },
  colVal: {
    flex: 1,
    textAlign: 'right',
  },
  dataCellText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dataCellNum: {
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetLabel: {
    fontSize: 15,
    flex: 1,
  },
  sheetStepperBox: {
    width: 170,
  },
});


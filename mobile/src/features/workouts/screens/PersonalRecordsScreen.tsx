import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { Screen } from '../../../shared/components/ui/Screen';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import { personalRecords } from '../data/workoutsMock';
import { useTheme } from '@/hooks/use-theme';

export function PersonalRecordsScreen() {
  const { colors } = useTheme();
  const lifts = personalRecords.filter((r) => r.history.length > 0);
  const [selected, setSelected] = useState(lifts[0]?.lift || 'Barbell Bench Press');
  const rec = lifts.find((l) => l.lift === selected) ?? lifts[0]!;

  return (
    <Screen title="Personal records">
      <View style={styles.content}>
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
            {rec.lift}
          </Text>
          <Text style={[styles.liftBest, { color: colors.ink }]}>
            {rec.best}
          </Text>
          <Text style={[styles.e1rmText, { color: colors.muted }]}>
            Estimated 1RM{' '}
            <Text style={{ color: colors.ink, fontWeight: '600' }}>
              {rec.e1rm} kg
            </Text>{' '}
            · set {rec.date}
          </Text>

          <View style={{ marginTop: 12 }}>
            <LineChart
              points={rec.history.map((v, i) => ({
                label: `W${34 + i}`,
                value: v,
              }))}
              ariaLabel={`${rec.lift} top set by week`}
              height={130}
              formatValue={(v) => `${v} kg`}
              strokeColor={colors.accent}
            />
          </View>

          <Text style={[styles.formulaNote, { color: colors.muted }]}>
            Estimated 1RM uses the Epley formula — a guide, not a tested max.
          </Text>
        </View>

        {/* All Lifts List */}
        <View style={styles.liftsList}>
          {personalRecords.map((r, idx) => {
            const isSelected = r.lift === selected;
            const hasHistory = r.history.length > 0;

            return (
              <TouchableOpacity
                key={r.lift}
                activeOpacity={0.7}
                disabled={!hasHistory}
                onPress={() => setSelected(r.lift)}
                style={[
                  styles.liftRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                ]}
              >
                <Trophy
                  size={18}
                  color={isSelected ? colors.accent : colors.muted}
                />
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
                    {r.lift}
                  </Text>
                  <Text style={[styles.rowLiftBest, { color: colors.muted }]}>
                    {r.best} · {r.date}
                  </Text>
                </View>

                {hasHistory && (
                  <Sparkline
                    points={r.history}
                    strokeColor={colors.ink}
                    width={64}
                    height={28}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
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


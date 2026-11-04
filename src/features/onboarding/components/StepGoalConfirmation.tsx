import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Info, Edit2 } from 'lucide-react-native';
import { useProfileSetupStore } from '../store/profileSetupStore';
import { experienceLevels, fitnessGoals } from '../constants/options';
import { useTheme } from '@/hooks/use-theme';

export type StepGoalConfirmationProps = {
  onEdit: (stepId: string) => void;
};

export function StepGoalConfirmation({ onEdit }: StepGoalConfirmationProps) {
  const { colors } = useTheme();
  const s = useProfileSetupStore();
  const goal = fitnessGoals.find((g) => g.value === s.goal);
  const exp = experienceLevels.find((e) => e.value === s.experience);
  const target =
    s.goal === 'lose' ? 75 : s.goal === 'gain' ? s.weightKg + 4 : s.weightKg;

  const rows = [
    { label: 'Goal', value: goal?.label ?? '—', step: 'goal' },
    {
      label: 'Target',
      value:
        s.goal === 'lose' || s.goal === 'gain'
          ? `${target.toFixed(1)} kg`
          : 'Keep within ±1 kg',
      step: 'weight',
    },
    {
      label: 'Training',
      value: `${s.daysPerWeek}× / week · ${s.durationMin} min`,
      step: 'workoutPreference',
    },
    { label: 'Level', value: exp?.label ?? '—', step: 'experience' },
    {
      label: 'Eating style',
      value:
        s.diet === 'none'
          ? 'No preference'
          : s.diet.charAt(0).toUpperCase() + s.diet.slice(1),
      step: 'food',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Hero Summary Box */}
      <View style={[styles.heroBox, { backgroundColor: colors.hero }]}>
        <Text style={[styles.heroSub, { color: colors.heroMuted }]}>
          Your starting plan
        </Text>
        <View style={styles.metricsGrid}>
          {[
            ['2,350', 'kcal / day'],
            ['150 g', 'protein'],
            [`${s.daysPerWeek}`, 'workouts / wk'],
          ].map(([val, label]) => (
            <View key={label} style={styles.metricItem}>
              <Text style={[styles.metricVal, { color: colors.heroInk }]}>
                {val}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.heroMuted }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {s.goal === 'lose' && (
          <View
            style={[
              styles.projectionBox,
              { borderTopColor: 'rgba(244, 244, 238, 0.12)' },
            ]}
          >
            <Text style={[styles.projectionText, { color: colors.heroInk }]}>
              Projected to reach{' '}
              <Text style={{ fontWeight: '700' }}>75 kg</Text> between{' '}
              <Text style={{ fontWeight: '700', color: colors.accent }}>
                late Dec and mid Jan
              </Text>
              .
            </Text>
            <View style={styles.infoRow}>
              <Info size={13} color={colors.heroMuted} style={styles.infoIcon} />
              <Text style={[styles.infoText, { color: colors.heroMuted }]}>
                Estimate at ~0.4 kg/week. Real progress varies with adherence,
                water and sleep.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Row List */}
      <View
        style={[
          styles.rowsCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
          },
        ]}
      >
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={[
              styles.row,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.muted }]}>
              {r.label}
            </Text>
            <Text
              style={[styles.rowValue, { color: colors.ink }]}
              numberOfLines={1}
            >
              {r.value}
            </Text>
            <TouchableOpacity
              onPress={() => onEdit(r.step)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.editBtn}
            >
              <Edit2 size={15} color={colors.muted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  heroBox: {
    borderRadius: 24,
    padding: 20,
  },
  heroSub: {
    fontSize: 13,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  metricItem: {
    flex: 1,
  },
  metricVal: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  metricLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  projectionBox: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
  },
  projectionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    gap: 6,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  rowsCard: {
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    width: 90,
    fontSize: 13,
  },
  rowValue: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
  },
  editBtn: {
    padding: 4,
  },
});


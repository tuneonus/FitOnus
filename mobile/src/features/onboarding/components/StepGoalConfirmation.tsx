import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, Edit2 } from 'lucide-react-native';
import { useProfileSetupStore } from '../store/profileSetupStore';
import { dietOptions, experienceLevels, fitnessGoals, workoutPlaces } from '../constants/options';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/hooks/use-profile';

export type StepGoalConfirmationProps = {
  onEdit: (stepId: string) => void;
};

export function StepGoalConfirmation({ onEdit }: StepGoalConfirmationProps) {
  const { colors } = useTheme();
  const s = useProfileSetupStore();
  const { data: profile } = useProfile();
  const goal = fitnessGoals.find((g) => g.value === s.goal);
  const exp = experienceLevels.find((e) => e.value === s.experience);

  // Derive metabolic targets from server or local Mifflin-St Jeor formula
  const age = Math.max(13, new Date().getFullYear() - (s.dobYear || 1997));
  const sexOffset = s.sex === 'male' ? 5 : s.sex === 'female' ? -161 : -78;
  const bmr = 10 * (s.weightKg || 70) + 6.25 * (s.heightCm || 170) - 5 * age + sexOffset;
  const multiplier =
    s.daysPerWeek === 0
      ? 1.2
      : s.daysPerWeek <= 2
        ? 1.375
        : s.daysPerWeek <= 4
          ? 1.55
          : s.daysPerWeek <= 6
            ? 1.725
            : 1.9;
  const tdee = Math.round(bmr * multiplier);
  const localCal =
    s.goal === 'lose'
      ? Math.max(s.sex === 'female' ? 1200 : 1500, tdee - 500)
      : s.goal === 'gain'
        ? tdee + 300
        : tdee;
  const localProtein = Math.round(
    (s.weightKg || 70) *
      (s.goal === 'lose' || s.goal === 'strength' ? 2.0 : s.goal === 'gain' ? 2.2 : 1.6),
  );

  const displayCalories = profile?.calculatedTargets?.dailyCalorieTarget ?? localCal;
  const displayProtein = profile?.calculatedTargets?.dailyProteinGrams ?? localProtein;

  const rows = [
    { label: 'Your name', value: s.name, step: 'personal' },
    {
      label: 'Birthday',
      value: new Date(s.dobYear, s.dobMonth - 1, s.dobDay).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      step: 'dob',
    },
    { label: 'Height', value: `${s.heightCm} cm`, step: 'height' },
    { label: 'Starting weight', value: `${s.weightKg.toFixed(1)} kg`, step: 'weight' },
    { label: 'Main goal', value: goal?.label ?? '—', step: 'goal' },
    { label: 'Experience', value: exp?.label ?? '—', step: 'experience' },
    {
      label: 'Training',
      value: `${s.daysPerWeek} days / week · ${workoutPlaces.find((item) => item.value === s.place)?.label ?? s.place}`,
      step: 'workoutPreference',
    },
    { label: 'Session length', value: `${s.durationMin} minutes`, step: 'duration' },
    {
      label: 'Equipment',
      value: s.equipment.length ? s.equipment.join(', ') : 'Bodyweight',
      step: 'equipment',
    },
    {
      label: 'Eating style',
      value: dietOptions.find((item) => item.value === s.diet)?.label ?? s.diet,
      step: 'food',
    },
    {
      label: 'Food restrictions',
      value: s.allergies.length ? s.allergies.join(', ') : 'None selected',
      step: 'food',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.heroBox, { backgroundColor: colors.hero }]}>
        <View style={styles.heroHeading}>
          <Sparkles size={16} color={colors.accent} />
          <Text style={[styles.heroSub, { color: colors.heroMuted }]}>YOUR STARTING PLAN</Text>
        </View>
        <Text style={[styles.goalTitle, { color: colors.heroInk }]}>
          {goal?.label ?? 'Your personal plan'}
        </Text>
        <Text style={[styles.calorieValue, { color: colors.accent }]}>
          {displayCalories.toLocaleString()}
          <Text style={[styles.calorieUnit, { color: colors.heroMuted }]}> kcal / day</Text>
        </Text>
        <View style={[styles.metricsGrid, { borderTopColor: 'rgba(244,244,238,0.12)' }]}>
          {[
            [`${displayProtein} g`, 'daily protein'],
            [`${s.daysPerWeek} days`, 'training each week'],
          ].map(([value, label]) => (
            <View key={label} style={styles.metricItem}>
              <Text style={[styles.metricVal, { color: colors.heroInk }]}>{value}</Text>
              <Text style={[styles.metricLabel, { color: colors.heroMuted }]}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.estimateNote, { color: colors.heroMuted }]}>
          Starting estimates based on your profile. Your plan can be adjusted as you go.
        </Text>
      </View>
      <Text style={[styles.reviewTitle, { color: colors.ink }]}>
        The details that make it yours
      </Text>

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
          <TouchableOpacity
            key={r.label}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${r.label.toLowerCase()}: ${r.value}`}
            onPress={() => onEdit(r.step)}
            activeOpacity={0.7}
            style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
          >
            <View style={styles.rowCopy}>
              <Text style={[styles.rowLabel, { color: colors.muted }]}>{r.label}</Text>
              <Text style={[styles.rowValue, { color: colors.ink }]}>{r.value}</Text>
            </View>
            <View style={[styles.editBtn, { backgroundColor: colors.surface2 }]}>
              <Edit2 size={15} color={colors.muted} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  heroBox: { borderRadius: 28, padding: 24 },
  heroHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSub: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2 },
  goalTitle: { fontSize: 21, fontWeight: '700', marginTop: 16, letterSpacing: -0.5 },
  calorieValue: { fontSize: 38, fontWeight: '700', letterSpacing: -1.3, marginTop: 10 },
  calorieUnit: { fontSize: 12, fontWeight: '400', letterSpacing: 0 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    borderTopWidth: 1,
    paddingTop: 18,
    marginTop: 20,
  },
  metricItem: { flex: 1, minWidth: 100, gap: 4 },
  metricVal: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  metricLabel: { fontSize: 11, lineHeight: 17 },
  estimateNote: { fontSize: 11, lineHeight: 18, marginTop: 18 },
  reviewTitle: { fontSize: 16, fontWeight: '700', marginTop: 10, letterSpacing: -0.3 },
  rowsCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, minHeight: 72, gap: 12 },
  rowCopy: { flex: 1, gap: 5 },
  rowLabel: { fontSize: 11.5 },
  rowValue: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

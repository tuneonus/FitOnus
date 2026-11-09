import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { ArrowUpRight, Utensils } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/shared/components/ui/Card';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { premium } from '@/shared/theme/premium';
import { type HomeNutrition, progressRatio } from '../utils/home-overview';

const macros = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;
const format = (value: number | null) =>
  value === null ? '—' : Math.round(value).toLocaleString();

const defaultOverview: HomeNutrition = {
  available: false,
  totals: { kcal: null, protein: null, carbs: null, fat: null },
  goals: { kcal: null, protein: null, carbs: null, fat: null, waterMl: null },
  waterMl: null,
  remaining: null,
  pendingMeals: 0,
  sourceLabel: 'Your nutrition, at a glance',
};

export function NutritionSummary({
  overview = defaultOverview,
  onOpen,
}: {
  overview?: HomeNutrition;
  onOpen?: () => void;
} = {}) {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 375 || fontScale > 1.25;
  const handleOpen = onOpen ?? (() => navigate('nutrition'));
  const { totals, goals, remaining } = overview;
  const ratio = progressRatio(totals.kcal, goals.kcal);
  return (
    <Card
      tone="hero"
      appearance="premium"
      style={{ ...styles.card, ...(compact ? styles.compactCard : {}) }}
    >
      <View style={styles.topRow}>
        <Text style={[premium.type.eyebrow, { color: colors.heroMuted }]}>DAILY FUEL</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open today’s nutrition diary"
          onPress={handleOpen}
          style={({ pressed }) => [styles.open, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[premium.type.caption, { color: colors.heroInk }]}>Nutrition</Text>
          <ArrowUpRight size={16} color={colors.heroInk} />
        </Pressable>
      </View>
      <View style={[styles.energyRow, compact && styles.stacked]}>
        <View style={styles.energyCopy}>
          <Text style={[styles.energy, compact && styles.compactEnergy, { color: colors.heroInk }]}>
            {format(totals.kcal)}
          </Text>
          <Text style={[premium.type.body, { color: colors.heroMuted }]}>kcal logged</Text>
          <Text style={[styles.target, { color: colors.heroMuted }]}>
            {goals.kcal !== null
              ? `of ${format(goals.kcal)} kcal daily goal`
              : 'Your calorie goal isn’t set yet'}
          </Text>
        </View>
        {!compact && (
          <View
            accessible
            accessibilityLabel={
              goals.kcal !== null && totals.kcal !== null
                ? `${Math.round(ratio * 100)} percent of calorie goal logged`
                : 'Calorie goal unavailable'
            }
          >
            <ProgressRing
              size={112}
              stroke={7}
              value={ratio}
              color={colors.accent}
              trackColor="rgba(244,244,238,0.12)"
            >
              {goals.kcal !== null && totals.kcal !== null ? (
                <>
                  <Text style={[styles.percent, { color: colors.heroInk }]}>
                    {Math.round(ratio * 100)}%
                  </Text>
                  <Text style={[premium.type.caption, { color: colors.heroMuted }]}>of goal</Text>
                </>
              ) : (
                <Utensils size={25} color={colors.accent} />
              )}
            </ProgressRing>
          </View>
        )}
      </View>
      {compact ? (
        <ProgressBar
          value={ratio}
          color={colors.accent}
          trackColor="rgba(244,244,238,0.12)"
          height={5}
          style={styles.compactProgress}
        />
      ) : null}
      <Text
        style={[styles.remaining, compact && styles.compactRemaining, { color: colors.accent }]}
      >
        {remaining === null
          ? 'Log a meal to build your day.'
          : remaining >= 0
            ? `${format(remaining)} kcal remaining`
            : `${format(Math.abs(remaining))} kcal above goal`}
      </Text>
      <View
        style={[
          styles.macros,
          compact && styles.compactMacros,
          { borderTopColor: 'rgba(244,244,238,0.16)' },
        ]}
      >
        {macros.map(({ key, label }) => (
          <View key={key} style={[styles.macro, fontScale > 1.25 && styles.macroLarge]}>
            <Text style={[premium.type.caption, { color: colors.heroMuted }]}>{label}</Text>
            <Text style={[styles.macroValue, { color: colors.heroInk }]}>
              {format(totals[key])}
              <Text style={styles.grams}> g</Text>
            </Text>
            <ProgressBar
              value={progressRatio(totals[key], goals[key])}
              color={
                key === 'protein'
                  ? colors.accent
                  : key === 'carbs'
                    ? premium.chart.inverseCarbs
                    : premium.chart.inverseFat
              }
              trackColor="rgba(244,244,238,0.12)"
              height={4}
              style={styles.bar}
            />
            <Text style={[premium.type.caption, { color: colors.heroMuted }]}>
              {goals[key] !== null ? `of ${format(goals[key])} g` : 'Goal not set'}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.bottomRow, compact && styles.compactBottomRow]}>
        <Text style={[styles.source, { color: colors.heroMuted }]}>
          {overview.sourceLabel}
          {overview.pendingMeals > 0 ? ' · Sync pending' : ''}
        </Text>
        {goals.kcal === null ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('nutritionPreferences')}
            style={styles.goalAction}
          >
            <Text style={[premium.type.caption, { color: colors.accent }]}>Set goals</Text>
            <ArrowUpRight size={14} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: premium.radius.hero, padding: 20 },
  compactCard: { padding: 16 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: -8,
  },
  open: { minHeight: 48, flexDirection: 'row', gap: 6, alignItems: 'center', paddingLeft: 8 },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
  },
  energyCopy: { flex: 1, minWidth: 0 },
  energy: { ...premium.type.number },
  compactEnergy: { fontSize: 36, lineHeight: 44 },
  target: { ...premium.type.caption, marginTop: 8 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  remaining: { ...premium.type.label, marginTop: 16 },
  compactRemaining: { marginTop: 12 },
  percent: { ...premium.type.metric },
  macros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  macro: { flex: 1, minWidth: 65, gap: 4 },
  compactMacros: { marginTop: 16, paddingTop: 16 },
  macroLarge: { minWidth: 104 },
  compactProgress: { marginTop: 16 },
  macroValue: { ...premium.type.metric, fontSize: 22 },
  grams: { ...premium.type.caption },
  bar: { marginVertical: 4 },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 8,
  },
  source: { ...premium.type.caption, flexShrink: 1 },
  compactBottomRow: { marginTop: 12 },
  goalAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
});

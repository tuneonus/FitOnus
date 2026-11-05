import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import {
  useDailyTotals,
  useNutritionStore,
} from '../../nutrition/store/nutritionStore';
import {
  macroMeta,
  mealLabels,
  mealOrder,
  nutritionGoals,
} from '../../nutrition/constants/meals';
import { useTheme } from '@/hooks/use-theme';

export function NutritionSummary() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const totals = useDailyTotals();
  const entries = useNutritionStore((s) => s.entries);
  const remaining = nutritionGoals.kcal - totals.kcal;

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Nutrition"
        actionLabel="Open"
        onAction={() => navigate('nutrition')}
      />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={styles.kcalRow}>
          <View>
            <Text style={[styles.remainingLabel, { color: colors.muted }]}>
              {remaining >= 0 ? 'Remaining today' : 'Over goal'}
            </Text>
            <Text style={[styles.remainingVal, { color: colors.ink }]}>
              {Math.abs(Math.round(remaining)).toLocaleString()}
              <Text style={[styles.kcalUnit, { color: colors.muted }]}>
                {' '}kcal
              </Text>
            </Text>
          </View>

          <Text style={[styles.consumedMeta, { color: colors.muted }]}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>
              {Math.round(totals.kcal).toLocaleString()}
            </Text>{' '}
            eaten{'\n'}of {nutritionGoals.kcal.toLocaleString()} goal
          </Text>
        </View>

        <ProgressBar
          value={totals.kcal / nutritionGoals.kcal}
          height={8}
          color={colors.accent}
          style={styles.kcalBar}
        />

        {/* 4 Macros */}
        <View style={styles.macrosRow}>
          {macroMeta.map((m) => {
            const macroVal = totals[m.key] || 0;
            const macroGoal = nutritionGoals[m.key] || 1;
            const macroColor =
              m.key === 'protein'
                ? colors.move
                : m.key === 'carbs'
                ? colors.sky
                : m.key === 'fat'
                ? colors.warn
                : colors.accentStrong;

            return (
              <View key={m.key} style={styles.macroCol}>
                <Text style={[styles.macroLabel, { color: colors.muted }]}>
                  {m.label}
                </Text>
                <Text style={[styles.macroVal, { color: colors.ink }]}>
                  {Math.round(macroVal)}
                  <Text style={{ fontSize: 10.5, color: colors.muted }}>
                    /{macroGoal}g
                  </Text>
                </Text>
                <ProgressBar
                  value={macroVal / macroGoal}
                  height={4}
                  color={macroColor}
                  style={styles.macroBar}
                />
              </View>
            );
          })}
        </View>

        {/* Meal slots grid */}
        <View style={styles.mealsGrid}>
          {mealOrder.map((meal) => {
            const kcal = entries
              .filter((e) => e.meal === meal)
              .flatMap((e) => e.items)
              .reduce((s, i) => s + i.kcal, 0);

            return (
              <TouchableOpacity
                key={meal}
                activeOpacity={0.7}
                onPress={() =>
                  kcal
                    ? navigate('nutrition')
                    : navigate('foodSearch', { meal })
                }
                style={[
                  styles.mealBox,
                  kcal
                    ? { backgroundColor: colors.surface2 }
                    : {
                        borderColor: colors.line,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                      },
                ]}
              >
                <Text style={[styles.mealLabel, { color: colors.muted }]}>
                  {mealLabels[meal]}
                </Text>
                {kcal > 0 ? (
                  <Text style={[styles.mealKcal, { color: colors.ink }]}>
                    {Math.round(kcal)}
                  </Text>
                ) : (
                  <View style={styles.logRow}>
                    <Plus size={12} color={colors.ink} />
                    <Text style={[styles.logText, { color: colors.ink }]}>
                      Log
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginTop: 4,
  },
  kcalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  remainingLabel: {
    fontSize: 12,
  },
  remainingVal: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  kcalUnit: {
    fontSize: 14,
    fontWeight: '400',
  },
  consumedMeta: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
  },
  kcalBar: {
    marginTop: 14,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  macroCol: {
    flex: 1,
  },
  macroLabel: {
    fontSize: 11,
  },
  macroVal: {
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 2,
  },
  macroBar: {
    marginTop: 6,
  },
  mealsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  mealBox: {
    flex: 1,
    height: 60,
    borderRadius: 16,
    padding: 8,
    justifyContent: 'space-between',
  },
  mealLabel: {
    fontSize: 11,
  },
  mealKcal: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  logText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});


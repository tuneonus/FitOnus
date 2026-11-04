import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { BarChart } from '@/shared/components/charts/BarChart';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { useTheme } from '@/hooks/use-theme';
import { useDailyTotals } from '../store/nutritionStore';
import { mealHistory } from '../data/foodsMock';
import { nutritionGoals } from '../constants/meals';

export function MealDiaryScreen() {
  const { colors } = useTheme();
  const today = useDailyTotals();

  const week = [...mealHistory].reverse().map((d) => ({
    label: d.date.slice(0, 3),
    value: d.kcal,
  }));
  week.push({ label: 'Fri', value: Math.round(today.kcal) });

  const avgProtein = Math.round(
    mealHistory.reduce((s, d) => s + d.protein, 0) / mealHistory.length
  );
  const avgKcal = Math.round(
    mealHistory.reduce((s, d) => s + d.kcal, 0) / mealHistory.length
  );

  return (
    <Screen title="Meal diary">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Calories 7-day BarChart */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Calories · 7 days</Text>
            <Text style={[styles.goalText, { color: colors.muted }]}>
              Goal {nutritionGoals.kcal.toLocaleString()}
            </Text>
          </View>

          <View style={styles.chartWrapper}>
            <BarChart
              data={week}
              goal={nutritionGoals.kcal}
              height={140}
              barColor={colors.ink}
              formatValue={(v) => `${v.toLocaleString()} kcal`}
            />
          </View>

          <Text style={[styles.chartFootnote, { color: colors.muted }]}>
            Weekend days ran ~590 kcal above weekdays. Sunday was the highest at 2,860.
          </Text>
        </View>

        {/* Avg stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Avg calories</Text>
            <Text style={[styles.statValue, { color: colors.ink }]}>{avgKcal.toLocaleString()}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Avg protein</Text>
            <Text style={[styles.statValue, { color: colors.ink }]}>
              {avgProtein}
              <Text style={{ fontSize: 13, color: colors.muted }}> / {nutritionGoals.protein} g</Text>
            </Text>
            <ProgressBar
              value={avgProtein}
              max={nutritionGoals.protein}
              color={colors.move}
              trackColor={colors.surface2}
              style={{ marginTop: 8, height: 6 }}
            />
          </View>
        </View>

        {/* History Section */}
        <View style={styles.historySection}>
          <Text style={[styles.historyTitle, { color: colors.ink }]}>History</Text>

          <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {/* Today */}
            <View style={[styles.historyRow, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.rowDate, { color: colors.ink }]}>Today</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>In progress</Text>
              </View>
              <Text style={[styles.rowNumbers, { color: colors.ink }]}>
                {Math.round(today.kcal)} kcal · {Math.round(today.protein)} g
              </Text>
            </View>

            {/* Past days */}
            {mealHistory.map((d, idx) => (
              <View
                key={d.date}
                style={[
                  styles.historyRow,
                  { borderBottomColor: colors.line },
                  idx === mealHistory.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View>
                  <Text style={[styles.rowDate, { color: colors.ink }]}>{d.date}</Text>
                  <Text style={[styles.rowSub, { color: colors.muted }]}>{d.meals} meals</Text>
                </View>
                <Text
                  style={[
                    styles.rowNumbers,
                    { color: d.kcal > nutritionGoals.kcal ? colors.warn : colors.ink },
                  ]}
                >
                  {d.kcal.toLocaleString()} kcal · {d.protein} g
                </Text>
              </View>
            ))}
          </View>
        </View>
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
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalText: {
    fontSize: 12,
  },
  chartWrapper: {
    marginTop: 6,
  },
  chartFootnote: {
    fontSize: 13,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    justifyContent: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  historySection: {
    gap: 8,
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  historyCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  rowNumbers: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

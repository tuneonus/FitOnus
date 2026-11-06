import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Screen } from '@/shared/components/ui/Screen';
import { BarChart } from '@/shared/components/charts/BarChart';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { useTheme } from '@/hooks/use-theme';
import { useDailyTotals, useNutritionStore } from '../store/nutritionStore';
import { nutritionGoals } from '../constants/meals';
import { nutritionApi } from '../api/nutrition-api';
import type { NutritionAnalyticsView } from '../types/nutrition';
import { logger } from '@/utils/logger';

export function MealDiaryScreen() {
  const { colors } = useTheme();
  const today = useDailyTotals();
  const dailySummary = useNutritionStore((s) => s.dailySummary);

  const [analytics, setAnalytics] = useState<NutritionAnalyticsView | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const data = await nutritionApi.getNutritionAnalytics('week');
      setAnalytics(data);
    } catch (err: any) {
      logger.warn('Failed to load nutrition analytics for diary:', err?.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const calGoal = dailySummary?.targets?.calories ?? nutritionGoals.kcal;
  const proGoal = dailySummary?.targets?.proteinG ?? nutritionGoals.protein;

  const week =
    analytics?.caloriesTrend && analytics.caloriesTrend.length > 0
      ? analytics.caloriesTrend.map((d) => ({
          label: d.label,
          value: Math.round(d.value),
        }))
      : [];

  const avgProtein = analytics ? Math.round(analytics.avgProtein) : 0;
  const avgKcal = analytics ? Math.round(analytics.avgCalories) : 0;
  const pastDays = analytics?.caloriesTrend ? [...analytics.caloriesTrend].reverse() : [];

  return (
    <Screen title="Meal diary">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        {/* Calories 7-day BarChart */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Calories · 7 days</Text>
            <Text style={[styles.goalText, { color: colors.muted }]}>
              Goal {calGoal.toLocaleString()}
            </Text>
          </View>

          <View style={styles.chartWrapper}>
            <BarChart
              data={week}
              goal={calGoal}
              height={140}
              barColor={colors.ink}
              formatValue={(v) => `${v.toLocaleString()} kcal`}
            />
          </View>

          <Text style={[styles.chartFootnote, { color: colors.muted }]}>
            {analytics
              ? `Logged ${analytics.loggedDaysCount} of ${analytics.totalDaysInRange} days in this period.`
              : 'Log meals daily to see your calorie adherence trend.'}
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
              <Text style={{ fontSize: 13, color: colors.muted }}> / {proGoal} g</Text>
            </Text>
            <ProgressBar
              value={avgProtein}
              max={proGoal}
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
            {pastDays.length === 0 ? (
              <View style={[styles.historyRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.rowSub, { color: colors.muted, paddingVertical: 8 }]}>
                  No past meals logged in this period.
                </Text>
              </View>
            ) : (
              pastDays.map((d, idx) => (
                <View
                  key={d.date}
                  style={[
                    styles.historyRow,
                    { borderBottomColor: colors.line },
                    idx === pastDays.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View>
                    <Text style={[styles.rowDate, { color: colors.ink }]}>{d.label || d.date}</Text>
                    <Text style={[styles.rowSub, { color: colors.muted }]}>Logged day</Text>
                  </View>
                  <Text
                    style={[
                      styles.rowNumbers,
                      { color: d.value > calGoal ? colors.warn : colors.ink },
                    ]}
                  >
                    {Math.round(d.value).toLocaleString()} kcal
                  </Text>
                </View>
              ))
            )}
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
    gap: 16,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
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
    fontSize: 13,
  },
  chartWrapper: {
    paddingTop: 8,
  },
  chartFootnote: {
    fontSize: 12,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 20,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  rowNumbers: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

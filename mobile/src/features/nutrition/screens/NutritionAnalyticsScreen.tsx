import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { BarChart } from '@/shared/components/charts/BarChart';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useTheme } from '@/hooks/use-theme';
import { nutritionGoals } from '../constants/meals';
import { nutritionApi } from '../api/nutrition-api';
import type { NutritionAnalyticsView } from '../types/nutrition';
import { useAdvancedAnalyticsStore } from '@/features/analytics/store/advancedAnalyticsStore';
import { logger } from '@/utils/logger';

type Range = 'week' | 'month';

export function NutritionAnalyticsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [range, setRange] = useState<Range>('week');
  const [analytics, setAnalytics] = useState<NutritionAnalyticsView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { fetchNutrition: fetchAdvancedNutrition } = useAdvancedAnalyticsStore();

  const fetchAnalytics = async (r: Range) => {
    const advRange = r === 'week' ? '7d' : '30d';
    try {
      const [advResult, legacyResult] = await Promise.allSettled([
        fetchAdvancedNutrition(advRange),
        nutritionApi.getNutritionAnalytics(r),
      ]);

      const adv = advResult.status === 'fulfilled' ? advResult.value : null;
      const leg = legacyResult.status === 'fulfilled' ? legacyResult.value : null;

      if (adv) {
        setAnalytics({
          ...adv,
          avgCalories: adv.avgCalories,
          avgProtein:
            adv.macroSplit?.find((m) => m.label === 'Protein')?.grams ?? (leg as any)?.avgProtein ?? 0,
          targetCalories: adv.targetCalories ?? nutritionGoals.kcal,
          targetProtein: (leg as any)?.targetProtein ?? nutritionGoals.protein,
          loggedDaysCount: adv.dailyTrends.filter((d) => d.logged).length,
          totalDaysInRange: adv.dailyTrends.length,
          caloriesTrend: adv.dailyTrends.map((d) => ({ label: d.label, value: d.calories })),
          proteinTrend: adv.dailyTrends.map((d) => ({ label: d.label, value: d.protein })),
          topFoods: (leg as any)?.topFoods ?? [],
        } as any);
      } else if (leg) {
        setAnalytics(leg);
      }
    } catch (err: any) {
      logger.warn('Failed to fetch nutrition analytics:', err?.message);
    }
  };

  useEffect(() => {
    fetchAnalytics(range);
  }, [range]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics(range);
    setRefreshing(false);
  };

  const cal =
    analytics?.caloriesTrend && analytics.caloriesTrend.length > 0
      ? analytics.caloriesTrend.map((d) => ({ label: d.label, value: Math.round(d.value) }))
      : [];

  const pro =
    analytics?.proteinTrend && analytics.proteinTrend.length > 0
      ? analytics.proteinTrend.map((d) => ({ label: d.label, value: Math.round(d.value) }))
      : [];

  const splitData = analytics?.macroSplit ?? [];

  const topItems =
    analytics?.topFoods && analytics.topFoods.length > 0
      ? analytics.topFoods.map((t) => ({ name: t.foodName, count: t.count, kcal: Math.round(t.totalCalories) }))
      : [];

  const avgKcal = analytics ? Math.round(analytics.avgCalories) : 0;
  const avgPro = analytics ? Math.round(analytics.avgProtein) : 0;

  const targetKcal = analytics?.targetCalories ?? nutritionGoals.kcal;
  const targetProtein = analytics?.targetProtein ?? nutritionGoals.protein;
  const hasData = (analytics?.loggedDaysCount ?? 0) > 0;

  return (
    <Screen title="Nutrition analytics">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <SegmentedControl<Range>
          options={[
            { value: 'week', label: 'Last 7 days' },
            { value: 'month', label: 'Last 4 weeks' },
          ]}
          value={range}
          onChange={setRange}
        />

        {/* Calories Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Calories</Text>
            <Text style={[styles.cardSub, { color: colors.muted }]}>
              avg {avgKcal.toLocaleString()} · goal {targetKcal.toLocaleString()}
            </Text>
          </View>
          <View style={styles.chartWrapper}>
            <BarChart
              key={`c-${range}`}
              data={cal}
              goal={targetKcal}
              height={120}
              barColor={colors.ink}
              formatValue={(v) => `${v.toLocaleString()} kcal`}
            />
          </View>
          {range === 'week' && (
            <Text style={[styles.footnote, { color: colors.muted }]}>Today is still in progress.</Text>
          )}
        </View>

        {/* Protein Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Protein</Text>
            <Text style={[styles.cardSub, { color: colors.muted }]}>
              avg {avgPro} g · goal {targetProtein} g
            </Text>
          </View>
          <View style={styles.chartWrapper}>
            <BarChart
              key={`p-${range}`}
              data={pro}
              goal={targetProtein}
              height={110}
              barColor={colors.move}
              formatValue={(v) => `${v} g`}
            />
          </View>
        </View>

        {/* Macro Split Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Average macro split</Text>
          <View style={styles.splitTrack}>
            {splitData.map((m) => {
              const bg =
                m.label === 'Protein' ? colors.move : m.label === 'Carbs' ? '#38BDF8' : colors.warn;
              return <View key={m.label} style={{ width: `${m.pct}%`, height: '100%', backgroundColor: bg }} />;
            })}
          </View>
          <View style={styles.splitGrid}>
            {splitData.map((m) => {
              const dotBg =
                m.label === 'Protein' ? colors.move : m.label === 'Carbs' ? '#38BDF8' : colors.warn;
              return (
                <View key={m.label} style={styles.splitItem}>
                  <View style={styles.splitItemHeader}>
                    <View style={[styles.dot, { backgroundColor: dotBg }]} />
                    <Text style={[styles.splitLabel, { color: colors.muted }]}>{m.label}</Text>
                  </View>
                  <Text style={[styles.splitPct, { color: colors.ink }]}>{m.pct}%</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.footnote, { color: colors.muted }]}>
            Suggested for your goal: protein 25–30% of calories.
          </Text>
        </View>

        {/* Most Logged Section */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>Most logged · 30 days</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {topItems.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: 'center', padding: 16, fontSize: 13 }}>
                No food records found for this period.
              </Text>
            ) : (
              topItems.map((f, idx) => (
                <View
                  key={f.name}
                  style={[
                    styles.listRow,
                    { borderBottomColor: colors.line },
                    idx === topItems.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View>
                    <Text style={[styles.foodRowName, { color: colors.ink }]}>{f.name}</Text>
                    <Text style={[styles.foodRowSub, { color: colors.muted }]}>{f.count} times logged</Text>
                  </View>
                  <Text style={[styles.foodRowKcal, { color: colors.ink }]}>{f.kcal} kcal</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Logging Consistency */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>Logging consistency</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={[styles.consistencyRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.consistencyLabel, { color: colors.ink }]}>Logged days</Text>
              <Text style={[styles.consistencyValue, { color: colors.ink }]}>
                {analytics ? `${analytics.loggedDaysCount} / ${analytics.totalDaysInRange}` : '0 / 7'}{' '}
                <Text style={{ color: colors.muted }}>
                  (
                  {analytics && analytics.totalDaysInRange > 0
                    ? Math.round((analytics.loggedDaysCount / analytics.totalDaysInRange) * 100)
                    : 0}
                  %)
                </Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Coach Summary */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('coach', { q: 'How is my nutrition trending over the last month?' })}
          style={[styles.coachBanner, { backgroundColor: colors.surface2 }]}
        >
          <View style={styles.coachIconWrapper}>
            <Sparkles size={18} color={colors.accent} />
          </View>
          <View style={styles.coachTextCol}>
            <Text style={[styles.coachHeading, { color: colors.ink }]}>Coach review</Text>
            <Text style={[styles.coachBody, { color: colors.muted }]}>
              Protein consistency is up 18% this month. On track for your body composition goal.
            </Text>
          </View>
        </TouchableOpacity>
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSub: {
    fontSize: 12.5,
  },
  chartWrapper: {
    paddingTop: 8,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
  },
  splitTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 4,
  },
  splitGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  splitItem: {
    flex: 1,
    gap: 4,
  },
  splitItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  splitLabel: {
    fontSize: 12,
  },
  splitPct: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  foodRowName: {
    fontSize: 15,
    fontWeight: '500',
  },
  foodRowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  foodRowKcal: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  consistencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  consistencyLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  consistencyValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  consistencySub: {
    fontSize: 12,
  },
  coachBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 24,
  },
  coachIconWrapper: {
    marginTop: 2,
  },
  coachTextCol: {
    flex: 1,
    gap: 4,
  },
  coachHeading: {
    fontSize: 15,
    fontWeight: '600',
  },
  coachBody: {
    fontSize: 13.5,
    lineHeight: 18,
  },
});

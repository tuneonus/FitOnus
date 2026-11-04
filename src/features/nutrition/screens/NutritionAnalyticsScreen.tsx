import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { BarChart } from '@/shared/components/charts/BarChart';
import { useTheme } from '@/hooks/use-theme';
import { nutritionGoals } from '../constants/meals';
import {
  avgMacroSplit,
  loggedDays,
  loggingMethods,
  monthCalories,
  monthProtein,
  topFoods,
  weekCalories,
  weekProtein,
} from '../data/nutritionAnalyticsMock';

type Range = 'week' | 'month';

export function NutritionAnalyticsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [range, setRange] = useState<Range>('week');

  const cal = range === 'week' ? weekCalories : monthCalories;
  const pro = range === 'week' ? weekProtein : monthProtein;
  const avg = (arr: { value: number }[]) =>
    Math.round(arr.reduce((a, b) => a + b.value, 0) / arr.length);

  return (
    <Screen title="Nutrition analytics">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
              avg {avg(cal).toLocaleString()} · goal {nutritionGoals.kcal.toLocaleString()}
            </Text>
          </View>
          <View style={styles.chartWrapper}>
            <BarChart
              key={`c-${range}`}
              data={cal}
              goal={nutritionGoals.kcal}
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
              avg {avg(pro)} g · goal {nutritionGoals.protein} g
            </Text>
          </View>
          <View style={styles.chartWrapper}>
            <BarChart
              key={`p-${range}`}
              data={pro}
              goal={nutritionGoals.protein}
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
            {avgMacroSplit.map((m) => {
              const bg =
                m.label === 'Protein' ? colors.move : m.label === 'Carbs' ? '#38BDF8' : colors.warn;
              return <View key={m.label} style={{ width: `${m.pct}%`, height: '100%', backgroundColor: bg }} />;
            })}
          </View>
          <View style={styles.splitGrid}>
            {avgMacroSplit.map((m) => {
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
            {topFoods.map((f, idx) => (
              <View
                key={f.name}
                style={[
                  styles.listRow,
                  { borderBottomColor: colors.line },
                  idx === topFoods.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.foodName, { color: colors.ink }]}>{f.name}</Text>
                <Text style={[styles.foodFreq, { color: colors.muted }]}>
                  {f.times}× · {f.kcal.toLocaleString()} kcal
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Logging Habits Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Logging habits</Text>
          <Text style={[styles.habitsIntro, { color: colors.muted }]}>
            Logged {loggedDays.logged} of {loggedDays.total} days. Estimated (photo/voice/coach) entries: 40%.
          </Text>
          <View style={styles.methodsList}>
            {loggingMethods.map((m) => (
              <View key={m.label} style={styles.methodRow}>
                <Text style={[styles.methodLabel, { color: colors.ink }]}>{m.label}</Text>
                <View style={[styles.methodBarTrack, { backgroundColor: colors.surface2 }]}>
                  <View style={[styles.methodBarFill, { width: `${m.value}%`, backgroundColor: colors.ink }]} />
                </View>
                <Text style={[styles.methodVal, { color: colors.muted }]}>{m.value}%</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Coach Insight */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            navigate('coach', { q: 'Plan today’s meals with 160g protein under 2200 calories' })
          }
          style={[styles.coachCard, { backgroundColor: colors.surface2 }]}
        >
          <View style={{ marginTop: 2 }}>
            <Sparkles size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.coachHeading, { color: colors.ink }]}>
              Weekends drive your calorie surplus
            </Text>
            <Text style={[styles.coachBody, { color: colors.muted }]}>
              Saturday averaged 2,950 kcal vs 2,230 on weekdays. Protein is short on 6 of 7 days. Tap for a high-protein plan.
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
    padding: 18,
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
    fontVariant: ['tabular-nums'],
  },
  chartWrapper: {
    marginTop: 4,
  },
  footnote: {
    fontSize: 12,
  },
  splitTrack: {
    height: 12,
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 2,
  },
  splitGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  splitItem: {
    gap: 2,
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
    fontSize: 16,
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
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  foodName: {
    fontSize: 15,
  },
  foodFreq: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  habitsIntro: {
    fontSize: 13,
    lineHeight: 18,
  },
  methodsList: {
    gap: 10,
    marginTop: 4,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodLabel: {
    width: 76,
    fontSize: 13,
  },
  methodBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  methodBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  methodVal: {
    width: 36,
    textAlign: 'right',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
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
});

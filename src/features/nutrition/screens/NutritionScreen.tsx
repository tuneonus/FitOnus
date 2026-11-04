import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BookOpenText, BarChart3, Camera, ScanBarcode, Utensils, Plus, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Button } from '@/shared/components/ui/Button';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useTheme } from '@/hooks/use-theme';
import { useDailyTotals, useNutritionStore } from '../store/nutritionStore';
import { macroMeta, mealLabels, mealOrder, nutritionGoals } from '../constants/meals';
import { AddFoodSheet } from '../components/AddFoodSheet';
import { FoodItemSheet } from '../components/FoodItemSheet';
import type { FoodItem, MealEntry, MealType } from '../types/nutrition';

export function NutritionScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const entries = useNutritionStore((s) => s.entries);
  const totals = useDailyTotals();
  const [addMeal, setAddMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<{ entry: MealEntry; item: FoodItem } | null>(null);
  const remaining = nutritionGoals.kcal - totals.kcal;

  return (
    <Screen
      title="Nutrition"
      headerRight={
        <View style={styles.headerRight}>
          <IconButton icon={BookOpenText} label="Meal diary" onPress={() => navigate('mealDiary')} />
          <IconButton icon={BarChart3} label="Nutrition analytics" onPress={() => navigate('nutritionAnalytics')} />
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Calories Ring & Macros Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <ProgressRing
            size={112}
            strokeWidth={10}
            value={Math.min(1, Math.max(0, totals.kcal / nutritionGoals.kcal))}
            color={colors.ink}
            trackColor={colors.line}
          >
            <View style={styles.ringCenter}>
              <Text style={[styles.remainingKcal, { color: colors.ink }]}>
                {Math.abs(Math.round(remaining)).toLocaleString()}
              </Text>
              <Text style={[styles.remainingLabel, { color: colors.muted }]}>
                {remaining >= 0 ? 'kcal left' : 'kcal over'}
              </Text>
            </View>
          </ProgressRing>

          <View style={styles.macrosList}>
            {macroMeta.map((m) => {
              const val = totals[m.key];
              const goal = nutritionGoals[m.key];
              const barColor =
                m.key === 'protein'
                  ? colors.move
                  : m.key === 'carbs'
                  ? '#38BDF8'
                  : m.key === 'fat'
                  ? colors.warn
                  : colors.accent;

              return (
                <View key={m.key} style={styles.macroRow}>
                  <View style={styles.macroHeader}>
                    <Text style={[styles.macroLabel, { color: colors.muted }]}>{m.label}</Text>
                    <Text style={[styles.macroValue, { color: colors.ink }]}>
                      {Math.round(val)}
                      <Text style={{ color: colors.muted }}>/{goal}g</Text>
                    </Text>
                  </View>
                  <ProgressBar
                    value={Math.min(1, Math.max(0, val / goal))}
                    color={barColor}
                    trackColor={colors.surface2}
                    style={styles.progressBar}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <View style={styles.actionBtnWrapper}>
            <Button
              variant="secondary"
              icon={Camera}
              fullWidth
              onPress={() => navigate('mealPhoto', { meal: 'lunch' })}
            >
              Snap meal
            </Button>
          </View>
          <View style={styles.actionBtnWrapper}>
            <Button
              variant="secondary"
              icon={ScanBarcode}
              fullWidth
              onPress={() => navigate('barcodeScanner', { meal: 'snacks' })}
            >
              Scan barcode
            </Button>
          </View>
        </View>

        {/* Empty State */}
        {entries.length === 0 && (
          <EmptyState
            compact
            icon={Utensils}
            title="Nothing logged today"
            body="Snap a photo, scan a barcode or search — the coach uses this to plan your day."
            actionLabel="Log first meal"
            onAction={() => setAddMeal('breakfast')}
          />
        )}

        {/* Meal Sections */}
        {mealOrder.map((meal) => {
          const mealEntries = entries.filter((e) => e.meal === meal);
          const kcal = mealEntries.flatMap((e) => e.items).reduce((s, i) => s + i.kcal, 0);

          return (
            <View key={meal} style={styles.mealSection}>
              <View style={styles.mealSectionHeader}>
                <Text style={[styles.mealTitle, { color: colors.ink }]}>{mealLabels[meal]}</Text>
                {kcal > 0 && (
                  <Text style={[styles.mealKcal, { color: colors.muted }]}>{Math.round(kcal)} kcal</Text>
                )}
              </View>

              <View style={[styles.mealCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                {mealEntries.flatMap((entry) =>
                  entry.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.7}
                      onPress={() => setEditing({ entry, item })}
                      style={[styles.foodRow, { borderBottomColor: colors.line }]}
                    >
                      <View style={styles.foodInfo}>
                        <Text style={[styles.foodName, { color: colors.ink }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.foodDetails, { color: colors.muted }]}>
                          {item.serving} · {entry.time} ·{' '}
                          {entry.method === 'photo'
                            ? 'AI photo'
                            : entry.method === 'coach'
                            ? 'via Coach'
                            : entry.method}
                        </Text>
                      </View>
                      <View style={styles.foodKcalCol}>
                        <Text style={[styles.itemKcal, { color: colors.ink }]}>{Math.round(item.kcal)}</Text>
                        {item.estimated && (
                          <View style={[styles.estBadge, { borderColor: colors.muted }]}>
                            <Text style={[styles.estText, { color: colors.muted }]}>Est.</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setAddMeal(meal)}
                  style={styles.addFoodBtn}
                >
                  <Plus size={16} color={colors.ink} />
                  <Text style={[styles.addFoodText, { color: colors.ink }]}>Add food</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Coach Insight */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            navigate('coach', { q: 'Plan today’s meals with 160g protein under 2200 calories' })
          }
          style={[styles.coachBanner, { backgroundColor: colors.surface2 }]}
        >
          <View style={styles.coachIconWrapper}>
            <Sparkles size={18} color={colors.accent} />
          </View>
          <View style={styles.coachTextCol}>
            <Text style={[styles.coachHeading, { color: colors.ink }]}>
              You’re {Math.max(0, Math.round(nutritionGoals.protein - totals.protein))} g short on protein
            </Text>
            <Text style={[styles.coachBody, { color: colors.muted }]}>
              Paneer tikka bowl for lunch (46 g) and a whey shake post-workout (27 g) get you most of the way. Tap to plan the rest.
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <AddFoodSheet open={addMeal !== null} meal={addMeal ?? 'lunch'} onClose={() => setAddMeal(null)} />
      <FoodItemSheet target={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 20,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  remainingKcal: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  remainingLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  macrosList: {
    flex: 1,
    gap: 10,
  },
  macroRow: {
    gap: 4,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 12,
  },
  macroValue: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnWrapper: {
    flex: 1,
  },
  mealSection: {
    gap: 8,
  },
  mealSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  mealTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  mealKcal: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  mealCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  foodInfo: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '500',
  },
  foodDetails: {
    fontSize: 12,
  },
  foodKcalCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemKcal: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  estBadge: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  estText: {
    fontSize: 10,
  },
  addFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addFoodText: {
    fontSize: 14,
    fontWeight: '600',
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

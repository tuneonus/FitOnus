import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import {
  BookOpenText,
  BarChart3,
  Camera,
  ScanBarcode,
  Utensils,
  Plus,
  Sparkles,
  Droplets,
  CloudOff,
  RefreshCw,
} from 'lucide-react-native';
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
  const {
    entries,
    dailySummary,
    waterMl,
    isLoading,
    isRefreshing,
    pendingSyncCount,
    fetchDailyNutrition,
    logWater,
    syncPendingMutations,
    refreshPendingSyncCount,
  } = useNutritionStore();

  const totals = useDailyTotals();
  const [addMeal, setAddMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<{ entry: MealEntry; item: FoodItem } | null>(null);
  const [syncingOffline, setSyncingOffline] = useState(false);

  useEffect(() => {
    fetchDailyNutrition();
    refreshPendingSyncCount();
  }, [fetchDailyNutrition, refreshPendingSyncCount]);

  const targets = dailySummary?.targets;
  const currentGoals = {
    kcal: targets?.calories ?? nutritionGoals.kcal,
    protein: targets?.proteinG ?? nutritionGoals.protein,
    carbs: targets?.carbsG ?? nutritionGoals.carbs,
    fat: targets?.fatG ?? nutritionGoals.fat,
    fiber: nutritionGoals.fiber,
  };

  const waterGoal = targets?.waterMl ?? 2500;
  const remaining = currentGoals.kcal - totals.kcal;

  const handleManualSync = async () => {
    setSyncingOffline(true);
    try {
      await syncPendingMutations();
    } finally {
      setSyncingOffline(false);
    }
  };

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
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchDailyNutrition(undefined, true)}
            tintColor={colors.ink}
          />
        }
      >
        {/* Offline Pending Banner */}
        {pendingSyncCount > 0 && (
          <View style={[styles.offlineBanner, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
            <View style={styles.offlineBannerLeft}>
              <CloudOff size={16} color={colors.warn} />
              <Text style={[styles.offlineBannerText, { color: colors.ink }]}>
                {pendingSyncCount} item{pendingSyncCount > 1 ? 's' : ''} queued offline
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleManualSync}
              disabled={syncingOffline}
              style={[styles.syncBtn, { borderColor: colors.line }]}
            >
              <RefreshCw size={12} color={colors.ink} />
              <Text style={[styles.syncBtnText, { color: colors.ink }]}>
                {syncingOffline ? 'Syncing...' : 'Sync'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Calories Ring & Macros Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <ProgressRing
            size={112}
            strokeWidth={10}
            value={Math.min(1, Math.max(0, totals.kcal / currentGoals.kcal))}
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
              const goal = currentGoals[m.key];
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

        {/* Hydration Tracker Card */}
        <View style={[styles.hydrationCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.hydrationHeader}>
            <View style={styles.hydrationTitleRow}>
              <Droplets size={18} color="#38BDF8" />
              <Text style={[styles.hydrationTitle, { color: colors.ink }]}>Hydration</Text>
            </View>
            <Text style={[styles.hydrationValue, { color: colors.ink }]}>
              {(waterMl / 1000).toFixed(1)} L
              <Text style={{ color: colors.muted }}> / {(waterGoal / 1000).toFixed(1)} L</Text>
            </Text>
          </View>
          <ProgressBar
            value={Math.min(1, Math.max(0, waterMl / waterGoal))}
            color="#38BDF8"
            trackColor={colors.surface2}
            style={styles.progressBar}
          />
          <View style={styles.hydrationActions}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => logWater(250)}
              style={[styles.waterPill, { backgroundColor: colors.surface2, borderColor: colors.line }]}
            >
              <Plus size={14} color={colors.ink} />
              <Text style={[styles.waterPillText, { color: colors.ink }]}>250 ml</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => logWater(500)}
              style={[styles.waterPill, { backgroundColor: colors.surface2, borderColor: colors.line }]}
            >
              <Plus size={14} color={colors.ink} />
              <Text style={[styles.waterPillText, { color: colors.ink }]}>500 ml</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => logWater(750)}
              style={[styles.waterPill, { backgroundColor: colors.surface2, borderColor: colors.line }]}
            >
              <Plus size={14} color={colors.ink} />
              <Text style={[styles.waterPillText, { color: colors.ink }]}>750 ml</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Empty State */}
        {entries.length === 0 && !isLoading && (
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
          const kcal = mealEntries.flatMap((e) => e.items).reduce((s, i) => s + (i.kcal || 0), 0);

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
                        {entry.isSynced === false && (
                          <View style={[styles.offlineDot, { backgroundColor: colors.warn }]} />
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
              You’re {Math.max(0, Math.round(currentGoals.protein - totals.protein))} g short on protein
            </Text>
            <Text style={[styles.coachBody, { color: colors.muted }]}>
              Tap to get personal meal suggestions matching your targets.
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
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  offlineBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '600',
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
  hydrationCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  hydrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hydrationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hydrationTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  hydrationValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hydrationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  waterPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  waterPillText: {
    fontSize: 12,
    fontWeight: '600',
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
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
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

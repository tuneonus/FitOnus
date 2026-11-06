import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Star, CheckCircle2, Utensils } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Stepper } from '@/shared/components/ui/Stepper';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { barcodeProduct, foodDatabase } from '../data/foodsMock';
import { mealLabels, mealOrder, nutritionGoals } from '../constants/meals';
import { scaleFood, useDailyTotals, useNutritionStore } from '../store/nutritionStore';
import { nutritionApi } from '../api/nutrition-api';
import type { FoodItem, MealType } from '../types/nutrition';
import { logger } from '@/utils/logger';

export function FoodDetailScreen() {
  const { colors } = useTheme();
  const params = useRouteParams<{ id?: string; meal?: MealType; source?: string }>();
  const id = params.id;
  const mealParam = params.meal ?? 'lunch';
  const source = params.source;

  const { popTo } = useNavigation();
  const { logMeal, removeEntry, toggleFavorite, favorites, recentFoods } = useNutritionStore();
  const totals = useDailyTotals();

  // Try finding food in memory first
  const initialFood =
    favorites.find((f) => f.id === id) ||
    recentFoods.find((f) => f.id === id) ||
    foodDatabase.find((f) => f.id === id) ||
    null;

  const [food, setFood] = useState<FoodItem | null>(initialFood);
  const [loading, setLoading] = useState(!initialFood && !!id);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType);
  const [isFav, setIsFav] = useState(!!initialFood?.isFavorite);

  // Fetch full food specifications from backend if ID is provided
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);

    nutritionApi
      .getFoodById(id)
      .then((detailed) => {
        if (!cancelled && detailed) {
          setFood(detailed);
          setIsFav(!!detailed.isFavorite);
        }
      })
      .catch((err) => {
        logger.warn('Failed to fetch food details:', err?.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleToggleFavorite = async () => {
    if (!food) return;
    const next = !isFav;
    setIsFav(next);
    await toggleFavorite(food);
    showToast({
      message: next ? 'Added to favorites' : 'Removed from favorites',
    });
  };

  const add = async () => {
    if (!food) return;
    const scaledItem = scaleFood(food, servings);
    const entryId = await logMeal({
      mealType: meal,
      items: [{ ...scaledItem }],
      method: source === 'barcode' ? 'barcode' : 'search',
    });

    showToast({
      message: `${food.name} added to ${mealLabels[meal]}`,
      actionLabel: 'Undo',
      onAction: () => removeEntry(entryId),
    });

    popTo('nutrition');
  };

  if (!food) {
    return (
      <Screen title="Food details">
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <EmptyState
            icon={Utensils}
            title="Food not found"
            body="This food item is not available in the database."
            actionLabel="Return to search"
            onAction={() => popTo('nutrition')}
          />
        )}
      </Screen>
    );
  }

  const scaled = scaleFood(food, servings);

  const facts = [
    { label: 'Protein', value: scaled.protein, goal: nutritionGoals.protein },
    { label: 'Carbohydrates', value: scaled.carbs, goal: nutritionGoals.carbs },
    { label: 'Fat', value: scaled.fat, goal: nutritionGoals.fat },
    { label: 'Fiber', value: scaled.fiber, goal: nutritionGoals.fiber },
  ];

  return (
    <Screen
      title="Food details"
      headerRight={
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleToggleFavorite}
          style={styles.favBtn}
          accessibilityLabel="Favorite"
        >
          <Star size={20} color={isFav ? colors.warn : colors.muted} fill={isFav ? colors.warn : 'transparent'} />
        </TouchableOpacity>
      }
      footer={
        <Button size="lg" fullWidth onPress={add} disabled={loading}>
          Add {scaled.kcal} kcal to {mealLabels[meal]}
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="small" color={colors.muted} style={{ marginVertical: 8 }} />}

        <View style={styles.headerBlock}>
          <View style={styles.badgeRow}>
            {food.brand ? <Text style={[styles.brandText, { color: colors.muted }]}>{food.brand}</Text> : null}
            {food.isVerified && (
              <View style={[styles.verifiedPill, { backgroundColor: colors.surface2 }]}>
                <CheckCircle2 size={12} color={colors.accent} />
                <Text style={[styles.verifiedText, { color: colors.ink }]}>USDA Verified</Text>
              </View>
            )}
            {food.isCustom && (
              <View style={[styles.verifiedPill, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.verifiedText, { color: colors.muted }]}>Custom</Text>
              </View>
            )}
          </View>
          <Text style={[styles.foodName, { color: colors.ink }]}>{food.name}</Text>
          <Text style={[styles.servingText, { color: colors.muted }]}>
            Per {food.serving}
            {food.estimated ? ' · typical portion (estimate)' : ''}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Stepper
            label="Servings"
            value={servings}
            onChange={setServings}
            step={0.5}
            min={0.5}
            max={6}
            decimals={1}
            unit={servings === 1 ? (food.servingUnit || 'serving') : `${food.servingUnit || 'serving'}s`}
          />
        </View>

        <View style={styles.segmentWrapper}>
          <SegmentedControl
            options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))}
            value={meal}
            onChange={(val) => setMeal(val as MealType)}
          />
        </View>

        <View style={styles.factsSection}>
          <View style={[styles.calRow, { borderBottomColor: colors.line }]}>
            <Text style={[styles.calLabel, { color: colors.ink }]}>Calories</Text>
            <Text style={[styles.calVal, { color: colors.ink }]}>{scaled.kcal}</Text>
          </View>

          <View style={styles.macroList}>
            {facts.map((f, idx) => (
              <View
                key={f.label}
                style={[
                  styles.macroRow,
                  { borderBottomColor: colors.line },
                  idx === facts.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.factLabel, { color: colors.ink }]}>{f.label}</Text>
                <View style={styles.factValRow}>
                  <Text style={[styles.factVal, { color: colors.ink }]}>{f.value} g</Text>
                  <Text style={[styles.factPct, { color: colors.muted }]}>
                    {Math.round((f.value / f.goal) * 100)}% of goal
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.infoBox, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              After this you’ll have{' '}
              <Text style={{ fontWeight: '700', color: colors.ink }}>
                {Math.round(nutritionGoals.kcal - totals.kcal - scaled.kcal)}
              </Text>{' '}
              kcal left today.
            </Text>
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
  favBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBlock: {
    gap: 4,
    paddingTop: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    fontSize: 13,
    fontWeight: '500',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  foodName: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  servingText: {
    fontSize: 13,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  segmentWrapper: {
    marginTop: 4,
  },
  factsSection: {
    marginTop: 8,
    gap: 12,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  calLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  calVal: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  macroList: {
    gap: 0,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  factLabel: {
    fontSize: 15,
  },
  factValRow: {
    alignItems: 'flex-end',
    gap: 2,
  },
  factVal: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  factPct: {
    fontSize: 11,
  },
  infoBox: {
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

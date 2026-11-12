import { premium } from '@/shared/theme/premium';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Star, CheckCircle2, Utensils } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { FeatureScreen as Screen } from '@/shared/components/ui/FeatureScreen';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Stepper } from '@/shared/components/ui/Stepper';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { mealLabels, mealOrder } from '../constants/meals';
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
  const { logMeal, removeEntry, toggleFavorite, favorites, recentFoods, dailySummary } =
    useNutritionStore();
  const selectedDate = useNutritionStore((state) => state.selectedDate);
  const targets = dailySummary?.date === selectedDate ? dailySummary.targets : null;

  // Try finding food in memory first
  const initialFood =
    favorites.find((f) => f.id === id) || recentFoods.find((f) => f.id === id) || null;

  const [fetchError, setFetchError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
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
    setFetchError(false);

    nutritionApi
      .getFoodById(id)
      .then((detailed) => {
        if (!cancelled && detailed) {
          setFood(detailed);
          setIsFav(!!detailed.isFavorite);
        }
      })
      .catch((err) => {
        if (!cancelled) setFetchError(true);
        logger.warn('Failed to fetch food details:', err?.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, retry]);

  const handleToggleFavorite = async () => {
    if (!food) return;
    const next = await toggleFavorite({ ...food, isFavorite: isFav });
    setIsFav(next);
    showToast({ message: next ? 'Added to favorites' : 'Removed from favorites' });
  };

  const add = async () => {
    if (!food || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const scaledItem = scaleFood(food, servings);
      const entryId = await logMeal({
        mealType: meal,
        items: [{ ...scaledItem }],
        method: source === 'barcode' ? 'barcode' : 'search',
      });

      showToast({
        message: `${food.name} added to ${mealLabels[meal]}`,
      });

      popTo('nutrition');
    } catch {
      showToast({ tone: 'error', message: 'Couldn’t save this food. Please try again.' });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  if (!food) {
    return (
      <Screen title="Food details">
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <ActivityIndicator size="large" color={colors.accentStrong} />
          </View>
        ) : (
          <EmptyState
            appearance="premium"
            icon={Utensils}
            title="Food not found"
            body={
              fetchError
                ? 'Check your connection and try loading this food again.'
                : 'This food item is not available in the database.'
            }
            actionLabel={fetchError ? 'Retry' : 'Return to nutrition'}
            onAction={() => (fetchError ? setRetry((value) => value + 1) : popTo('nutrition'))}
          />
        )}
      </Screen>
    );
  }

  const scaled = scaleFood(food, servings);

  const facts = [
    { label: 'Protein', value: scaled.protein, goal: targets?.proteinG ?? null },
    { label: 'Carbohydrates', value: scaled.carbs, goal: targets?.carbsG ?? null },
    { label: 'Fat', value: scaled.fat, goal: targets?.fatG ?? null },
    { label: 'Fiber', value: scaled.fiber, goal: null },
  ];

  return (
    <Screen
      title="Food details"
      headerRight={
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleToggleFavorite}
          style={styles.favBtn}
          accessibilityRole="button"
          accessibilityLabel={isFav ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: isFav }}
        >
          <Star
            size={20}
            color={isFav ? colors.warn : colors.muted}
            fill={isFav ? colors.warn : 'transparent'}
          />
        </TouchableOpacity>
      }
      footer={
        <Button
          appearance="premium"
          size="lg"
          fullWidth
          onPress={add}
          disabled={loading || saving}
          loading={saving}
        >
          Add {scaled.kcal} kcal to {mealLabels[meal]}
        </Button>
      }
      contentContainerStyle={styles.container}
    >
      {fetchError && (
        <StatusBanner
          tone="warning"
          title="Using saved food details"
          body="Couldn’t refresh this item. Review the saved values before logging."
          actionLabel="Retry"
          onAction={() => setRetry((value) => value + 1)}
        />
      )}
      {loading && (
        <ActivityIndicator size="small" color={colors.muted} style={{ marginVertical: 8 }} />
      )}

      <View style={styles.headerBlock}>
        <View style={styles.badgeRow}>
          {food.brand ? (
            <Text style={[styles.brandText, { color: colors.muted }]}>{food.brand}</Text>
          ) : null}
          {food.isVerified && (
            <View style={[styles.verifiedPill, { backgroundColor: colors.surface2 }]}>
              <CheckCircle2 size={12} color={colors.accentStrong} />
              <Text style={[styles.verifiedText, { color: colors.ink }]}>Verified food</Text>
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
          appearance="premium"
          label="Servings"
          value={servings}
          onChange={setServings}
          step={0.5}
          min={0.5}
          max={6}
          decimals={1}
          unit={
            servings === 1 ? food.servingUnit || 'serving' : `${food.servingUnit || 'serving'}s`
          }
        />
      </View>

      <View style={styles.segmentWrapper}>
        <SegmentedControl
          appearance="premium"
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
                  {f.goal && f.goal > 0
                    ? `${Math.round((f.value / f.goal) * 100)}% of goal`
                    : 'Goal unavailable'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.surface2 }]}>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            Nutrition values are for your selected portion. Review the serving and meal before
            logging.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  favBtn: {
    width: 48,
    minHeight: premium.layout.touch,
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
    ...premium.type.caption,
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
    ...premium.type.caption,
  },
  foodName: {
    ...premium.type.title,
  },
  servingText: {
    ...premium.type.caption,
  },
  card: {
    borderRadius: premium.radius.card,
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
    ...premium.type.label,
  },
  calVal: {
    ...premium.type.metric,
    fontVariant: ['tabular-nums'],
  },
  macroList: {
    gap: 0,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  factLabel: {
    ...premium.type.body,
  },
  factValRow: {
    alignItems: 'flex-end',
    gap: 2,
  },
  factVal: {
    ...premium.type.body,
    fontVariant: ['tabular-nums'],
  },
  factPct: {
    ...premium.type.caption,
  },
  infoBox: {
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
  },
  infoText: {
    ...premium.type.caption,
  },
});

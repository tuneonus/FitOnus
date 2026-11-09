import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Search, SearchX, Star, CheckCircle2 } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { FeatureScreen as Screen } from '@/shared/components/ui/FeatureScreen';
import { premium } from '@/shared/theme/premium';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { TextField } from '@/shared/components/ui/TextField';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi } from '../api/nutrition-api';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';
import { logger } from '@/utils/logger';

export function FoodSearchScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'lunch');

  const { recentFoods, favorites, fetchRecentFoods, fetchFavorites } = useNutritionStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    fetchRecentFoods();
    fetchFavorites();
  }, [fetchRecentFoods, fetchFavorites]);

  useEffect(() => {
    setError(null);
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const response = await nutritionApi.searchFoods({ q: query.trim() });
        if (!cancelled) {
          setResults(response.foods);
        }
      } catch (err: any) {
        logger.warn('Food search failed:', err?.message);
        if (!cancelled) {
          setError('Couldn’t search foods. Check your connection and try again.');
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, retry]);
  const defaultList = recentFoods.length > 0 ? recentFoods : favorites;
  const list = results !== null ? results : defaultList;
  const sectionLabel =
    results !== null
      ? `${results.length} results`
      : recentFoods.length
        ? 'Recent foods'
        : favorites.length
          ? 'Favorites'
          : 'Food catalog';

  return (
    <Screen title="Find your food" scrollable={false} keyboardAvoiding>
      <TextField
        appearance="premium"
        label="Search foods"
        hideLabel
        placeholder="Food, brand or dish"
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        trailing={
          loading ? (
            <ActivityIndicator
              accessibilityLabel="Searching foods"
              size="small"
              color={colors.accentStrong}
            />
          ) : (
            <Search size={20} color={colors.muted} />
          )
        }
      />
      <View style={styles.meal}>
        <SegmentedControl
          appearance="premium"
          label="Meal"
          options={mealOrder.map((value) => ({ value, label: mealLabels[value] }))}
          value={meal}
          onChange={setMeal}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <StatusBanner
            tone="error"
            title="Search unavailable"
            body={error}
            actionLabel="Retry"
            onAction={() => setRetry((value) => value + 1)}
          />
        ) : loading ? (
          <View
            accessibilityState={{ busy: true }}
            accessibilityLabel="Loading food results"
            style={styles.list}
          >
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={72} radius={premium.radius.control} />
            ))}
          </View>
        ) : (
          <>
            <Text
              accessibilityLiveRegion="polite"
              style={[premium.type.eyebrow, { color: colors.muted }]}
            >
              {sectionLabel}
            </Text>
            {!list.length ? (
              <EmptyState
                appearance="premium"
                icon={SearchX}
                title={query.trim() ? `No match for “${query}”` : 'Start with what you ate'}
                body="Search a food name or photograph your meal. You’ll review the serving before logging."
                actionLabel="Take a meal photo"
                onAction={() => navigate('mealPhoto', { meal })}
              />
            ) : (
              list.map((food, index) => (
                <TouchableOpacity
                  key={food.id || index}
                  accessibilityRole="button"
                  accessibilityLabel={`${food.name}, ${food.kcal} calories per ${food.serving}. Choose serving.`}
                  onPress={() => navigate('foodDetail', { id: food.id, meal })}
                  style={[styles.row, { borderColor: colors.line }]}
                >
                  <View style={styles.copy}>
                    <View style={styles.name}>
                      <Text style={[styles.foodName, { color: colors.ink }]}>{food.name}</Text>
                      {food.isVerified ? (
                        <CheckCircle2 size={16} color={colors.accentStrong} />
                      ) : null}
                      {food.isFavorite ? <Star size={16} color={colors.warn} /> : null}
                    </View>
                    <Text style={[premium.type.caption, { color: colors.muted }]}>
                      {food.brand ? `${food.brand} · ` : ''}
                      {food.serving}
                      {food.isCustom ? ' · Custom' : ''}
                    </Text>
                    <Text style={[premium.type.caption, { color: colors.muted }]}>
                      {food.protein} g protein
                    </Text>
                  </View>
                  <View style={styles.calories}>
                    <Text style={[premium.type.label, { color: colors.ink }]}>{food.kcal}</Text>
                    <Text style={[premium.type.caption, { color: colors.muted }]}>kcal</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  meal: { marginVertical: 16 },
  list: { gap: 12, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 88,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 6 },
  name: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  foodName: { ...premium.type.label, flexShrink: 1 },
  calories: { alignItems: 'flex-end', gap: 4 },
});

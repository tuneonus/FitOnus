import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Search, SearchX, Star, CheckCircle2 } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { TextField } from '@/shared/components/ui/TextField';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi } from '../api/nutrition-api';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';
import { logger } from '@/utils/logger';

export function FoodSearchScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const meal = params.meal ?? 'lunch';

  const { recentFoods, favorites, fetchRecentFoods, fetchFavorites } = useNutritionStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRecentFoods();
    fetchFavorites();
  }, [fetchRecentFoods, fetchFavorites]);

  useEffect(() => {
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
  }, [query]);

  // Determine fallback list when no active search query
  const defaultList = recentFoods.length > 0 ? recentFoods : favorites;
  const list = results !== null ? results : defaultList;
  const sectionLabel =
    results !== null
      ? `${results.length} result${results.length === 1 ? '' : 's'}`
      : recentFoods.length > 0
      ? 'Recent foods'
      : favorites.length > 0
      ? 'Favorites'
      : 'Catalog';

  return (
    <Screen title={`Add to ${mealLabels[meal]}`}>
      <View style={styles.searchContainer}>
        <TextField
          label="Search foods"
          hideLabel
          placeholder="Search verified & custom foods..."
          value={query}
          onChangeText={setQuery}
          autoFocus
          trailing={
            loading ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <Search size={18} color={colors.muted} />
            )
          }
        />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{sectionLabel}</Text>

      {results !== null && results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`No match for “${query}”`}
          body="Try a simpler name, or add it with custom calories."
          actionLabel="Snap a photo instead"
          onAction={() => navigate('mealPhoto', { meal })}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
          {list.map((f, idx) => (
            <TouchableOpacity
              key={f.id || idx.toString()}
              activeOpacity={0.7}
              onPress={() => navigate('foodDetail', { id: f.id, meal })}
              style={[
                styles.itemRow,
                { borderBottomColor: colors.line },
                idx === list.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={styles.itemInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.itemName, { color: colors.ink }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.isVerified && (
                    <CheckCircle2 size={13} color={colors.accent} style={{ marginLeft: 4 }} />
                  )}
                  {f.isFavorite && (
                    <Star size={12} color={colors.warn} fill={colors.warn} style={{ marginLeft: 4 }} />
                  )}
                </View>
                <Text style={[styles.itemSub, { color: colors.muted }]}>
                  {f.brand ? `${f.brand} · ` : ''}
                  {f.serving}
                  {f.isCustom ? ' · Custom' : ''}
                </Text>
              </View>
              <View style={styles.itemKcalCol}>
                <Text style={[styles.itemKcal, { color: colors.ink }]}>{f.kcal}</Text>
                <Text style={[styles.itemProtein, { color: colors.muted }]}>{f.protein} g protein</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
  },
  itemSub: {
    fontSize: 12.5,
  },
  itemKcalCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemKcal: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  itemProtein: {
    fontSize: 11,
  },
});

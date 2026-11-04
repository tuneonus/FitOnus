import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Search, SearchX } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { TextField } from '@/shared/components/ui/TextField';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useTheme } from '@/hooks/use-theme';
import { mockAiTools } from '../../ai-coach/services/mockAiTools';
import { foodDatabase, recentFoodIds } from '../data/foodsMock';
import { mealLabels } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';

export function FoodSearchScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const meal = params.meal ?? 'lunch';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await mockAiTools.searchFood({ query });
      if (!cancelled) {
        setResults(r);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const list = results ?? recentFoodIds.map((id) => foodDatabase.find((f) => f.id === id)!).filter(Boolean);

  return (
    <Screen title={`Add to ${mealLabels[meal]}`}>
      <View style={styles.searchContainer}>
        <TextField
          label="Search foods"
          hideLabel
          placeholder="Search foods, e.g. paneer"
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

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>
        {results ? `${results.length} results` : 'Recent'}
      </Text>

      {results && results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`No match for “${query}”`}
          body="Try a simpler name, or add it manually with your own calories."
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
                <Text style={[styles.itemName, { color: colors.ink }]} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={[styles.itemSub, { color: colors.muted }]}>
                  {f.brand ? `${f.brand} · ` : ''}
                  {f.serving}
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

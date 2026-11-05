import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { Stepper } from '@/shared/components/ui/Stepper';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { barcodeProduct, foodDatabase } from '../data/foodsMock';
import { mealLabels, mealOrder, nutritionGoals } from '../constants/meals';
import { scaleFood, useDailyTotals, useNutritionStore } from '../store/nutritionStore';
import type { MealType } from '../types/nutrition';

export function FoodDetailScreen() {
  const { colors } = useTheme();
  const params = useRouteParams<{ id?: string; meal?: MealType; source?: string }>();
  const id = params.id;
  const mealParam = params.meal ?? 'lunch';
  const source = params.source;

  const { popTo } = useNavigation();
  const { addEntry, removeEntry } = useNutritionStore();
  const totals = useDailyTotals();

  const food =
    id === barcodeProduct.id
      ? barcodeProduct
      : foodDatabase.find((f) => f.id === id) ?? foodDatabase[0]!;

  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType);
  const scaled = scaleFood(food, servings);

  const add = () => {
    const entryId = addEntry({
      meal,
      time: 'Just now',
      method: source === 'barcode' ? 'barcode' : 'search',
      items: [{ ...scaled, id: `i-${Date.now()}` }],
    });
    showToast({
      message: `${food.name} added to ${mealLabels[meal]}`,
      actionLabel: 'Undo',
      onAction: () => removeEntry(entryId),
    });
    popTo('nutrition');
  };

  const facts = [
    { label: 'Protein', value: scaled.protein, goal: nutritionGoals.protein },
    { label: 'Carbohydrates', value: scaled.carbs, goal: nutritionGoals.carbs },
    { label: 'Fat', value: scaled.fat, goal: nutritionGoals.fat },
    { label: 'Fiber', value: scaled.fiber, goal: nutritionGoals.fiber },
  ];

  return (
    <Screen
      title="Food details"
      footer={
        <Button size="lg" fullWidth onPress={add}>
          Add {scaled.kcal} kcal to {mealLabels[meal]}
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          {food.brand ? <Text style={[styles.brandText, { color: colors.muted }]}>{food.brand}</Text> : null}
          <Text style={[styles.foodName, { color: colors.ink }]}>{food.name}</Text>
          <Text style={[styles.servingText, { color: colors.muted }]}>
            Per {food.serving}
            {food.estimated ? ' · typical restaurant portion (estimate)' : ''}
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
            unit={servings === 1 ? 'serving' : 'servings'}
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
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 18,
  },
  headerBlock: {
    gap: 4,
  },
  brandText: {
    fontSize: 13,
  },
  foodName: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
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
    marginTop: 2,
  },
  factsSection: {
    gap: 8,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  calLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  calVal: {
    fontSize: 28,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  factVal: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  factPct: {
    fontSize: 12,
  },
  infoBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

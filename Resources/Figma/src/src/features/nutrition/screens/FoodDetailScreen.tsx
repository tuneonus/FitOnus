import React, { useState } from 'react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { showToast } from '../../../shared/stores/toastStore';
import { barcodeProduct, foodDatabase } from '../data/foodsMock';
import { mealLabels, mealOrder, nutritionGoals } from '../constants/meals';
import { scaleFood, useDailyTotals, useNutritionStore } from '../store/nutritionStore';
import type { MealType } from '../types/nutrition';

export function FoodDetailScreen() {
  const { id, meal: mealParam = 'lunch', source } = useRouteParams();
  const { popTo } = useNavigation();
  const { addEntry, removeEntry } = useNutritionStore();
  const totals = useDailyTotals();
  const food = id === barcodeProduct.id ? barcodeProduct : foodDatabase.find((f) => f.id === id) ?? foodDatabase[0];
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType);
  const scaled = scaleFood(food, servings);

  const add = () => {
    const entryId = addEntry({ meal, time: 'Just now', method: source === 'barcode' ? 'barcode' : 'search', items: [{ ...scaled, id: `i-${Date.now()}` }] });
    showToast({ message: `${food.name} added to ${mealLabels[meal]}`, actionLabel: 'Undo', onAction: () => removeEntry(entryId) });
    popTo('nutrition');
  };

  const facts = [
  { label: 'Protein', value: scaled.protein, goal: nutritionGoals.protein },
  { label: 'Carbohydrates', value: scaled.carbs, goal: nutritionGoals.carbs },
  { label: 'Fat', value: scaled.fat, goal: nutritionGoals.fat },
  { label: 'Fiber', value: scaled.fiber, goal: nutritionGoals.fiber }];


  return (
    <Screen title="Food details" footer={<Button size="lg" fullWidth onClick={add}>Add {scaled.kcal} kcal to {mealLabels[meal]}</Button>}>
      <div className="px-5">
        {food.brand && <p className="text-[13px] text-muted">{food.brand}</p>}
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">{food.name}</h1>
        <p className="text-[13px] text-muted">Per {food.serving}{food.estimated ? ' · typical restaurant portion (estimate)' : ''}</p>

        <div className="mt-6 rounded-3xl border border-line bg-surface p-5">
          <Stepper label="Servings" value={servings} onChange={setServings} step={0.5} min={0.5} max={6} decimals={1} unit={servings === 1 ? 'serving' : 'servings'} />
        </div>

        <div className="mt-4">
          <SegmentedControl label="Meal" options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))} value={meal} onChange={setMeal} />
        </div>

        <section className="mt-6" aria-label="Nutrition facts">
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <p className="text-[15px] font-semibold text-ink">Calories</p>
            <p className="font-mono text-[28px] font-semibold text-ink">{scaled.kcal}</p>
          </div>
          <dl className="divide-y divide-line">
            {facts.map((f) =>
            <div key={f.label} className="flex items-center justify-between py-3">
                <dt className="text-[15px] text-ink">{f.label}</dt>
                <dd className="text-right">
                  <span className="font-mono text-[15px] font-semibold text-ink">{f.value} g</span>
                  <span className="ml-2 text-[12px] text-muted">{Math.round(f.value / f.goal * 100)}% of goal</span>
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 rounded-2xl bg-surface2 p-3.5 text-[13px] text-muted">
            After this you’ll have <span className="font-mono font-semibold text-ink">{Math.round(nutritionGoals.kcal - totals.kcal - scaled.kcal)}</span> kcal left today.
          </p>
        </section>
      </div>
    </Screen>);

}
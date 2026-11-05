import React, { useState } from 'react';
import { BarChart3Icon, BookOpenTextIcon, CameraIcon, PlusIcon, ScanBarcodeIcon, SparklesIcon, UtensilsIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { Button } from '../../../shared/components/ui/Button';
import { useDailyTotals, useNutritionStore } from '../store/nutritionStore';
import { macroMeta, mealLabels, mealOrder, nutritionGoals } from '../constants/meals';
import { AddFoodSheet } from '../components/AddFoodSheet';
import { FoodItemSheet } from '../components/FoodItemSheet';
import type { FoodItem, MealEntry, MealType } from '../types/nutrition';

export function NutritionScreen() {
  const { navigate } = useNavigation();
  const entries = useNutritionStore((s) => s.entries);
  const totals = useDailyTotals();
  const [addMeal, setAddMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<{entry: MealEntry;item: FoodItem;} | null>(null);
  const remaining = nutritionGoals.kcal - totals.kcal;

  return (
    <Screen title="Nutrition" headerRight={
    <>
          <IconButton icon={BookOpenTextIcon} label="Meal diary" onClick={() => navigate('mealDiary')} />
          <IconButton icon={BarChart3Icon} label="Nutrition analytics" onClick={() => navigate('nutritionAnalytics')} />
        </>
    }>
      <div className="space-y-6 px-4">
        <section className="flex items-center gap-5 rounded-3xl border border-line bg-surface p-5" aria-label="Calories today">
          <ProgressRing size={112} stroke={10} value={totals.kcal / nutritionGoals.kcal} className="stroke-ink" label={`${Math.round(totals.kcal)} of ${nutritionGoals.kcal} kcal eaten`}>
            <span className="font-mono text-[24px] font-semibold tracking-[-0.03em] text-ink">{Math.abs(Math.round(remaining)).toLocaleString()}</span>
            <span className="text-[11px] text-muted">{remaining >= 0 ? 'kcal left' : 'kcal over'}</span>
          </ProgressRing>
          <dl className="flex-1 space-y-2.5">
            {macroMeta.map((m) =>
            <div key={m.key}>
                <div className="flex justify-between text-[12px]">
                  <dt className="text-muted">{m.label}</dt>
                  <dd className="font-mono text-ink">{Math.round(totals[m.key])}<span className="text-muted">/{nutritionGoals[m.key]}g</span></dd>
                </div>
                <ProgressBar value={totals[m.key]} max={nutritionGoals[m.key]} label={m.label} barClassName={m.barClass} className="mt-1 h-1.5" />
              </div>
            )}
          </dl>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={CameraIcon} onClick={() => navigate('mealPhoto', { meal: 'lunch' })}>Snap meal</Button>
          <Button variant="secondary" icon={ScanBarcodeIcon} onClick={() => navigate('barcodeScanner', { meal: 'snacks' })}>Scan barcode</Button>
        </div>

        {entries.length === 0 &&
        <EmptyState compact icon={UtensilsIcon} title="Nothing logged today" body="Snap a photo, scan a barcode or search — the coach uses this to plan your day." actionLabel="Log first meal" onAction={() => setAddMeal('breakfast')} />
        }

        {mealOrder.map((meal) => {
          const mealEntries = entries.filter((e) => e.meal === meal);
          const kcal = mealEntries.flatMap((e) => e.items).reduce((s, i) => s + i.kcal, 0);
          return (
            <section key={meal} aria-labelledby={`meal-${meal}`}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 id={`meal-${meal}`} className="text-[17px] font-semibold text-ink">{mealLabels[meal]}</h2>
                <span className="font-mono text-[13px] text-muted">{kcal ? `${Math.round(kcal)} kcal` : ''}</span>
              </div>
              <div className="overflow-hidden rounded-3xl border border-line bg-surface">
                {mealEntries.flatMap((entry) =>
                entry.items.map((item) =>
                <button key={item.id} type="button" onClick={() => setEditing({ entry, item })} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-surface2/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink">{item.name}</span>
                        <span className="block text-[12px] text-muted">
                          {item.serving} · {entry.time} · {entry.method === 'photo' ? 'AI photo' : entry.method === 'coach' ? 'via Coach' : entry.method}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-[14px] font-semibold text-ink">{Math.round(item.kcal)}</span>
                        {item.estimated && <span className="rounded border border-dashed border-muted px-1 text-[10px] text-muted">Est.</span>}
                      </span>
                    </button>
                )
                )}
                <button type="button" onClick={() => setAddMeal(meal)} className="flex w-full items-center gap-2 px-4 py-3.5 text-[14px] font-semibold text-ink hover:bg-surface2/60">
                  <PlusIcon size={16} aria-hidden="true" /> Add food
                </button>
              </div>
            </section>);

        })}

        <button
          type="button"
          onClick={() => navigate('coach', { q: 'Plan today’s meals with 160g protein under 2200 calories' })}
          className="flex w-full gap-3 rounded-3xl bg-hero p-5 text-left text-heroInk">
          
          <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <span className="block text-[15px] font-semibold">You’re {Math.max(0, Math.round(nutritionGoals.protein - totals.protein))} g short on protein</span>
            <span className="mt-1 block text-[13.5px] leading-snug text-heroMuted">Paneer tikka bowl for lunch (46 g) and a whey shake post-workout (27 g) get you most of the way. Tap to plan the rest.</span>
          </span>
        </button>
      </div>

      <AddFoodSheet open={addMeal !== null} meal={addMeal ?? 'lunch'} onClose={() => setAddMeal(null)} />
      <FoodItemSheet target={editing} onClose={() => setEditing(null)} />
    </Screen>);

}
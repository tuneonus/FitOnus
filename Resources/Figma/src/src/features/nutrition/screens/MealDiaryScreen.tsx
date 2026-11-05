import React from 'react';
import { Screen } from '../../../shared/components/ui/Screen';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { useDailyTotals } from '../store/nutritionStore';
import { mealHistory } from '../data/foodsMock';
import { nutritionGoals } from '../constants/meals';

export function MealDiaryScreen() {
  const today = useDailyTotals();
  const week = [...mealHistory].reverse().map((d) => ({ label: d.date.slice(0, 3), value: d.kcal }));
  week.push({ label: 'Fri', value: Math.round(today.kcal) });
  const avgProtein = Math.round(mealHistory.reduce((s, d) => s + d.protein, 0) / mealHistory.length);
  const avgKcal = Math.round(mealHistory.reduce((s, d) => s + d.kcal, 0) / mealHistory.length);

  return (
    <Screen title="Meal diary">
      <div className="space-y-6 px-4">
        <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Calories this week">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Calories · 7 days</h2>
            <p className="text-[12px] text-muted">Goal {nutritionGoals.kcal.toLocaleString()}</p>
          </div>
          <div className="mt-3">
            <BarChart data={week} goal={nutritionGoals.kcal} ariaLabel="Daily calories for the last 7 days" formatValue={(v) => `${v.toLocaleString()} kcal`} height={120} />
          </div>
          <p className="mt-3 text-[13px] leading-snug text-muted">Weekend days ran ~590 kcal above weekdays. Sunday was the highest at 2,860.</p>
        </section>

        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-3xl border border-line bg-surface p-4">
            <dt className="text-[12px] text-muted">Avg calories</dt>
            <dd className="mt-1 font-mono text-[24px] font-semibold text-ink">{avgKcal.toLocaleString()}</dd>
          </div>
          <div className="rounded-3xl border border-line bg-surface p-4">
            <dt className="text-[12px] text-muted">Avg protein</dt>
            <dd className="mt-1 font-mono text-[24px] font-semibold text-ink">{avgProtein}<span className="text-[13px] text-muted"> / {nutritionGoals.protein} g</span></dd>
            <ProgressBar value={avgProtein} max={nutritionGoals.protein} label="Average protein" barClassName="bg-move" className="mt-2 h-1.5" />
          </div>
        </dl>

        <section aria-labelledby="history-title">
          <h2 id="history-title" className="mb-2 px-1 text-[17px] font-semibold text-ink">History</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            <li className="flex items-center justify-between px-4 py-3.5">
              <div><p className="text-[15px] font-medium text-ink">Today</p><p className="text-[12.5px] text-muted">In progress</p></div>
              <p className="font-mono text-[14px] text-ink">{Math.round(today.kcal)} kcal · {Math.round(today.protein)} g</p>
            </li>
            {mealHistory.map((d) =>
            <li key={d.date} className="flex items-center justify-between px-4 py-3.5">
                <div><p className="text-[15px] font-medium text-ink">{d.date}</p><p className="text-[12.5px] text-muted">{d.meals} meals</p></div>
                <p className={`font-mono text-[14px] ${d.kcal > nutritionGoals.kcal ? 'text-warn' : 'text-ink'}`}>{d.kcal.toLocaleString()} kcal · {d.protein} g</p>
              </li>
            )}
          </ul>
        </section>
      </div>
    </Screen>);

}
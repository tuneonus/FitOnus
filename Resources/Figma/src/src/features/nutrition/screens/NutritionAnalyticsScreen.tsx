import React, { useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { nutritionGoals } from '../constants/meals';
import { avgMacroSplit, loggedDays, loggingMethods, monthCalories, monthProtein, topFoods, weekCalories, weekProtein } from '../data/nutritionAnalyticsMock';

type Range = 'week' | 'month';

export function NutritionAnalyticsScreen() {
  const { navigate } = useNavigation();
  const [range, setRange] = useState<Range>('week');
  const cal = range === 'week' ? weekCalories : monthCalories;
  const pro = range === 'week' ? weekProtein : monthProtein;
  const avg = (arr: {value: number;}[]) => Math.round(arr.reduce((a, b) => a + b.value, 0) / arr.length);

  return (
    <Screen title="Nutrition analytics">
      <div className="px-4">
        <SegmentedControl<Range> label="Range" options={[{ value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 4 weeks' }]} value={range} onChange={setRange} />
      </div>

      <section className="mx-4 mt-4 rounded-3xl border border-line bg-surface p-4" aria-label="Calories">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-semibold text-ink">Calories</h2>
          <p className="font-mono text-[13px] text-muted">avg {avg(cal).toLocaleString()} · goal {nutritionGoals.kcal.toLocaleString()}</p>
        </div>
        <div className="mt-3"><BarChart key={`c-${range}`} data={cal} goal={nutritionGoals.kcal} ariaLabel="Calories" formatValue={(v) => `${v.toLocaleString()} kcal`} height={120} /></div>
        {range === 'week' && <p className="mt-2 px-1 text-[12px] text-muted">Today is still in progress.</p>}
      </section>

      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-4" aria-label="Protein">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-semibold text-ink">Protein</h2>
          <p className="font-mono text-[13px] text-muted">avg {avg(pro)} g · goal {nutritionGoals.protein} g</p>
        </div>
        <div className="mt-3"><BarChart key={`p-${range}`} data={pro} goal={nutritionGoals.protein} ariaLabel="Protein" formatValue={(v) => `${v} g`} barClassName="bg-move" mutedBarClassName="bg-move/30" height={110} /></div>
      </section>

      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-5" aria-labelledby="split">
        <h2 id="split" className="text-[15px] font-semibold text-ink">Average macro split</h2>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={avgMacroSplit.map((m) => `${m.label} ${m.pct}%`).join(', ')}>
          {avgMacroSplit.map((m) => <span key={m.label} className={m.cls} style={{ width: `${m.pct}%` }} />)}
        </div>
        <dl className="mt-3 grid grid-cols-3">
          {avgMacroSplit.map((m) =>
          <div key={m.label}><dt className="flex items-center gap-1.5 text-[12px] text-muted"><span className={`h-2 w-2 rounded-full ${m.cls}`} />{m.label}</dt><dd className="font-mono text-[16px] font-semibold text-ink">{m.pct}%</dd></div>
          )}
        </dl>
        <p className="mt-2 text-[12px] text-muted">Suggested for your goal: protein 25–30% of calories.</p>
      </section>

      <section className="mt-6 px-4" aria-labelledby="top">
        <h2 id="top" className="mb-2 px-1 text-[17px] font-semibold text-ink">Most logged · 30 days</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {topFoods.map((f) =>
          <li key={f.name} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-[15px] text-ink">{f.name}</span>
              <span className="font-mono text-[12.5px] text-muted">{f.times}× · {f.kcal.toLocaleString()} kcal</span>
            </li>
          )}
        </ul>
      </section>

      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-5" aria-labelledby="habits">
        <h2 id="habits" className="text-[15px] font-semibold text-ink">Logging habits</h2>
        <p className="mt-1 text-[13px] text-muted">Logged {loggedDays.logged} of {loggedDays.total} days. Estimated (photo/voice/coach) entries: 40%.</p>
        <ul className="mt-3 space-y-2">
          {loggingMethods.map((m) =>
          <li key={m.label} className="grid grid-cols-[84px_1fr_36px] items-center gap-3">
              <span className="text-[13px] text-ink">{m.label}</span>
              <span className="h-1.5 rounded-full bg-ink/[0.07]"><span className="block h-full rounded-full bg-ink" style={{ width: `${m.value}%` }} /></span>
              <span className="text-right font-mono text-[12px] text-muted">{m.value}%</span>
            </li>
          )}
        </ul>
      </section>

      <button type="button" onClick={() => navigate('coach', { q: 'Plan today’s meals with 160g protein under 2200 calories' })} className="mx-4 mt-3 flex w-[calc(100%-2rem)] gap-3 rounded-3xl bg-hero p-5 text-left text-heroInk">
        <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="block text-[15px] font-semibold">Weekends drive your calorie surplus</span>
          <span className="mt-1 block text-[13.5px] leading-snug text-heroMuted">Saturday averaged 2,950 kcal vs 2,230 on weekdays. Protein is short on 6 of 7 days. Tap for a high-protein plan.</span>
        </span>
      </button>
    </Screen>);

}
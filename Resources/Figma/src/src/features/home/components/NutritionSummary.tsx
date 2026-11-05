import React from 'react';
import { PlusIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { useDailyTotals, useNutritionStore } from '../../nutrition/store/nutritionStore';
import { macroMeta, mealLabels, mealOrder, nutritionGoals } from '../../nutrition/constants/meals';

export function NutritionSummary() {
  const { navigate } = useNavigation();
  const totals = useDailyTotals();
  const entries = useNutritionStore((s) => s.entries);
  const remaining = nutritionGoals.kcal - totals.kcal;

  return (
    <section aria-labelledby="nutrition-title" className="px-4">
      <SectionHeader id="nutrition-title" title="Nutrition" action="Open" onAction={() => navigate('nutrition')} />
      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[12px] text-muted">{remaining >= 0 ? 'Remaining today' : 'Over goal'}</p>
            <p className="mt-1 text-ink">
              <span className="font-mono text-[34px] font-semibold leading-none tracking-[-0.03em]">
                {Math.abs(Math.round(remaining)).toLocaleString()}
              </span>
              <span className="ml-1 text-[14px] text-muted">kcal</span>
            </p>
          </div>
          <p className="text-right text-[12px] leading-snug text-muted">
            <span className="font-mono text-ink">{Math.round(totals.kcal).toLocaleString()}</span> eaten
            <br />
            of <span className="font-mono">{nutritionGoals.kcal.toLocaleString()}</span> goal
          </p>
        </div>
        <ProgressBar value={totals.kcal} max={nutritionGoals.kcal} label="Calories consumed" className="mt-4 h-2.5" />

        <dl className="mt-5 grid grid-cols-4 gap-3">
          {macroMeta.map((m) =>
          <div key={m.key}>
              <dt className="text-[12px] text-muted">{m.label}</dt>
              <dd className="mt-0.5 text-ink">
                <span className="font-mono text-[14px] font-semibold">{Math.round(totals[m.key])}</span>
                <span className="text-[11px] text-muted">/{nutritionGoals[m.key]}g</span>
              </dd>
              <ProgressBar value={totals[m.key]} max={nutritionGoals[m.key]} label={m.label} barClassName={m.barClass} className="mt-1.5 h-1" />
            </div>
          )}
        </dl>

        <ul className="mt-5 grid grid-cols-4 gap-2">
          {mealOrder.map((meal) => {
            const kcal = entries.filter((e) => e.meal === meal).flatMap((e) => e.items).reduce((s, i) => s + i.kcal, 0);
            return (
              <li key={meal}>
                <button
                  type="button"
                  onClick={() => kcal ? navigate('nutrition') : navigate('foodSearch', { meal })}
                  aria-label={kcal ? `${mealLabels[meal]}, ${kcal} kcal` : `Log ${mealLabels[meal]}`}
                  className={`flex h-[64px] w-full flex-col justify-between rounded-2xl p-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
                  kcal ? 'bg-surface2 hover:bg-ink/[0.09]' : 'border border-dashed border-line hover:border-ink/30'}`
                  }>
                  
                  <span className="text-[11.5px] text-muted">{mealLabels[meal]}</span>
                  {kcal ?
                  <span className="font-mono text-[14px] font-semibold text-ink">{Math.round(kcal)}</span> :

                  <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink">
                      <PlusIcon size={13} aria-hidden="true" /> Log
                    </span>
                  }
                </button>
              </li>);

          })}
        </ul>

        <button
          type="button"
          onClick={() => navigate('coach', { q: 'Plan today’s meals with 160g protein under 2200 calories' })}
          className="mt-4 flex w-full gap-2 border-t border-line pt-4 text-left text-[13px] leading-snug text-ink">
          
          <SparklesIcon size={15} className="mt-0.5 shrink-0 text-accentStrong" aria-hidden="true" />
          Aim for 40 g protein at lunch — a paneer tikka bowl fits your macros.
        </button>
      </div>
    </section>);

}
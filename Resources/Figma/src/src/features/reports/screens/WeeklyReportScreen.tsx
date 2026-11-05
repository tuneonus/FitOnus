import React, { useState } from 'react';
import { CheckIcon, CircleIcon, TrendingUpIcon, TrophyIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { showToast } from '../../../shared/stores/toastStore';
import { cn } from '../../../shared/utils/cn';
import { getWeeklyReport } from '../data/reportsMock';

export function WeeklyReportScreen() {
  const { period, id } = useRouteParams();
  const r = getWeeklyReport(id);
  const { navigate } = useNavigation();
  const [accepted, setAccepted] = useState<string[]>([]);

  return (
    <Screen title="Weekly report" footer={<Button size="lg" fullWidth onClick={() => navigate('coach', { q: 'Plan today’s meals with 160g protein under 2200 calories' })}>Discuss with coach</Button>}>
      <section className="mx-4 rounded-[28px] bg-hero p-6 text-heroInk">
        <p className="text-[12px] text-heroMuted">{period ?? r.period} · Generated {r.generated}</p>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{r.headline}</h1>
        <dl className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4 border-t border-heroInk/10 pt-4">
          {r.stats.map((s) =>
          <div key={s.label}>
              <dt className="text-[11.5px] text-heroMuted">{s.label}</dt>
              <dd className="font-mono text-[19px] font-semibold tracking-[-0.02em]">{s.value}<span className="text-[11px] font-normal text-heroMuted">{s.unit}</span></dd>
              <dd className={cn('text-[11px]', s.good ? 'text-accent' : 'text-heroMuted')}>{s.note}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mx-4 mt-5 rounded-3xl border border-line bg-surface p-5" aria-label="Daily calories">
        <h2 className="text-[15px] font-semibold text-ink">Calories vs goal</h2>
        <div className="mt-3"><BarChart data={r.calories} goal={2350} highlightIndex={6} ariaLabel="Daily calories" formatValue={(v) => `${v.toLocaleString()} kcal`} height={110} /></div>
      </section>

      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-5" aria-label="Workouts">
        <h2 className="text-[15px] font-semibold text-ink">Workouts · 5 of 5</h2>
        <ol className="mt-3 grid grid-cols-7 gap-1">
          {r.workouts.map((w) =>
          <li key={w.day} className="text-center">
              <span className={cn('mx-auto flex h-9 w-9 items-center justify-center rounded-full', w.title === 'Rest' ? 'bg-surface2 text-muted' : 'bg-accent text-accentInk')}>
                {w.title === 'Rest' ? <CircleIcon size={10} aria-hidden="true" /> : <CheckIcon size={15} strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className="mt-1 block text-[10.5px] text-muted">{w.day}</span>
              <span className="block truncate text-[10.5px] text-ink">{w.title}</span>
            </li>
          )}
        </ol>
      </section>

      <section className="mt-6 px-5" aria-labelledby="wins">
        <h2 id="wins" className="text-[17px] font-semibold text-ink">Achievements</h2>
        <ul className="mt-2 space-y-2">
          {r.achievements.map((a) => <li key={a} className="flex gap-2.5 text-[14.5px] text-ink"><TrophyIcon size={16} className="mt-0.5 shrink-0 text-accentStrong" aria-hidden="true" />{a}</li>)}
        </ul>
      </section>

      <section className="mt-6 px-5" aria-labelledby="improve">
        <h2 id="improve" className="text-[17px] font-semibold text-ink">Areas to improve</h2>
        <ul className="mt-2 space-y-2">
          {r.improvements.map((a) => <li key={a} className="flex gap-2.5 text-[14.5px] leading-snug text-ink"><TrendingUpIcon size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />{a}</li>)}
        </ul>
      </section>

      <section className="mx-4 mt-6 rounded-3xl border border-line bg-surface p-4" aria-labelledby="next">
        <h2 id="next" className="px-1 text-[15px] font-semibold text-ink">Goals for next week</h2>
        <ul className="mt-2">
          {r.nextGoals.map((g) => {
            const on = accepted.includes(g);
            return (
              <li key={g}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => {
                    setAccepted(on ? accepted.filter((x) => x !== g) : [...accepted, g]);
                    if (!on) showToast({ message: 'Added to this week’s focus' });
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left">
                  
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-ink bg-ink text-bg' : 'border-line')}>{on && <CheckIcon size={14} strokeWidth={3} aria-hidden="true" />}</span>
                  <span className="text-[14.5px] text-ink">{g}</span>
                </button>
              </li>);

          })}
        </ul>
      </section>
      <p className="mx-6 mt-4 text-[11.5px] text-muted">Generated from synced and logged data. Sleep and recovery come from Apple Watch; calories from your food logs (some estimated).</p>
    </Screen>);

}
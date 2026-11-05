import React, { useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { cn } from '../../../shared/utils/cn';
import { weeklyVolume } from '../data/workoutsMock';
import { benchE1rm, muscleSplit, sessionsPerWeek, workoutSummary as s } from '../data/workoutAnalyticsMock';

type View = 'frequency' | 'volume';

export function WorkoutAnalyticsScreen() {
  const { navigate } = useNavigation();
  const [view, setView] = useState<View>('frequency');

  return (
    <Screen title="Workout analytics">
      <section className="px-5" aria-label="Last 30 days">
        <p className="text-[13px] text-muted">Last 30 days</p>
        <p className="mt-0.5 font-mono text-[40px] font-semibold leading-none tracking-[-0.04em] text-ink">{s.sessions30d}<span className="ml-1.5 font-sans text-[15px] font-normal text-muted">sessions</span></p>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <div><dt className="text-[12px] text-muted">Avg length</dt><dd className="font-mono text-[16px] font-semibold text-ink">{s.avgDurationMin} min</dd></div>
          <div><dt className="text-[12px] text-muted">Volume</dt><dd className="font-mono text-[16px] font-semibold text-ink">{(s.totalVolumeKg / 1000).toFixed(1)} t</dd></div>
          <div><dt className="text-[12px] text-muted">New PRs</dt><dd className="font-mono text-[16px] font-semibold text-ink">{s.prs30d}</dd></div>
        </dl>
      </section>

      <section className="mx-4 mt-5 rounded-3xl border border-line bg-surface p-4" aria-label="Training trend">
        <SegmentedControl<View> label="Trend metric" options={[{ value: 'frequency', label: 'Sessions / week' }, { value: 'volume', label: 'Volume / week' }]} value={view} onChange={setView} />
        <div className="mt-4">
          {view === 'frequency' ?
          <BarChart key="f" data={sessionsPerWeek} goal={5} ariaLabel="Sessions per week" formatValue={(v) => `${v} sessions`} barClassName="bg-accentStrong" height={120} /> :

          <BarChart key="v" data={weeklyVolume} ariaLabel="Volume per week" formatValue={(v) => `${v.toLocaleString()} kg`} barClassName="bg-accentStrong" height={120} />
          }
        </div>
        <p className="mt-2 px-1 text-[12px] text-muted">{view === 'frequency' ? `Plan: 5 per week · ${Math.round(s.consistency * 100)}% adherence over 8 weeks` : 'Includes logged and Apple Watch strength sessions'}</p>
      </section>

      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-5" aria-labelledby="split">
        <h2 id="split" className="text-[15px] font-semibold text-ink">Weekly sets by muscle group</h2>
        <ul className="mt-3 space-y-2.5">
          {muscleSplit.map((m) => {
            const under = m.sets < m.target * 0.75;
            return (
              <li key={m.group} className="grid grid-cols-[76px_1fr_56px] items-center gap-3">
                <span className="text-[13px] text-ink">{m.group}</span>
                <span className="relative h-2 rounded-full bg-ink/[0.07]" role="img" aria-label={`${m.group}: ${m.sets} of ${m.target} target sets`}>
                  <span className={cn('absolute inset-y-0 left-0 rounded-full', under ? 'bg-warn' : 'bg-accentStrong')} style={{ width: `${Math.min(100, m.sets / 20 * 100)}%` }} />
                  <span className="absolute -top-1 h-4 w-px bg-ink/40" style={{ left: `${m.target / 20 * 100}%` }} />
                </span>
                <span className={cn('text-right font-mono text-[12.5px]', under ? 'text-warn' : 'text-muted')}>{m.sets}/{m.target}</span>
              </li>);

          })}
        </ul>
        <p className="mt-3 text-[12px] text-muted">Tick = recommended weekly sets for your goal.</p>
      </section>

      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-4" aria-label="Bench press strength">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-semibold text-ink">Bench press · estimated 1RM</h2>
          <button type="button" onClick={() => navigate('personalRecords')} className="text-[13px] font-medium text-muted hover:text-ink">All lifts</button>
        </div>
        <div className="mt-2"><LineChart points={benchE1rm} ariaLabel="Bench press estimated one-rep max" formatValue={(v) => `${v} kg`} height={130} /></div>
        <p className="mt-1 px-1 text-[12px] text-muted">Estimated from your best set each session (Epley formula) — not a tested max.</p>
      </section>

      <button type="button" onClick={() => navigate('coach', { q: 'Create a 45-minute fat-loss workout' })} className="mx-4 mt-3 flex w-[calc(100%-2rem)] gap-3 rounded-3xl bg-hero p-5 text-left text-heroInk">
        <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="block text-[15px] font-semibold">Core and legs are under-trained</span>
          <span className="mt-1 block text-[13.5px] leading-snug text-heroMuted">Core is at 4 of 8 sets. Adding a 10-minute finisher twice a week would close the gap. Tap to plan it.</span>
        </span>
      </button>
    </Screen>);

}
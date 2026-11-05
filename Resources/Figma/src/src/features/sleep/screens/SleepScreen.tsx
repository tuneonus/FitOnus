import React, { useState } from 'react';
import { MoonIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { formatMinutes, lastNightStages, sleepNights } from '../data/sleepMock';
import { Hypnogram } from '../components/Hypnogram';

export function SleepScreen() {
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const [view, setView] = useState<'night' | 'trends'>('night');
  const night = sleepNights[sleepNights.length - 1];
  const lightMin = night.minutes - night.deepMin - night.remMin - night.awakeMin;
  const avg = Math.round(sleepNights.slice(-7).reduce((s, n) => s + n.minutes, 0) / 7);
  const bedSpread = Math.max(...sleepNights.slice(-7).map((n) => n.bedOffset)) - Math.min(...sleepNights.slice(-7).map((n) => n.bedOffset));

  if (!hasDevice) {
    return (
      <Screen title="Sleep">
        <EmptyState icon={MoonIcon} title="No sleep data yet" body="Sleep duration and stages come from Apple Watch or a Health Connect device. Your phone alone can’t measure them, so we won’t estimate." actionLabel="Connect a device" onAction={() => navigate('healthIntegration')} />
      </Screen>);

  }

  const stages = [
  { label: 'Deep', min: night.deepMin, className: 'bg-sleep' },
  { label: 'REM', min: night.remMin, className: 'bg-sleep/60' },
  { label: 'Light', min: lightMin, className: 'bg-sleep/30' },
  { label: 'Awake', min: night.awakeMin, className: 'bg-warn' }];


  return (
    <Screen title="Sleep">
      <div className="px-4">
        <SegmentedControl label="Sleep view" options={[{ value: 'night', label: 'Last night' }, { value: 'trends', label: 'Trends' }]} value={view} onChange={setView} />
      </div>

      {view === 'night' ?
      <div className="mt-5 space-y-5 px-4">
          <section className="flex items-center gap-5 rounded-3xl border border-line bg-surface p-5" aria-label="Sleep summary">
            <ProgressRing size={104} stroke={9} value={night.score / 100} className="stroke-sleep" label={`Sleep score ${night.score}`}>
              <span className="font-mono text-[28px] font-semibold text-ink">{night.score}</span>
              <span className="text-[11px] text-muted">Score</span>
            </ProgressRing>
            <div>
              <p className="font-mono text-[26px] font-semibold tracking-[-0.03em] text-ink">{formatMinutes(night.minutes)}</p>
              <p className="text-[13px] text-muted">{night.bedtime} → {night.wake}</p>
              <p className="mt-1 text-[13px] font-medium text-good">+{formatMinutes(night.minutes - avg)} vs 7-day avg</p>
              <div className="mt-1.5"><SourceTag source={{ kind: 'synced', label: 'Apple Watch · 6:42 AM' }} /></div>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Sleep stages">
            <h2 className="text-[15px] font-semibold text-ink">Stages</h2>
            <div className="mt-3"><Hypnogram segments={lastNightStages} start={night.bedtime} end={night.wake} /></div>
            <dl className="mt-4 grid grid-cols-4 gap-2">
              {stages.map((s) =>
            <div key={s.label}>
                  <dt className="flex items-center gap-1.5 text-[12px] text-muted"><span className={`h-2 w-2 rounded-full ${s.className}`} />{s.label}</dt>
                  <dd className="font-mono text-[15px] font-semibold text-ink">{formatMinutes(s.min)}</dd>
                  <dd className="text-[11px] text-muted">{Math.round(s.min / night.minutes * 100)}%</dd>
                </div>
            )}
            </dl>
          </section>

          <button type="button" onClick={() => navigate('coach', { q: 'Why am I feeling tired today?' })} className="flex w-full gap-3 rounded-3xl bg-hero p-5 text-left text-heroInk">
            <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              <span className="block text-[15px] font-semibold">Your best night in 6 days</span>
              <span className="mt-1 block text-[13.5px] leading-snug text-heroMuted">Bedtime before 11 PM gave you 1h 32m of deep sleep — 18 min above your average. Repeating this tonight would help your Saturday leg session.</span>
            </span>
          </button>
        </div> :

      <div className="mt-5 space-y-5 px-4">
          <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Sleep duration">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Duration · 14 nights</h2>
              <p className="text-[12px] text-muted">Avg {formatMinutes(avg)}</p>
            </div>
            <div className="mt-3">
              <BarChart data={sleepNights.map((n) => ({ label: n.day, value: n.minutes }))} goal={450} ariaLabel="Sleep duration per night" formatValue={formatMinutes} barClassName="bg-sleep" mutedBarClassName="bg-sleep/25" height={110} />
            </div>
            <p className="mt-2 text-[12px] text-muted">Dashed line: 7h 30m target</p>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Sleep consistency">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Consistency</h2>
              <p className="text-[12px] text-muted">Bedtime spread {bedSpread} min</p>
            </div>
            <ul className="mt-3 space-y-1.5" aria-label="Bedtimes for the last 7 nights">
              {sleepNights.slice(-7).map((n) =>
            <li key={n.date} className="flex items-center gap-2">
                  <span className="w-12 text-[11.5px] text-muted">{n.date.replace('Oct ', 'O ').replace('Sep ', 'S ')}</span>
                  <div className="relative h-3 flex-1 rounded-full bg-ink/[0.05]">
                    <span className="absolute h-3 rounded-full bg-sleep/70" style={{ left: `${n.bedOffset / 180 * 100}%`, width: `${n.minutes / 600 * 100}%` }} />
                  </div>
                  <span className="w-16 text-right font-mono text-[11.5px] text-ink">{n.bedtime.replace(' PM', 'p').replace(' AM', 'a')}</span>
                </li>
            )}
            </ul>
            <p className="mt-3 text-[12.5px] text-muted">A spread under 30 min is ideal. Wednesday’s 12:12 AM bedtime is the outlier.</p>
          </section>

          <section aria-labelledby="sleep-history">
            <h2 id="sleep-history" className="mb-2 px-1 text-[17px] font-semibold text-ink">History</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {[...sleepNights].reverse().slice(0, 7).map((n) =>
            <li key={n.date} className="flex items-center justify-between px-4 py-3">
                  <div><p className="text-[15px] text-ink">{n.date}</p><p className="text-[12px] text-muted">Deep {formatMinutes(n.deepMin)} · REM {formatMinutes(n.remMin)}</p></div>
                  <p className="text-right"><span className="block font-mono text-[15px] font-semibold text-ink">{formatMinutes(n.minutes)}</span><span className="text-[11.5px] text-muted">Score {n.score}</span></p>
                </li>
            )}
            </ul>
          </section>
        </div>
      }
    </Screen>);

}
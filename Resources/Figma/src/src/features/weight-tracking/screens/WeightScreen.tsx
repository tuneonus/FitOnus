import React, { useState } from 'react';
import { ChevronRightIcon, PlusIcon, RulerIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { LineChart } from '../../../shared/components/charts/LineChart';
import type { TimeRange } from '../../../shared/types/health';
import { useWeightStore } from '../store/weightStore';
import { weightByMonth } from '../data/weightMock';
import { AddWeightSheet } from '../components/AddWeightSheet';

export function WeightScreen() {
  const { navigate } = useNavigation();
  const { entries, goalWeight, startWeight } = useWeightStore();
  const [range, setRange] = useState<TimeRange>('W');
  const [adding, setAdding] = useState(false);
  const latest = entries[entries.length - 1];
  const first = entries[0];

  const points =
  range === 'D' ?
  entries.slice(-7).map((e) => ({ label: e.date, value: e.value })) :
  range === 'W' ?
  entries.map((e) => ({ label: e.date, value: e.value })) :
  range === 'M' ?
  [...weightByMonth.slice(-5, -1), { label: 'Oct', value: latest.value }] :
  [...weightByMonth.slice(0, -1), { label: 'Oct', value: latest.value }];

  const change = points[points.length - 1].value - points[0].value;
  const lost = startWeight - latest.value;

  return (
    <Screen title="Weight" footer={<Button size="lg" fullWidth icon={PlusIcon} onClick={() => setAdding(true)}>Log weight</Button>}>
      <div className="px-5">
        <p className="text-[13px] text-muted">Current</p>
        <p className="text-ink">
          <span className="font-mono text-[44px] font-semibold leading-none tracking-[-0.04em]">{latest.value.toFixed(1)}</span>
          <span className="ml-1 text-[16px] text-muted">kg</span>
        </p>
        <div className="mt-1.5 flex items-center gap-3">
          <span className={`text-[13px] font-semibold ${change <= 0 ? 'text-good' : 'text-warn'}`}>{change > 0 ? '+' : ''}{change.toFixed(1)} kg this view</span>
          <SourceTag source={latest.source === 'synced' ? { kind: 'synced', label: 'Smart scale' } : { kind: 'manual', label: `Logged ${latest.time ?? ''}` }} />
        </div>
      </div>

      <div className="mt-5 px-4">
        <SegmentedControl label="Time range" options={[{ value: 'D', label: 'Daily' }, { value: 'W', label: 'Weekly' }, { value: 'M', label: 'Monthly' }, { value: 'Y', label: 'Yearly' }]} value={range} onChange={setRange} />
        <div className="mt-4 rounded-3xl border border-line bg-surface p-4">
          <LineChart key={range} points={points} target={goalWeight} targetLabel={`Goal ${goalWeight}`} ariaLabel="Weight trend" formatValue={(v) => `${v.toFixed(1)} kg`} height={170} />
        </div>
      </div>

      <section className="mx-4 mt-5 rounded-3xl border border-line bg-surface p-5" aria-label="Goal progress">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-semibold text-ink">Goal · {goalWeight} kg</p>
          <p className="font-mono text-[13px] text-muted">{(latest.value - goalWeight).toFixed(1)} kg to go</p>
        </div>
        <ProgressBar value={lost} max={startWeight - goalWeight} label="Progress to goal weight" barClassName="bg-accentStrong" className="mt-3 h-2.5" />
        <p className="mt-2 text-[12.5px] text-muted">Started at {startWeight} kg in January · {Math.round(lost / (startWeight - goalWeight) * 100)}% there</p>
      </section>

      <button type="button" onClick={() => navigate('coach', { q: 'Why has my weight stopped changing?' })} className="mx-4 mt-3 flex w-[calc(100%-2rem)] gap-3 rounded-3xl bg-hero p-5 text-left text-heroInk">
        <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="block text-[15px] font-semibold">Your pace slowed this week</span>
          <span className="mt-1 block text-[13.5px] leading-snug text-heroMuted">−0.4 kg over 10 days vs −0.9 kg before. Weekend calories look like the cause. Tap for the breakdown.</span>
        </span>
      </button>

      <button type="button" onClick={() => navigate('measurements')} className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl border border-line bg-surface p-4 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2"><RulerIcon size={18} className="text-ink" aria-hidden="true" /></span>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold text-ink">Body measurements</span>
          <span className="block text-[12.5px] text-muted">Body fat 18.6% · Waist 86.5 cm · Oct 4</span>
        </span>
        <ChevronRightIcon size={18} className="text-muted" aria-hidden="true" />
      </button>

      <section className="mt-6 px-4" aria-labelledby="weight-history">
        <h2 id="weight-history" className="mb-2 px-1 text-[17px] font-semibold text-ink">History</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {[...entries].reverse().slice(0, 8).map((e, i, arr) => {
            const prev = arr[i + 1];
            const d = prev ? e.value - prev.value : 0;
            return (
              <li key={e.date} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[15px] text-ink">{e.date}</p>
                  <SourceTag source={e.source === 'synced' ? { kind: 'synced', label: 'Apple Health' } : { kind: 'manual', label: e.note ?? 'Manual' }} />
                </div>
                <p className="text-right">
                  <span className="block font-mono text-[15px] font-semibold text-ink">{e.value.toFixed(1)}</span>
                  {prev && <span className={`block font-mono text-[11.5px] ${d <= 0 ? 'text-good' : 'text-warn'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
                </p>
              </li>);

          })}
        </ul>
      </section>

      <AddWeightSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>);

}
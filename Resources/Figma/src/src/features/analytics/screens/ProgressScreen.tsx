import React, { useState } from 'react';
import { FileTextIcon, MedalIcon, ScaleIcon, TargetIcon, TrophyIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Chip } from '../../../shared/components/ui/Chip';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { BarChart } from '../../../shared/components/charts/BarChart';
import type { TimeRange } from '../../../shared/types/health';
import { cn } from '../../../shared/utils/cn';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { MetricKey, achievements, progressMetrics, rangeLabels } from '../data/progressMock';
import { aiInsights } from '../data/insightsMock';
import { InsightCard } from '../components/InsightCard';

const fmt = (v: number, unit: string) => unit === 'h' ? `${Math.floor(v)}h ${Math.round(v % 1 * 60)}m` : `${v.toLocaleString()}${unit ? ` ${unit}` : ''}`;

export function ProgressScreen() {
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const [range, setRange] = useState<TimeRange>('M');
  const [metric, setMetric] = useState<MetricKey>('weight');
  const m = progressMetrics[metric];
  const points = m.series[range];
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = last - first;
  const improving = m.lowerIsBetter ? delta < 0 : delta > 0;
  const blocked = m.requiresDevice && !hasDevice;

  return (
    <Screen largeTitle="Progress" subtitle="Trends, goals and AI reports">
      <div className="space-y-6 px-4">
        <SegmentedControl label="Time range" options={[{ value: 'D', label: 'Daily' }, { value: 'W', label: 'Weekly' }, { value: 'M', label: 'Monthly' }, { value: 'Y', label: 'Yearly' }]} value={range} onChange={setRange} />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Metric">
          {(Object.keys(progressMetrics) as MetricKey[]).map((k) =>
          <Chip key={k} selected={k === metric} onClick={() => setMetric(k)}>{progressMetrics[k].label}</Chip>
          )}
        </div>

        <section className="rounded-3xl border border-line bg-surface p-5" aria-label={`${m.label} ${rangeLabels[range]}`}>
          {blocked ?
          <EmptyState compact icon={m.label === 'Sleep' ? FileTextIcon : TargetIcon} title={`${m.label} needs a wearable`} body="Connect Apple Health or Health Connect to see this trend." actionLabel="Connect" onAction={() => navigate('healthIntegration')} /> :

          <>
              <p className="text-[12px] text-muted">{m.label} · {rangeLabels[range]}</p>
              <div className="mt-1 flex items-baseline gap-3">
                <p className="font-mono text-[30px] font-semibold tracking-[-0.03em] text-ink">{fmt(last, m.unit)}</p>
                <p className={cn('text-[13px] font-semibold', improving ? 'text-good' : 'text-warn')}>
                  {delta > 0 ? '+' : ''}{m.unit === 'h' ? fmt(Math.abs(delta), 'h') : `${Number(delta.toFixed(1)).toLocaleString()}`} vs start
                </p>
              </div>
              <div className="mt-3">
                {m.chart === 'line' ?
              <LineChart key={`${metric}-${range}`} points={points} target={m.goal} targetLabel={m.goal ? `Goal ${m.goal}` : undefined} ariaLabel={`${m.label} trend`} formatValue={(v) => fmt(v, m.unit)} height={170} /> :

              <BarChart key={`${metric}-${range}`} data={points} goal={m.goal} ariaLabel={`${m.label} trend`} formatValue={(v) => fmt(v, m.unit)} height={150} barClassName="bg-accentStrong" />
              }
              </div>
            </>
          }
        </section>

        <section aria-labelledby="compare-title">
          <SectionHeader id="compare-title" title="September vs August" action="Ask coach" onAction={() => navigate('coach', { q: 'Compare this month with last month' })} />
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            <table className="w-full text-left">
              <tbody className="divide-y divide-line">
                {[
                ['Workouts', '19', '16', true],
                ['Weight change', '−1.2 kg', '−0.6 kg', true],
                ['Avg sleep', hasDevice ? '7h 12m' : '—', hasDevice ? '6h 58m' : '—', true],
                ['Avg protein', '124 g', '112 g', true],
                ['Avg steps', '8,940', '9,120', false]].
                map(([l, a, b, better]) =>
                <tr key={l as string}>
                    <th scope="row" className="px-4 py-3 text-[14px] font-medium text-ink">{l}</th>
                    <td className={cn('py-3 text-right font-mono text-[13px]', better ? 'font-semibold text-good' : 'text-ink')}>{a}</td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] text-muted">{b}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="insights-title" className="space-y-2">
          <SectionHeader id="insights-title" title="AI insights" />
          {aiInsights.filter((i) => hasDevice || !i.requiresDevice).map((i) =>
          <InsightCard key={i.id} insight={i} onAsk={() => navigate('coach', { q: i.question })} />
          )}
          <p className="px-1 text-[11.5px] text-muted">Insights are patterns in your data, not diagnoses.</p>
        </section>

        <section aria-labelledby="ach-title">
          <SectionHeader id="ach-title" title="Achievements" />
          <ul className="grid grid-cols-2 gap-2">
            {achievements.map((a) =>
            <li key={a.title} className={cn('rounded-3xl border p-4', a.earned ? 'border-line bg-surface' : 'border-dashed border-line')}>
                <MedalIcon size={20} className={a.earned ? 'text-accentStrong' : 'text-muted'} aria-hidden="true" />
                <p className="mt-2 text-[14px] font-semibold text-ink">{a.title}</p>
                <p className="text-[12px] text-muted">{a.earned ? a.detail : `In progress · ${a.detail}`}</p>
              </li>
            )}
          </ul>
        </section>

        <ListGroup>
          <ListRow icon={FileTextIcon} title="AI reports" subtitle="Weekly every Sunday · monthly on the 1st" onClick={() => navigate('reports')} />
          <ListRow icon={TargetIcon} title="Goals" subtitle="5 active · 2 completed" onClick={() => navigate('goals')} />
          <ListRow icon={ScaleIcon} title="Weight & body" onClick={() => navigate('weight')} />
          <ListRow icon={TrophyIcon} title="Personal records" onClick={() => navigate('personalRecords')} />
        </ListGroup>
      </div>
    </Screen>);

}
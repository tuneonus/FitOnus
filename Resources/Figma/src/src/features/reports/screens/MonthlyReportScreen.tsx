import React from 'react';
import { SparklesIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { Button } from '../../../shared/components/ui/Button';
import { getMonthlyReport } from '../data/reportsMock';

export function MonthlyReportScreen() {
  const { period, id } = useRouteParams();
  const r = getMonthlyReport(id);
  const { navigate } = useNavigation();
  return (
    <Screen title="Monthly report" footer={<Button size="lg" fullWidth onClick={() => navigate('coach', { q: 'Compare this month with last month' })}>Compare with coach</Button>}>
      <div className="px-5">
        <p className="text-[12px] text-muted">{period ?? r.month} · Generated {r.generated}</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink">{r.headline}</h1>
      </div>
      <dl className="mx-4 mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line">
        {r.stats.map((s) =>
        <div key={s.label} className="bg-surface p-4">
            <dt className="text-[12px] text-muted">{s.label}</dt>
            <dd className="font-mono text-[24px] font-semibold tracking-[-0.03em] text-ink">{s.value}<span className="ml-1 font-sans text-[11.5px] font-normal text-muted">{s.unit}</span></dd>
          </div>
        )}
      </dl>

      <section className="mx-4 mt-5 rounded-3xl border border-line bg-surface p-4" aria-label="Weight trend">
        <h2 className="text-[15px] font-semibold text-ink">Weight · 6 months</h2>
        <div className="mt-2"><LineChart points={r.weightTrend} target={75} targetLabel="Goal 75" ariaLabel="Weight over 6 months" formatValue={(v) => `${v} kg`} height={140} /></div>
      </section>
      <section className="mx-4 mt-3 rounded-3xl border border-line bg-surface p-4" aria-label="Recovery trend">
        <h2 className="text-[15px] font-semibold text-ink">Average recovery · 6 months</h2>
        <div className="mt-2"><LineChart points={r.recoveryTrend} ariaLabel="Average recovery over 6 months" height={120} strokeClassName="stroke-accentStrong" dotClassName="fill-accentStrong" /></div>
      </section>

      <section className="mt-6 px-5" aria-labelledby="trends">
        <h2 id="trends" className="text-[17px] font-semibold text-ink">Long-term trends</h2>
        <ul className="mt-2 space-y-2.5">
          {r.trends.map((t) => <li key={t} className="border-l-2 border-line pl-3 text-[14.5px] leading-snug text-ink">{t}</li>)}
        </ul>
      </section>

      <section className="mx-4 mt-6 rounded-[28px] bg-hero p-5 text-heroInk" aria-labelledby="recs">
        <h2 id="recs" className="flex items-center gap-1.5 text-[13px] font-medium text-heroMuted"><SparklesIcon size={14} className="text-accent" aria-hidden="true" /> AI recommendations for October</h2>
        <ol className="mt-3 space-y-3">
          {r.recommendations.map((rec, i) =>
          <li key={rec.title} className="flex gap-3">
              <span className="font-mono text-[13px] text-accent">{i + 1}</span>
              <div>
                <p className="text-[15px] font-semibold">{rec.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-heroMuted">{rec.detail}</p>
              </div>
            </li>
          )}
        </ol>
      </section>
    </Screen>);

}
import React, { useState } from 'react';
import { TrophyIcon } from 'lucide-react';
import { Screen } from '../../../shared/components/ui/Screen';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import { cn } from '../../../shared/utils/cn';
import { personalRecords } from '../data/workoutsMock';

export function PersonalRecordsScreen() {
  const lifts = personalRecords.filter((r) => r.history.length);
  const [selected, setSelected] = useState(lifts[0].lift);
  const rec = lifts.find((l) => l.lift === selected) ?? lifts[0];

  return (
    <Screen title="Personal records">
      <section className="mx-4 rounded-3xl border border-line bg-surface p-5" aria-label={`${rec.lift} progress`}>
        <p className="text-[13px] text-muted">{rec.lift}</p>
        <p className="mt-1 font-mono text-[32px] font-semibold tracking-[-0.03em] text-ink">{rec.best}</p>
        <p className="text-[13px] text-muted">Estimated 1RM <span className="font-mono text-ink">{rec.e1rm} kg</span> · set {rec.date}</p>
        <div className="mt-3">
          <LineChart points={rec.history.map((v, i) => ({ label: `W${34 + i}`, value: v }))} ariaLabel={`${rec.lift} top set by week`} height={130} formatValue={(v) => `${v} kg`} strokeClassName="stroke-accentStrong" dotClassName="fill-accentStrong" />
        </div>
        <p className="mt-2 text-[11.5px] text-muted">Estimated 1RM uses the Epley formula — a guide, not a tested max.</p>
      </section>
      <ul className="mt-5 divide-y divide-line px-4">
        {personalRecords.map((r) =>
        <li key={r.lift}>
            <button
            type="button"
            disabled={!r.history.length}
            onClick={() => setSelected(r.lift)}
            aria-pressed={r.lift === selected}
            className={cn('flex w-full items-center gap-3 py-3.5 text-left', r.lift === selected && 'font-semibold')}>
            
              <TrophyIcon size={18} className={r.lift === selected ? 'text-accentStrong' : 'text-muted'} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">{r.lift}</span>
                <span className="block font-mono text-[12.5px] font-normal text-muted">{r.best} · {r.date}</span>
              </span>
              {r.history.length > 0 && <Sparkline points={r.history} strokeClassName="stroke-ink" dotClassName="fill-ink" width={64} />}
            </button>
          </li>
        )}
      </ul>
    </Screen>);

}
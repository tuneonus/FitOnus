import React, { useState } from 'react';
import { PlusIcon, SparklesIcon } from 'lucide-react';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { showToast } from '../../../shared/stores/toastStore';
import { useWeightStore } from '../store/weightStore';
import { measurementMeta } from '../data/weightMock';
import type { MeasurementKey } from '../types/weight';

export function MeasurementsScreen() {
  const { measurements, addMeasurement } = useWeightStore();
  const [open, setOpen] = useState(false);
  const latest = measurements[0];
  const prev = measurements[1];
  const [draft, setDraft] = useState<Partial<Record<MeasurementKey, number>>>(latest.values);

  const save = () => {
    addMeasurement({ date: 'Oct 9', values: draft });
    setOpen(false);
    showToast({ message: 'Measurements saved' });
  };

  return (
    <Screen title="Body measurements" footer={<Button size="lg" fullWidth icon={PlusIcon} onClick={() => {setDraft(latest.values);setOpen(true);}}>Add measurements</Button>}>
      <p className="px-5 text-[13px] text-muted">Latest · {latest.date} · logged manually</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 px-4">
        {measurementMeta.map((m) => {
          const v = latest.values[m.key];
          const p = prev?.values[m.key];
          const d = v !== undefined && p !== undefined ? v - p : 0;
          const good = m.goodWhenLower ? d < 0 : d > 0;
          return (
            <div key={m.key} className="rounded-3xl border border-line bg-surface p-4">
              <dt className="text-[12px] text-muted">{m.label}</dt>
              <dd className="mt-1">
                <span className="font-mono text-[22px] font-semibold text-ink">{v ?? '—'}</span>
                <span className="ml-0.5 text-[12px] text-muted">{m.unit}</span>
                {d !== 0 && <span className={`block font-mono text-[12px] ${good ? 'text-good' : 'text-warn'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)} vs {prev.date}</span>}
              </dd>
            </div>);

        })}
      </dl>

      <div className="mx-4 mt-4 flex gap-3 rounded-3xl bg-hero p-5 text-heroInk">
        <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-[13.5px] leading-relaxed text-heroMuted">
          <span className="font-semibold text-heroInk">Losing fat, keeping muscle. </span>
          Waist is down 3 cm in four weeks while muscle mass rose 0.4 kg. Body-fat readings from bio-impedance can swing ±2%, so I weight the trend over single readings.
        </p>
      </div>

      <section className="mt-6 px-4" aria-labelledby="m-history">
        <h2 id="m-history" className="mb-2 px-1 text-[17px] font-semibold text-ink">History</h2>
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[11.5px] text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="py-2.5 text-right font-medium">Fat %</th>
                <th scope="col" className="py-2.5 text-right font-medium">Waist</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Arm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-[13px] text-ink">
              {measurements.map((m) =>
              <tr key={m.date}>
                  <th scope="row" className="px-4 py-3 font-sans font-medium">{m.date}</th>
                  <td className="py-3 text-right">{m.values.bodyFat}</td>
                  <td className="py-3 text-right">{m.values.waist}</td>
                  <td className="px-4 py-3 text-right">{m.values.arm}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add measurements" description="Fri, Oct 9 · cm unless noted" footer={<Button size="lg" fullWidth onClick={save}>Save</Button>}>
        <ul className="divide-y divide-line">
          {measurementMeta.map((m) =>
          <li key={m.key} className="flex items-center justify-between gap-3 py-3">
              <span className="text-[15px] text-ink">{m.label}</span>
              <div className="w-[190px]">
                <Stepper label={m.label} value={draft[m.key] ?? 0} onChange={(v) => setDraft({ ...draft, [m.key]: v })} step={m.unit === '%' ? 0.1 : 0.5} decimals={1} unit={m.unit} />
              </div>
            </li>
          )}
        </ul>
      </BottomSheet>
    </Screen>);

}
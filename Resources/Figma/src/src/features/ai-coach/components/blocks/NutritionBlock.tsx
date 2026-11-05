import React from 'react';
import { ProgressBar } from '../../../../shared/components/ui/ProgressBar';
import type { Block } from '../../types/coach';

const macroBars: Record<string, string> = { Protein: 'bg-move', Carbs: 'bg-sky', Fat: 'bg-warn', Fiber: 'bg-accentStrong' };

export function NutritionBlock({ block }: {block: Extract<Block, {type: 'nutrition';}>;}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <h4 className="text-[13px] font-semibold text-ink">{block.title}</h4>
      {block.headline &&
      <p className="mt-2">
          <span className="font-mono text-[30px] font-semibold tracking-[-0.03em] text-ink">{block.headline.value}</span>
          <span className="ml-1.5 text-[13px] text-muted">{block.headline.label}</span>
        </p>
      }
      {block.rows.length > 0 &&
      <ul className="mt-2 divide-y divide-line">
          {block.rows.map((r) =>
        <li key={r.label} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-medium text-ink">{r.label}</span>
                <span className="shrink-0 font-mono text-[13px] text-ink">
                  {r.value}
                  {r.estimated && <span className="ml-1 rounded border border-dashed border-muted px-1 font-sans text-[10px] text-muted">Est.</span>}
                </span>
              </div>
              {r.detail && <p className="mt-0.5 text-[12.5px] text-muted">{r.detail}</p>}
            </li>
        )}
        </ul>
      }
      {block.macros &&
      <div className="mt-3 grid grid-cols-2 gap-3">
          {block.macros.map((m) =>
        <div key={m.label}>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">{m.label}</span>
                <span className="font-mono text-ink">{m.value}/{m.goal}g</span>
              </div>
              <ProgressBar value={m.value} max={m.goal} label={m.label} barClassName={macroBars[m.label]} className="mt-1 h-1.5" />
            </div>
        )}
        </div>
      }
      {block.note && <p className="mt-3 text-[12px] text-muted">{block.note}</p>}
    </div>);

}
import React from 'react';
import type { Block } from '../../types/coach';

export function ComparisonBlock({ block }: {block: Extract<Block, {type: 'comparison';}>;}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <h4 className="text-[13px] font-semibold text-ink">{block.title}</h4>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr className="text-[11.5px] text-muted">
            <th scope="col" className="py-1.5 font-medium">Metric</th>
            <th scope="col" className="py-1.5 text-right font-medium">{block.columns[0]}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{block.columns[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {block.rows.map((r) =>
          <tr key={r.label}>
              <th scope="row" className="py-2.5 text-[13.5px] font-medium text-ink">{r.label}</th>
              <td className={`py-2.5 text-right font-mono text-[13px] ${r.better === 'a' ? 'font-semibold text-good' : 'text-ink'}`}>{r.a}</td>
              <td className={`py-2.5 text-right font-mono text-[13px] ${r.better === 'b' ? 'font-semibold text-good' : 'text-muted'}`}>{r.b}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>);

}
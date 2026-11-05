import React from 'react';
import { SourceTag } from '../../../../shared/components/ui/SourceTag';
import type { Block } from '../../types/coach';

const toneClass = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', neutral: 'text-muted' };

export function MetricsBlock({ block }: {block: Extract<Block, {type: 'metrics';}>;}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <h4 className="text-[13px] font-semibold text-ink">{block.title}</h4>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
        {block.items.map((m) =>
        <div key={m.label}>
            <dt className="text-[12px] text-muted">{m.label}</dt>
            <dd className="mt-0.5">
              <span className="font-mono text-[20px] font-semibold tracking-[-0.02em] text-ink">{m.value}</span>
              {m.unit && <span className="ml-0.5 text-[12px] text-muted">{m.unit}</span>}
              {m.delta && <span className={`block text-[12px] font-medium ${toneClass[m.tone ?? 'neutral']}`}>{m.delta}</span>}
              <span className="mt-1 block">
                <SourceTag source={m.source} />
              </span>
            </dd>
          </div>
        )}
      </dl>
    </div>);

}
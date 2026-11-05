import React from 'react';
import { InfoIcon } from 'lucide-react';
import { LineChart } from '../../../../shared/components/charts/LineChart';
import { BarChart } from '../../../../shared/components/charts/BarChart';
import { SourceTag } from '../../../../shared/components/ui/SourceTag';
import { Badge } from '../../../../shared/components/ui/Badge';
import type { Block } from '../../types/coach';

const confidenceTone = { low: 'warn', medium: 'neutral', high: 'good' } as const;

export function ChartBlock({ block }: {block: Extract<Block, {type: 'chart';}>;}) {
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${block.unit ? ` ${block.unit}` : ''}`;
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-ink">{block.title}</h4>
        {block.confidence && <Badge tone={confidenceTone[block.confidence]}>{block.confidence} confidence</Badge>}
      </div>
      <div className="mt-2">
        {block.chart === 'line' ?
        <LineChart
          points={block.points}
          projection={block.projection}
          projectionBand={block.band}
          target={block.target}
          targetLabel={block.targetLabel}
          ariaLabel={block.title}
          height={150}
          formatValue={fmt} /> :


        <BarChart data={block.points} ariaLabel={block.title} height={110} formatValue={fmt} barClassName="bg-accentStrong" />
        }
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-muted">
        <InfoIcon size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        {block.caption}
      </p>
      <div className="mt-2">
        <SourceTag source={block.source} />
      </div>
    </div>);

}
import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import type { ChartPoint } from '../../types/health';

type BarChartProps = {
  data: ChartPoint[];
  ariaLabel: string;
  height?: number;
  goal?: number;
  highlightIndex?: number;
  barClassName?: string;
  mutedBarClassName?: string;
  formatValue?: (value: number) => string;
};

/** Tap-to-inspect bar chart. Maps to a Skia/Victory chart in React Native. */
export function BarChart({
  data,
  ariaLabel,
  height = 120,
  goal,
  highlightIndex,
  barClassName = 'bg-ink',
  mutedBarClassName = 'bg-ink/15',
  formatValue = (v) => v.toLocaleString()
}: BarChartProps) {
  const [selected, setSelected] = useState<number>(highlightIndex ?? data.length - 1);
  const max = Math.max(...data.map((d) => d.value), goal ?? 0) * 1.08 || 1;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[12px] text-muted" aria-live="polite">
        <span>{data[selected]?.label}</span>
        <span className="font-mono text-[13px] font-semibold text-ink">{formatValue(data[selected]?.value ?? 0)}</span>
      </div>
      <div className="relative flex items-end gap-1.5" style={{ height }} role="group" aria-label={ariaLabel}>
        {goal !== undefined &&
        <span
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/30"
          style={{ bottom: `${goal / max * 100}%` }}
          aria-hidden="true" />

        }
        {data.map((d, i) =>
        <button
          key={`${d.label}-${i}`}
          type="button"
          onClick={() => setSelected(i)}
          aria-label={`${d.label}: ${formatValue(d.value)}`}
          aria-pressed={i === selected}
          className="flex h-full flex-1 items-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 rounded-md">
          
            <span
            className={cn(
              'block w-full rounded-md transition-colors duration-150',
              i === selected ? barClassName : mutedBarClassName
            )}
            style={{ height: `${Math.max(3, d.value / max * 100)}%` }} />
          
          </button>
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
        {data.map((d, i) =>
        <span
          key={`${d.label}-l-${i}`}
          className={cn('flex-1 truncate text-center text-[10.5px]', i === selected ? 'font-semibold text-ink' : 'text-muted')}>
          
            {data.length > 12 ? i % 4 === 0 ? d.label : '' : d.label}
          </span>
        )}
      </div>
    </div>);

}
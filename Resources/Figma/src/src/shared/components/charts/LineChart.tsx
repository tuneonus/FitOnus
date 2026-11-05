import React, { useMemo, useState } from 'react';
import type { ChartPoint } from '../../types/health';

type Band = {lower: number;upper: number;};

type LineChartProps = {
  points: ChartPoint[];
  ariaLabel: string;
  height?: number;
  target?: number;
  targetLabel?: string;
  projection?: ChartPoint[];
  projectionBand?: Band[];
  strokeClassName?: string;
  dotClassName?: string;
  formatValue?: (value: number) => string;
};

const W = 326;

/** Line chart with tap-to-inspect, optional target and projection with uncertainty band. */
export function LineChart({
  points,
  ariaLabel,
  height = 160,
  target,
  targetLabel,
  projection = [],
  projectionBand = [],
  strokeClassName = 'stroke-ink',
  dotClassName = 'fill-ink',
  formatValue = (v) => v.toLocaleString()
}: LineChartProps) {
  const all = [...points, ...projection];
  const [selected, setSelected] = useState(points.length - 1);
  const padT = 14;
  const padB = 22;
  const padX = 6;

  const { min, max } = useMemo(() => {
    const vals = [
    ...all.map((p) => p.value),
    ...projectionBand.flatMap((b) => [b.lower, b.upper]),
    ...(target !== undefined ? [target] : [])];

    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [all, projectionBand, target]);

  const x = (i: number) => padX + i * (W - padX * 2) / Math.max(1, all.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (height - padT - padB);
  const line = (arr: ChartPoint[], offset: number) =>
  arr.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i + offset).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');

  const projStart = points.length - 1;
  const projPath = projection.length ?
  `M${x(projStart)} ${y(points[projStart].value)} ` +
  projection.map((p, i) => `L${x(projStart + 1 + i)} ${y(p.value)}`).join(' ') :
  '';
  const bandPath = projectionBand.length ?
  `M${x(projStart)} ${y(points[projStart].value)} ` +
  projectionBand.map((b, i) => `L${x(projStart + 1 + i)} ${y(b.upper)}`).join(' ') +
  ' ' +
  [...projectionBand].
  reverse().
  map((b, i) => `L${x(projStart + projectionBand.length - i)} ${y(b.lower)}`).
  join(' ') +
  ' Z' :
  '';

  const labelEvery = Math.max(1, Math.ceil(all.length / 5));
  const sel = all[selected];
  const isProjected = selected >= points.length;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12px] text-muted" aria-live="polite">
        <span>
          {sel?.label}
          {isProjected && ' · projected'}
        </span>
        <span className="font-mono text-[13px] font-semibold text-ink">{sel && formatValue(sel.value)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={ariaLabel} className="overflow-visible">
        {bandPath && <path d={bandPath} className="fill-ink/[0.07]" />}
        {target !== undefined &&
        <>
            <line x1={0} x2={W} y1={y(target)} y2={y(target)} strokeDasharray="4 4" strokeWidth={1} className="stroke-ink/30" />
            {targetLabel &&
          <text x={W - 2} y={y(target) - 5} textAnchor="end" className="fill-muted text-[10px]">
                {targetLabel}
              </text>
          }
          </>
        }
        {sel &&
        <line x1={x(selected)} x2={x(selected)} y1={padT - 6} y2={height - padB} strokeWidth={1} className="stroke-ink/15" />
        }
        <path d={line(points, 0)} fill="none" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={strokeClassName} />
        {projPath &&
        <path d={projPath} fill="none" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" className={strokeClassName} />
        }
        {sel && <circle cx={x(selected)} cy={y(sel.value)} r={4.5} className={`${dotClassName} stroke-surface`} strokeWidth={2} />}
        {all.map((p, i) =>
        i % labelEvery === 0 || i === all.length - 1 ?
        <text key={`l-${i}`} x={x(i)} y={height - 5} textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'} className="fill-muted text-[10px]">
              {p.label}
            </text> :
        null
        )}
        {all.map((p, i) =>
        <rect
          key={`hit-${i}`}
          x={x(i) - W / all.length / 2}
          y={0}
          width={W / all.length}
          height={height}
          fill="transparent"
          onClick={() => setSelected(i)}
          style={{ cursor: 'pointer' }}>
          
            <title>{`${p.label}: ${formatValue(p.value)}`}</title>
          </rect>
        )}
      </svg>
    </div>);

}
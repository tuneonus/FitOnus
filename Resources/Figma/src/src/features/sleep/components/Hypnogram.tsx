import React from 'react';
import type { StageSegment } from '../data/sleepMock';

const rows: {stage: StageSegment['stage'];label: string;className: string;}[] = [
{ stage: 'awake', label: 'Awake', className: 'fill-warn' },
{ stage: 'rem', label: 'REM', className: 'fill-sleep/60' },
{ stage: 'light', label: 'Light', className: 'fill-sleep/30' },
{ stage: 'deep', label: 'Deep', className: 'fill-sleep' }];


export function Hypnogram({ segments, start, end }: {segments: StageSegment[];start: string;end: string;}) {
  const total = segments[segments.length - 1].start + segments[segments.length - 1].dur;
  const W = 280;
  const rowH = 22;
  return (
    <div>
      <div className="flex">
        <div className="w-12 shrink-0">
          {rows.map((r) =>
          <p key={r.stage} className="flex items-center text-[11px] text-muted" style={{ height: rowH }}>{r.label}</p>
          )}
        </div>
        <svg viewBox={`0 0 ${W} ${rowH * 4}`} width="100%" role="img" aria-label="Sleep stages through the night">
          {rows.map((r, i) =>
          <line key={r.stage} x1={0} x2={W} y1={i * rowH + rowH / 2} y2={i * rowH + rowH / 2} className="stroke-ink/[0.06]" strokeWidth={rowH - 4} />
          )}
          {segments.map((s, i) => {
            const row = rows.findIndex((r) => r.stage === s.stage);
            return (
              <rect key={i} x={s.start / total * W} y={row * rowH + 3} width={Math.max(1.5, s.dur / total * W - 1)} height={rowH - 6} rx={3} className={rows[row].className} />);

          })}
        </svg>
      </div>
      <div className="ml-12 mt-1 flex justify-between text-[11px] text-muted">
        <span>{start}</span>
        <span>{end}</span>
      </div>
    </div>);

}
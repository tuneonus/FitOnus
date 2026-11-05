import React from 'react';
import { DumbbellIcon } from 'lucide-react';
import type { Block } from '../../types/coach';

export function WorkoutBlock({ block }: {block: Extract<Block, {type: 'workout';}>;}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/25">
          <DumbbellIcon size={18} className="text-accentStrong" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{block.focus}</p>
          <h4 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{block.title}</h4>
          <p className="text-[12.5px] text-muted">{block.durationMin} min · {block.exercises.length} exercises</p>
        </div>
      </div>
      <ol className="mt-3 divide-y divide-line">
        {block.exercises.map((e) =>
        <li key={e.name} className="flex items-center justify-between gap-3 py-2">
            <span className="truncate text-[13.5px] text-ink">{e.name}</span>
            <span className="shrink-0 font-mono text-[12px] text-muted">{e.detail}</span>
          </li>
        )}
      </ol>
    </div>);

}
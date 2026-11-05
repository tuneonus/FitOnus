import React from 'react';
import { CheckIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import type { SetLog } from '../types/workout';

type SetRowProps = {
  index: number;
  set: SetLog;
  bodyweight: boolean;
  onChange: (patch: Partial<SetLog>) => void;
  onComplete: () => void;
};

function Adjust({ value, onChange, step, label, unit }: {value: number;onChange: (v: number) => void;step: number;label: string;unit?: string;}) {
  const btn = 'flex h-8 w-8 items-center justify-center rounded-full bg-surface2 text-ink active:scale-[0.94] transition-transform duration-150';
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, +(value - step).toFixed(1)))}>
        <MinusIcon size={13} aria-hidden="true" />
      </button>
      <span className="w-12 text-center font-mono text-[15px] font-semibold text-ink" aria-live="polite">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted">{unit}</span>}
      </span>
      <button type="button" className={btn} aria-label={`Increase ${label}`} onClick={() => onChange(+(value + step).toFixed(1))}>
        <PlusIcon size={13} aria-hidden="true" />
      </button>
    </div>);

}

export function SetRow({ index, set, bodyweight, onChange, onComplete }: SetRowProps) {
  return (
    <li className={cn('flex items-center gap-2 rounded-2xl px-3 py-2.5', set.done ? 'bg-good/10' : 'bg-surface')}>
      <span className="w-6 font-mono text-[13px] font-semibold text-muted">{index + 1}</span>
      <div className="flex flex-1 items-center justify-between">
        {bodyweight ?
        <span className="w-[120px] text-center text-[13px] text-muted">Bodyweight</span> :

        <Adjust value={set.weight} onChange={(weight) => onChange({ weight })} step={2.5} label={`Set ${index + 1} weight`} unit="kg" />
        }
        <Adjust value={set.reps} onChange={(reps) => onChange({ reps })} step={1} label={`Set ${index + 1} reps`} />
      </div>
      <button
        type="button"
        onClick={onComplete}
        aria-pressed={set.done}
        aria-label={set.done ? `Set ${index + 1} completed` : `Complete set ${index + 1}`}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
          set.done ? 'border-good bg-good text-white' : 'border-line text-muted hover:border-ink/40'
        )}>
        
        <CheckIcon size={18} strokeWidth={3} aria-hidden="true" />
      </button>
    </li>);

}
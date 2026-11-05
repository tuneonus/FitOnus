import React from 'react';
import { MinusIcon, PlusIcon } from 'lucide-react';

type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  decimals?: number;
  size?: 'md' | 'lg';
};

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  unit,
  label,
  decimals = 0,
  size = 'md'
}: StepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(decimals))));
  const btn =
  'flex shrink-0 items-center justify-center rounded-full bg-surface2 text-ink transition-transform duration-150 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-40';
  const lg = size === 'lg';

  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className={`${btn} ${lg ? 'h-14 w-14' : 'h-10 w-10'}`}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}>
        
        <MinusIcon size={lg ? 22 : 16} aria-hidden="true" />
      </button>
      <p className="text-center text-ink" aria-live="polite">
        <span className={`font-mono font-semibold tracking-[-0.03em] ${lg ? 'text-[52px] leading-none' : 'text-[20px]'}`}>
          {value.toFixed(decimals)}
        </span>
        {unit && <span className={`ml-1 text-muted ${lg ? 'text-[18px]' : 'text-[13px]'}`}>{unit}</span>}
      </p>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className={`${btn} ${lg ? 'h-14 w-14' : 'h-10 w-10'}`}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}>
        
        <PlusIcon size={lg ? 22 : 16} aria-hidden="true" />
      </button>
    </div>);

}
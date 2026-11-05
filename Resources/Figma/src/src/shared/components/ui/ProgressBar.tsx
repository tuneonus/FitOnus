import React from 'react';
import { cn } from '../../utils/cn';

type ProgressBarProps = {
  value: number;
  max: number;
  label: string;
  barClassName?: string;
  className?: string;
};

export function ProgressBar({ value, max, label, barClassName = 'bg-ink', className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('h-2 overflow-hidden rounded-full bg-ink/[0.07]', className)}>
      
      <div className={cn('h-full rounded-full', barClassName)} style={{ width: `${pct}%` }} />
    </div>);

}
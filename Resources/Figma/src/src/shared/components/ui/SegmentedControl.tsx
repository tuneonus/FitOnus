import React from 'react';
import { cn } from '../../utils/cn';

type SegmentedControlProps<T extends string> = {
  options: {value: T;label: string;}[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex rounded-full bg-surface2 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            )}>
            
            {option.label}
          </button>);

      })}
    </div>);

}
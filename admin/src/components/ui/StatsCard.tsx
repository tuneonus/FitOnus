import React from 'react';

interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  accent?: 'teal' | 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan';
  /** Renders the value muted, e.g. when the metric source is unavailable. */
  muted?: boolean;
}

const ACCENT_ICON: Record<NonNullable<StatsCardProps['accent']>, string> = {
  teal: 'text-brand-500',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  purple: 'text-purple-400',
  cyan: 'text-cyan-400',
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accent = 'teal',
  muted,
}: StatsCardProps) {
  const isUnavailable = muted ?? value === 'Unavailable';

  return (
    <div className="card flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-medium text-ink-300">{title}</p>
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-850 ring-1 ring-ink-800 [&>svg]:h-4 [&>svg]:w-4 ${ACCENT_ICON[accent]}`}
        >
          {icon}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`truncate font-semibold tracking-tight tabular-nums ${
            isUnavailable ? 'text-base text-ink-500' : 'text-2xl text-white'
          }`}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              trend.isPositive !== false
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            {trend.isPositive !== false ? '+' : ''}
            {trend.value} {trend.label}
          </span>
        )}
      </div>

      {subtitle && <p className="truncate text-xs text-ink-400" title={subtitle}>{subtitle}</p>}
    </div>
  );
}

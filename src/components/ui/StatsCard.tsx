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
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accent = 'teal',
}: StatsCardProps) {
  const accentBorder = {
    teal: 'hover:border-teal-500/50 group-hover:text-teal-400',
    emerald: 'hover:border-emerald-500/50 group-hover:text-emerald-400',
    amber: 'hover:border-amber-500/50 group-hover:text-amber-400',
    rose: 'hover:border-rose-500/50 group-hover:text-rose-400',
    purple: 'hover:border-purple-500/50 group-hover:text-purple-400',
    cyan: 'hover:border-cyan-500/50 group-hover:text-cyan-400',
  };

  const accentBg = {
    teal: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition-all duration-200 ${accentBorder[accent]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {trend && (
              <span
                className={`text-xs font-semibold ${
                  trend.isPositive !== false ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {trend.isPositive !== false ? '+' : ''}
                {trend.value} {trend.label}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg border ${accentBg[accent]} transition-colors`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}


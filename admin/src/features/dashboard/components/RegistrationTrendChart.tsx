'use client';

import React from 'react';
import { TrendingUp, Activity } from 'lucide-react';
import type { RegistrationTrendPoint } from '../types';

interface RegistrationTrendChartProps {
  trend: RegistrationTrendPoint[];
  new7d: number;
  new30d: number;
  active7d: number;
  active30d: number;
}

export function RegistrationTrendChart({
  trend,
  new7d,
  new30d,
  active7d,
  active30d,
}: RegistrationTrendChartProps) {
  const maxTrend = trend.length > 0 ? Math.max(...trend.map((t) => t.count), 1) : 1;

  return (
    <div className="lg:col-span-2 rounded-2xl border border-ink-800 bg-ink-900/60 p-6 backdrop-blur-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              Registration Trend (Last 14 Days)
            </h3>
            <p className="text-xs text-ink-400">
              New signups aggregated daily from PostgreSQL
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <TrendingUp className="h-4 w-4" />
              +{new7d} past 7d
            </span>
            <span className="text-ink-500">|</span>
            <span className="text-ink-400">+{new30d} past 30d</span>
          </div>
        </div>

        {/* Bar Graph */}
        <div className="mt-6 flex h-40 items-end gap-2 pt-6">
          {trend.map((point) => {
            const heightPercent =
              maxTrend > 0
                ? Math.max(Math.round((point.count / maxTrend) * 100), 8)
                : 8;
            const dateFormatted = new Date(point.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={point.date}
                className="group relative flex flex-1 flex-col items-center justify-end h-full"
              >
                {/* Hover Tooltip */}
                <div className="absolute -top-8 hidden group-hover:flex flex-col items-center z-10">
                  <span className="rounded bg-ink-800 px-2 py-1 text-[10px] font-semibold text-white shadow border border-ink-700 whitespace-nowrap">
                    {point.count} user{point.count === 1 ? '' : 's'} on {dateFormatted}
                  </span>
                </div>

                {/* Bar */}
                <div
                  className="w-full rounded-t-md bg-brand-500/20 group-hover:bg-brand-400/80 transition-all border-t border-x border-brand-500/40"
                  style={{ height: `${heightPercent}%` }}
                />

                {/* Date label */}
                <span className="mt-2 text-[10px] text-ink-400 truncate w-full text-center">
                  {dateFormatted.split(' ')[1]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-ink-800 flex items-center justify-between text-xs text-ink-400">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-brand-400" />
          Active in past 7d: <strong className="text-white">{active7d}</strong>
        </span>
        <span>
          Active in past 30d: <strong className="text-white">{active30d}</strong>
        </span>
      </div>
    </div>
  );
}


'use client';

import React from 'react';
import { TrendingUp, Activity, Calendar } from 'lucide-react';
import type { RegistrationTrendPoint, DashboardTimeframe } from '../types';

interface UserGrowthChartProps {
  trend: RegistrationTrendPoint[];
  new7d: number;
  new30d: number;
  active7d: number;
  active30d: number;
  timeframe: DashboardTimeframe;
  onTimeframeChange: (tf: DashboardTimeframe) => void;
}

export function UserGrowthChart({
  trend,
  new7d,
  new30d,
  active7d,
  active30d,
  timeframe,
  onTimeframeChange,
}: UserGrowthChartProps) {
  // Filter data points based on selected timeframe
  const displayPoints =
    timeframe === '7d' ? trend.slice(-7) : trend;

  const maxVal =
    displayPoints.length > 0
      ? Math.max(...displayPoints.map((p) => p.count), 1)
      : 1;

  const totalPeriodRegistrations =
    timeframe === '7d' ? new7d : new30d;

  const activeInPeriod =
    timeframe === '7d' ? active7d : active30d;

  return (
    <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm flex flex-col justify-between">
      <div>
        {/* Header & Timeframe Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">
                User Growth & Registration Trend
              </h3>
              <span className="rounded-full bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                PostgreSQL Aggregated
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Daily member registrations recorded across the OnusFit platform
            </p>
          </div>

          {/* Timeframe Controls */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1 self-start sm:self-auto">
            {(['7d', '30d', '90d'] as DashboardTimeframe[]).map((tf) => {
              const active = timeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onTimeframeChange(tf)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-teal-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bar Graph */}
        <div className="mt-6 flex h-44 items-end gap-2 pt-6">
          {displayPoints.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
              No registration activity recorded in this period.
            </div>
          ) : (
            displayPoints.map((point) => {
              const heightPercent = Math.max(
                Math.round((point.count / maxVal) * 100),
                8,
              );
              const dateObj = new Date(point.date);
              const dateFormatted = dateObj.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={point.date}
                  className="group relative flex flex-1 flex-col items-center justify-end h-full"
                >
                  {/* Hover Tooltip */}
                  <div className="absolute -top-9 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                    <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xl border border-slate-700 whitespace-nowrap">
                      {point.count} new account{point.count === 1 ? '' : 's'} on {dateFormatted}
                    </span>
                  </div>

                  {/* Visual Bar */}
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-teal-500/20 to-teal-400/40 group-hover:from-teal-400/80 group-hover:to-emerald-400 transition-all border-t border-x border-teal-500/40"
                    style={{ height: `${heightPercent}%` }}
                  />

                  {/* Day Label */}
                  <span className="mt-2 text-[10px] text-slate-400 font-mono truncate w-full text-center">
                    {dateFormatted.split(' ')[1]}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Summary Stats */}
      <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <TrendingUp className="h-4 w-4" />
            <span>
              +{totalPeriodRegistrations} registered ({timeframe === '90d' ? '30D available' : timeframe.toUpperCase()})
            </span>
          </span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-teal-400" />
            <span>
              Active in window ({timeframe === '90d' ? '30D' : timeframe.toUpperCase()}): <strong className="text-white">{activeInPeriod}</strong> users
            </span>
          </span>
        </div>

        <span className="flex items-center gap-1.5 text-slate-500 text-[11px]">
          <Calendar className="h-3.5 w-3.5" />
          <span>Real-time Postgres Neon Aggregation</span>
        </span>
      </div>
    </div>
  );
}

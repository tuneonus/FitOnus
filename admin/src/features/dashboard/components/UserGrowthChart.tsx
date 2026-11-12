'use client';

import React, { useState } from 'react';
import { TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import type { RegistrationTrendPoint, DashboardTimeframe } from '../types';

interface UserGrowthChartProps {
  trend: RegistrationTrendPoint[];
  new7d: number;
  new30d: number;
  active7d: number;
  active30d: number;
  timeframe: DashboardTimeframe;
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) {
    if (s * magnitude >= value) return s * magnitude;
  }
  return 10 * magnitude;
}

export function UserGrowthChart({
  trend,
  new7d,
  new30d,
  active7d,
  active30d,
  timeframe,
}: UserGrowthChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Filter data points based on selected timeframe
  const displayPoints = timeframe === '7d' ? trend.slice(-7) : trend;

  const dataMax = displayPoints.length > 0 ? Math.max(...displayPoints.map((p) => p.count)) : 0;
  const axisMax = niceMax(dataMax);
  const gridLines = [axisMax, axisMax / 2, 0];

  const totalPeriodRegistrations = timeframe === '7d' ? new7d : new30d;
  const activeInPeriod = timeframe === '7d' ? active7d : active30d;
  const windowLabel = timeframe === '90d' ? '30D' : timeframe.toUpperCase();

  // Thin x-axis labels so they never collide on narrow screens.
  const labelEvery = displayPoints.length > 16 ? 5 : displayPoints.length > 10 ? 2 : 1;

  const formatDate = (date: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(date).toLocaleDateString('en-US', opts);

  return (
    <Panel
      className="lg:col-span-2"
      title="Registrations"
      description="New member accounts created per day"
      icon={<BarChart3 />}
      bodyClassName="flex flex-col"
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="eyebrow">New in {windowLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-white">
            {totalPeriodRegistrations.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="eyebrow">Active in {windowLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-white">
            {activeInPeriod.toLocaleString()}
          </p>
        </div>
      </div>

      {displayPoints.length === 0 ? (
        <div className="mt-6 flex h-52 items-center justify-center rounded-lg border border-dashed border-ink-700 text-[13px] text-ink-400">
          No registration activity recorded in this period.
        </div>
      ) : (
        <div className="mt-6">
          <div className="relative flex h-52">
            {/* Y axis labels */}
            <div className="flex w-8 shrink-0 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-ink-500">
              {gridLines.map((g) => (
                <span key={g} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
                  {Number.isInteger(g) ? g : g.toFixed(1)}
                </span>
              ))}
            </div>

            <div className="relative ml-3 flex-1">
              {/* Gridlines */}
              <div aria-hidden="true" className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
                {gridLines.map((g, i) => (
                  <div
                    key={g}
                    className={`h-px w-full ${i === gridLines.length - 1 ? 'bg-ink-700' : 'bg-ink-800/80'}`}
                  />
                ))}
              </div>

              {/* Bars */}
              <div
                role="img"
                aria-label={`Daily registrations, ${displayPoints.length} days, ${totalPeriodRegistrations} total in ${windowLabel}.`}
                className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]"
                onMouseLeave={() => setHovered(null)}
              >
                {displayPoints.map((point, i) => {
                  const heightPercent = axisMax > 0 ? (point.count / axisMax) * 100 : 0;
                  const isHovered = hovered === i;
                  return (
                    <div
                      key={point.date}
                      className="group relative flex h-full flex-1 items-end"
                      onMouseEnter={() => setHovered(i)}
                    >
                      {isHovered && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-[11px] shadow-pop">
                          <span className="block text-ink-400">
                            {formatDate(point.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="font-semibold text-white tabular-nums">
                            {point.count} new account{point.count === 1 ? '' : 's'}
                          </span>
                        </div>
                      )}
                      <div
                        className={`w-full rounded-t-[4px] transition-colors ${
                          isHovered ? 'bg-brand-500' : 'bg-brand-600/80'
                        } ${hovered !== null && !isHovered ? 'opacity-60' : ''}`}
                        style={{
                          height: point.count > 0 ? `max(${heightPercent}%, 3px)` : '1px',
                          opacity: point.count === 0 ? 0.35 : undefined,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X axis labels */}
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 flex h-5 items-end gap-[2px]">
                {displayPoints.map((point, i) => (
                  <span
                    key={point.date}
                    className="flex-1 truncate text-center text-[10px] tabular-nums text-ink-500"
                  >
                    {i % labelEvery === 0 || i === displayPoints.length - 1
                      ? formatDate(point.date, displayPoints.length > 10 ? { month: 'numeric', day: 'numeric' } : { weekday: 'short' })
                      : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Accessible table view of the plotted data */}
          <table className="sr-only">
            <caption>Daily registrations</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">New accounts</th>
              </tr>
            </thead>
            <tbody>
              {displayPoints.map((p) => (
                <tr key={p.date}>
                  <td>{formatDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-800 pt-4 text-xs text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-ink-500" />
          {totalPeriodRegistrations.toLocaleString()} registered in {windowLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-ink-500" />
          {activeInPeriod.toLocaleString()} active users in {windowLabel}
        </span>
      </div>
    </Panel>
  );
}

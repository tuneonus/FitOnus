'use client';

import React from 'react';
import {
  Activity,
  DollarSign,
  Cpu,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  BarChart3,
  Bot,
  Camera,
  Mic,
  Dumbbell,
  CheckCircle2,
} from 'lucide-react';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type {
  GeminiUsageSummaryResponse,
  FeatureUsageBreakdown,
  ModelUsageBreakdown,
  DailyUsageTrend,
  GeminiUsageEventItem,
} from '../types-ai';

interface GeminiAnalyticsSectionProps {
  summary: GeminiUsageSummaryResponse | null;
  featureBreakdown: FeatureUsageBreakdown[];
  modelBreakdown: ModelUsageBreakdown[];
  trends: DailyUsageTrend[];
  events: GeminiUsageEventItem[];
  eventsTotal: number;
  eventsLimit: number;
  eventsOffset: number;
  eventsFeatureFilter: string;
  isRefreshingEvents: boolean;
  onFilterChange: (feature: string) => void;
  onPageChange: (newOffset: number) => void;
}

export function GeminiAnalyticsSection({
  summary,
  featureBreakdown = [],
  modelBreakdown = [],
  trends = [],
  events = [],
  eventsTotal = 0,
  eventsLimit = 15,
  eventsOffset = 0,
  eventsFeatureFilter = '',
  isRefreshingEvents = false,
  onFilterChange,
  onPageChange,
}: GeminiAnalyticsSectionProps) {
  if (!summary) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
        <LoadingSpinner size="md" label="Loading AI usage analytics..." />
      </div>
    );
  }

  // Defensive extraction to support both backend DTO naming variants
  const todayRequests = summary.todayRequests ?? 0;
  const monthlyRequests = summary.monthlyRequests ?? summary.monthRequests ?? 0;
  const totalTokens = summary.totalTokens ?? 0;
  const inputTokens = summary.inputTokens ?? summary.promptTokens ?? 0;
  const outputTokens = summary.outputTokens ?? summary.completionTokens ?? 0;
  const costUsd = summary.estimatedMonthlyCostUsd ?? summary.estimatedCostUsd ?? 0;
  const costInr = summary.estimatedCostInr ?? (costUsd * 86.5);
  const avgDurationMs = summary.avgDurationMs ?? 0;
  const failedRequests = summary.failedRequests ?? 0;

  const currentPage = Math.floor(eventsOffset / eventsLimit) + 1;
  const totalPages = Math.max(1, Math.ceil(eventsTotal / eventsLimit));

  return (
    <div className="space-y-6">
      {/* 1. High-Level AI Telemetry & Cost KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatsCard
          title="Today Requests"
          value={todayRequests.toLocaleString()}
          subtitle="All Gemini calls today"
          icon={<Activity className="h-4 w-4" />}
          accent="teal"
        />
        <StatsCard
          title="Month Requests"
          value={monthlyRequests.toLocaleString()}
          subtitle="Monthly API volume"
          icon={<BarChart3 className="h-4 w-4" />}
          accent="cyan"
        />
        <StatsCard
          title="Total Tokens"
          value={totalTokens >= 1_000_000
            ? `${(totalTokens / 1_000_000).toFixed(2)}M`
            : totalTokens.toLocaleString()}
          subtitle={`${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`}
          icon={<Cpu className="h-4 w-4" />}
          accent="purple"
        />
        <StatsCard
          title="Estimated Cost"
          value={`$${costUsd.toFixed(4)}`}
          subtitle={`≈ ₹${costInr.toFixed(2)} INR`}
          icon={<DollarSign className="h-4 w-4" />}
          accent="emerald"
        />
        <StatsCard
          title="Avg Latency"
          value={`${avgDurationMs}ms`}
          subtitle="Round-trip duration"
          icon={<Clock className="h-4 w-4" />}
          accent="amber"
        />
        <StatsCard
          title="Errors / Failures"
          value={failedRequests}
          subtitle="Failed requests"
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="rose"
        />
      </div>

      {/* 2. Usage Breakdowns: Per-Feature & Per-Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown by Feature */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Consumption by Feature</h4>
            <Badge variant="info" size="sm">Past 30 Days</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Feature</th>
                  <th className="pb-2 font-medium text-right">Requests</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {featureBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-500">
                      No feature usage recorded yet
                    </td>
                  </tr>
                ) : (
                  featureBreakdown.map((row) => (
                    <tr key={`feat-${row.feature}`} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-medium text-slate-200 capitalize flex items-center gap-2">
                        {row.feature === 'coach_chat' && <Bot className="h-3.5 w-3.5 text-emerald-400" />}
                        {row.feature === 'meal_photo' && <Camera className="h-3.5 w-3.5 text-purple-400" />}
                        {row.feature === 'voice_meal' && <Mic className="h-3.5 w-3.5 text-amber-400" />}
                        {row.feature === 'workout_generator' && <Dumbbell className="h-3.5 w-3.5 text-rose-400" />}
                        {row.feature.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-300">
                        {(row.requestCount ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400">
                        {(row.totalTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono font-medium text-emerald-400">
                        ${(row.estimatedCostUsd ?? 0).toFixed(4)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Breakdown by Model */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Consumption by Model</h4>
            <Badge variant="completed" size="sm">Active Runtimes</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">Requests</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {modelBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-500">
                      No model telemetry recorded yet
                    </td>
                  </tr>
                ) : (
                  modelBreakdown.map((row) => (
                    <tr key={`mdl-${row.model}`} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-medium font-mono text-slate-200">
                        {row.model}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-300">
                        {(row.requestCount ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400">
                        {(row.totalTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono font-medium text-emerald-400">
                        ${(row.estimatedCostUsd ?? 0).toFixed(4)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Daily Usage Trends (Last 7 Days preview) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Daily Consumption & Cost Trend</h4>
            <p className="text-xs text-slate-400">
              Recent daily activity and token expenditure recorded in Neon PostgreSQL.
            </p>
          </div>
          <span className="text-xs text-slate-500">{trends.length} days tracked</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="pb-2 font-medium">Date (UTC)</th>
                <th className="pb-2 font-medium text-right">Requests</th>
                <th className="pb-2 font-medium text-right">Total Tokens</th>
                <th className="pb-2 font-medium text-right">Estimated Cost ($)</th>
                <th className="pb-2 font-medium text-right">Failed Calls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {trends.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No trend history available
                  </td>
                </tr>
              ) : (
                trends.slice(0, 7).map((day) => (
                  <tr key={`trend-${day.date}`} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-mono text-slate-300">
                      {day.date}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-200">
                      {(day.requestCount ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-400">
                      {(day.totalTokens ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-mono font-medium text-emerald-400">
                      ${(day.estimatedCostUsd ?? 0).toFixed(4)}
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {(day.errorCount ?? 0) > 0 ? (
                        <span className="text-rose-400 font-semibold">{day.errorCount}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Granular Request-Level Telemetry Log */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-white">Live AI Request Telemetry Logs</h4>
            <p className="text-xs text-slate-400">
              Request-level audit entries capturing duration, tokens, cost, and error status.
            </p>
          </div>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={eventsFeatureFilter}
              onChange={(e) => onFilterChange(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="">All Features</option>
              <option value="coach_chat">AI Coach Chat</option>
              <option value="meal_photo">Meal Photo Scanner</option>
              <option value="voice_meal">Voice Meal Entry</option>
              <option value="workout_generator">Workout Generator</option>
            </select>
          </div>
        </div>

        {/* Telemetry Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="pb-2 font-medium">Time (UTC)</th>
                <th className="pb-2 font-medium">Feature</th>
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium text-right">Tokens (In / Out)</th>
                <th className="pb-2 font-medium text-right">Latency</th>
                <th className="pb-2 font-medium text-right">Est. Cost</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isRefreshingEvents ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    <LoadingSpinner size="sm" label="Fetching telemetry events..." />
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No matching AI telemetry requests logged yet.
                  </td>
                </tr>
              ) : (
                events.map((evt, idx) => {
                  const inTokens = evt.inputTokens ?? evt.promptTokens ?? 0;
                  const outTokens = evt.outputTokens ?? evt.completionTokens ?? 0;
                  const cost = evt.estimatedCostUsd ?? 0;
                  return (
                    <tr key={evt.id || `evt-${idx}`} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-mono text-[11px] text-slate-400">
                        {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-2.5 font-medium text-slate-200 capitalize">
                        {evt.feature ? evt.feature.replace(/_/g, ' ') : '—'}
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-teal-400">
                        {evt.model}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-300">
                        <span className="text-slate-400">{inTokens.toLocaleString()}</span> +{' '}
                        <span className="text-slate-200">{outTokens.toLocaleString()}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400">
                        {evt.durationMs ?? 0}ms
                      </td>
                      <td className="py-2.5 text-right font-mono text-emerald-400">
                        ${cost.toFixed(5)}
                      </td>
                      <td className="py-2.5 text-right">
                        {evt.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {evt.errorCategory ?? 'Error'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
          <span>
            Showing {events.length > 0 ? eventsOffset + 1 : 0} to{' '}
            {Math.min(eventsOffset + eventsLimit, eventsTotal)} of {eventsTotal} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || isRefreshingEvents}
              onClick={() => onPageChange(Math.max(0, eventsOffset - eventsLimit))}
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
            <span className="text-xs text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || isRefreshingEvents}
              onClick={() => onPageChange(eventsOffset + eventsLimit)}
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

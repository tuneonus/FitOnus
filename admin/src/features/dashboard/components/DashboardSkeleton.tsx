'use client';

import React from 'react';

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-label="Loading dashboard metrics">
      {/* Top Filter Bar Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="h-6 w-48 rounded-lg bg-slate-800" />
        <div className="h-9 w-44 rounded-xl bg-slate-800/80" />
      </div>

      {/* 6 KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-slate-800" />
              <div className="h-9 w-9 rounded-lg bg-slate-800" />
            </div>
            <div className="h-7 w-24 rounded bg-slate-800" />
            <div className="h-3 w-28 rounded bg-slate-800/60" />
          </div>
        ))}
      </div>

      {/* Middle Row: Growth Chart (2 cols) & Onboarding Funnel (1 col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-44 rounded bg-slate-800" />
              <div className="h-3 w-56 rounded bg-slate-800/60" />
            </div>
            <div className="h-8 w-36 rounded-lg bg-slate-800" />
          </div>
          <div className="h-44 w-full rounded-xl bg-slate-800/40" />
          <div className="h-4 w-full rounded bg-slate-800/40" />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-slate-800" />
              <div className="h-3 w-48 rounded bg-slate-800/60" />
            </div>
            <div className="h-10 w-10 rounded-xl bg-slate-800" />
          </div>
          <div className="space-y-2">
            <div className="h-7 w-20 rounded bg-slate-800" />
            <div className="h-3 w-full rounded-full bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800">
            <div className="h-14 rounded-xl bg-slate-800/60" />
            <div className="h-14 rounded-xl bg-slate-800/60" />
          </div>
        </div>
      </div>

      {/* Activity Trends Skeleton */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="h-4 w-48 rounded bg-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 rounded-xl bg-slate-800/40" />
          <div className="h-32 rounded-xl bg-slate-800/40" />
          <div className="h-32 rounded-xl bg-slate-800/40" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-40 rounded bg-slate-800" />
          <div className="h-4 w-28 rounded bg-slate-800" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 rounded-lg bg-slate-800/40" />
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true" aria-label="Loading dashboard metrics">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-7 w-7" />
            </div>
            <div className="skeleton h-7 w-20" />
            <div className="skeleton h-3 w-32 opacity-60" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="card space-y-6 p-6 lg:col-span-2">
          <div className="space-y-2">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-56 opacity-60" />
          </div>
          <div className="skeleton h-52 w-full opacity-50" />
        </div>
        <div className="card space-y-6 p-6">
          <div className="space-y-2">
            <div className="skeleton h-4 w-36" />
            <div className="skeleton h-3 w-48 opacity-60" />
          </div>
          <div className="skeleton h-8 w-20" />
          <div className="skeleton h-2 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-5 p-5">
            <div className="skeleton h-4 w-32" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="space-y-2">
                  <div className="skeleton h-3 w-20 opacity-60" />
                  <div className="skeleton h-5 w-14" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card space-y-3 p-6">
        <div className="skeleton h-4 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-11 opacity-50" />
        ))}
      </div>
    </div>
  );
}

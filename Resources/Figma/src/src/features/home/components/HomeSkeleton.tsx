import React from 'react';

export function HomeSkeleton() {
  return (
    <div className="space-y-7 px-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Syncing your health data…</span>
      <div className="rounded-[28px] bg-hero p-5">
        <div className="h-3 w-24 animate-pulse rounded-full bg-heroInk/10" />
        <div className="mt-5 flex items-center gap-5">
          <div className="h-[108px] w-[108px] animate-pulse rounded-full border-[9px] border-heroInk/10" />
          <div className="flex-1 space-y-2.5">
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-heroInk/10" />
            <div className="h-5 w-1/3 animate-pulse rounded-full bg-heroInk/10" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="h-3 w-full animate-pulse rounded-full bg-heroInk/10" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-heroInk/10" />
        </div>
        <div className="mt-6 h-[52px] animate-pulse rounded-2xl bg-heroInk/[0.08]" />
      </div>
      {[0, 1].map((key) =>
      <div key={key}>
          <div className="mb-3 h-4 w-32 animate-pulse rounded-full bg-ink/[0.07]" />
          <div className="space-y-3 rounded-3xl border border-line bg-surface p-5">
            <div className="h-6 w-1/2 animate-pulse rounded-full bg-ink/[0.07]" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-ink/[0.07]" />
            <div className="h-16 animate-pulse rounded-2xl bg-ink/[0.05]" />
          </div>
        </div>
      )}
    </div>);

}
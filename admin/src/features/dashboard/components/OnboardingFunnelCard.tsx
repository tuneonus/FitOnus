'use client';

import React from 'react';
import { Target } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';

interface OnboardingFunnelCardProps {
  totalUsers: number;
  completedOnboarding: number;
  pendingOnboarding: number;
}

export function OnboardingFunnelCard({
  totalUsers,
  completedOnboarding,
  pendingOnboarding,
}: OnboardingFunnelCardProps) {
  const percentage = totalUsers > 0 ? Math.round((completedOnboarding / totalUsers) * 100) : 0;

  return (
    <Panel
      title="Profile onboarding"
      description="Members who completed their fitness profile"
      icon={<Target />}
      bodyClassName="flex flex-col"
    >
      {totalUsers === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-400">
          No registered users yet.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-white">
              {percentage}%
            </span>
            <span className="text-xs tabular-nums text-ink-400">
              {completedOnboarding.toLocaleString()} of {totalUsers.toLocaleString()}
            </span>
          </div>

          <div
            className="mt-4 flex h-2 w-full gap-[2px] overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding completion"
          >
            <div
              className="h-full rounded-l-full bg-brand-500 transition-[width] duration-500"
              style={{ width: `${percentage}%` }}
            />
            <div className="h-full flex-1 rounded-r-full bg-ink-800" />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="card-inset p-3">
              <dt className="flex items-center gap-1.5 text-xs text-ink-400">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-500" />
                Completed
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
                {completedOnboarding.toLocaleString()}
              </dd>
            </div>
            <div className="card-inset p-3">
              <dt className="flex items-center gap-1.5 text-xs text-ink-400">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink-600" />
                Pending
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
                {pendingOnboarding.toLocaleString()}
              </dd>
            </div>
          </dl>

          <p className="mt-auto pt-5 text-[11px] leading-relaxed text-ink-500">
            Onboarding captures fitness goals, body metrics and diet preferences.
          </p>
        </>
      )}
    </Panel>
  );
}

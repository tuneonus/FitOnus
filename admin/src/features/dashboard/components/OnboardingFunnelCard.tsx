'use client';

import React from 'react';
import { Target, CheckCircle2 } from 'lucide-react';

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
  const percentage =
    totalUsers > 0 ? Math.round((completedOnboarding / totalUsers) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">
            Fitness Profile Onboarding
          </h3>
          <p className="text-xs text-slate-400">
            Phase 2 profile completion status
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
          <Target className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold text-white">{percentage}%</span>
          <span className="text-xs text-slate-400">
            {completedOnboarding} / {totalUsers} users
          </span>
        </div>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 pt-6 border-t border-slate-800 text-xs">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <span className="text-slate-400">Completed</span>
          <p className="mt-1 text-lg font-bold text-teal-300">
            {completedOnboarding}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <span className="text-slate-400">Pending / In-Step</span>
          <p className="mt-1 text-lg font-bold text-amber-300">
            {pendingOnboarding}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
        <span>Onboarding tracks fitness goals, physical metrics, & diet</span>
      </div>
    </div>
  );
}


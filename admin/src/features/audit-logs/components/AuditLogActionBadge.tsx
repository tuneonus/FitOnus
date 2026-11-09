'use client';

import React from 'react';
import { UserCheck, UserX, LogIn, Activity, KeyRound, Sliders } from 'lucide-react';

interface AuditLogActionBadgeProps {
  action: string;
}

export function AuditLogActionBadge({ action }: AuditLogActionBadgeProps) {
  const act = action.toLowerCase();

  if (act.includes('setting')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 px-2.5 py-0.5 text-xs font-semibold text-teal-400">
        <Sliders className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('suspend')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
        <UserX className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('reactivate')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
        <UserCheck className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('password')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
        <KeyRound className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('login')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
        <LogIn className="h-3 w-3" />
        {action}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-300">
      <Activity className="h-3 w-3" />
      {action}
    </span>
  );
}


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
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-brand-500/10 px-2 font-mono text-xs font-medium text-brand-300 ring-1 ring-inset ring-brand-500/25">
        <Sliders className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('suspend')) {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-rose-500/10 px-2 font-mono text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/25">
        <UserX className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('reactivate')) {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-500/10 px-2 font-mono text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
        <UserCheck className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('password')) {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-amber-500/10 px-2 font-mono text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/25">
        <KeyRound className="h-3 w-3" />
        {action}
      </span>
    );
  }
  if (act.includes('login')) {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-cyan-500/10 px-2 font-mono text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/25">
        <LogIn className="h-3 w-3" />
        {action}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-ink-800 px-2 font-mono text-xs font-medium text-ink-300 ring-1 ring-inset ring-ink-700">
      <Activity className="h-3 w-3" />
      {action}
    </span>
  );
}


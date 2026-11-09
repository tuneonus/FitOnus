'use client';

import React from 'react';
import { Filter } from 'lucide-react';

interface AuditLogsFilterBarProps {
  actionFilter: string;
  onActionFilterChange: (action: string) => void;
  totalEvents: number;
}

export function AuditLogsFilterBar({
  actionFilter,
  onActionFilterChange,
  totalEvents,
}: AuditLogsFilterBarProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select
          value={actionFilter}
          onChange={(e) => onActionFilterChange(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
        >
          <option value="">All Security Events</option>
          <option value="admin.login">Admin Logins (admin.login)</option>
          <option value="admin.password_change">Admin Password Changes (admin.password_change)</option>
          <option value="admin.settings_update">Settings Updates (admin.settings_update)</option>
          <option value="user.suspend">User Suspensions (user.suspend)</option>
          <option value="user.reactivate">User Reactivations (user.reactivate)</option>
        </select>
      </div>

      <div className="text-xs text-slate-400">
        Total Logged Events: <strong className="text-white">{totalEvents}</strong>
      </div>
    </div>
  );
}


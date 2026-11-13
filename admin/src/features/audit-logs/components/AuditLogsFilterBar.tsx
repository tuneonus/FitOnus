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
    <div className="toolbar sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Filter aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500" />
        <label htmlFor="audit-action-filter" className="sr-only">
          Filter by action
        </label>
        <select
          id="audit-action-filter"
          value={actionFilter}
          onChange={(e) => onActionFilterChange(e.target.value)}
          className="input sm:w-80"
        >
          <option value="">All security events</option>
          <option value="admin.login">Admin logins (admin.login)</option>
          <option value="admin.password_change">Admin password changes (admin.password_change)</option>
          <option value="admin.settings_update">Settings updates (admin.settings_update)</option>
          <option value="user.suspend">User suspensions (user.suspend)</option>
          <option value="user.reactivate">User reactivations (user.reactivate)</option>
          <option value="notification.create">Notification drafts (notification.create)</option>
          <option value="notification.update">Notification edits (notification.update)</option>
          <option value="notification.schedule">Notifications sent or scheduled (notification.schedule)</option>
          <option value="notification.cancel">Notification cancellations (notification.cancel)</option>
        </select>
      </div>

      <p className="text-xs text-ink-400">
        <span className="font-semibold tabular-nums text-white">{totalEvents.toLocaleString()}</span> events logged
      </p>
    </div>
  );
}

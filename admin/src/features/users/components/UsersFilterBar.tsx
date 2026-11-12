'use client';

import React from 'react';
import { Search, Download, RotateCcw } from 'lucide-react';

interface UsersFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: 'active' | 'disabled' | '';
  onStatusFilterChange: (value: 'active' | 'disabled' | '') => void;
  onboardingFilter: 'completed' | 'pending' | '';
  onOnboardingFilterChange: (value: 'completed' | 'pending' | '') => void;
  roleFilter: 'admin' | 'member' | '';
  onRoleFilterChange: (value: 'admin' | 'member' | '') => void;
  onSubmit: (e: React.FormEvent) => void;
  onResetFilters: () => void;
  onExportCsv: () => void;
  totalUsersCount: number;
}

export function UsersFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onboardingFilter,
  onOnboardingFilterChange,
  roleFilter,
  onRoleFilterChange,
  onSubmit,
  onResetFilters,
  onExportCsv,
  totalUsersCount,
}: UsersFilterBarProps) {
  const hasActiveFilters = Boolean(
    search.trim() || statusFilter || onboardingFilter || roleFilter,
  );

  return (
    <form onSubmit={onSubmit} role="search" aria-label="Filter users" className="toolbar">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
        />
        <label htmlFor="users-search" className="sr-only">
          Search users
        </label>
        <input
          id="users-search"
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3 lg:flex lg:items-center">
        <label className="sr-only" htmlFor="users-status">Status</label>
        <select
          id="users-status"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as 'active' | 'disabled' | '')}
          className="input lg:w-40"
        >
          <option value="">All statuses</option>
          <option value="active">Active only</option>
          <option value="disabled">Suspended only</option>
        </select>

        <label className="sr-only" htmlFor="users-onboarding">Onboarding</label>
        <select
          id="users-onboarding"
          value={onboardingFilter}
          onChange={(e) =>
            onOnboardingFilterChange(e.target.value as 'completed' | 'pending' | '')
          }
          className="input lg:w-44"
        >
          <option value="">All onboarding</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending / in progress</option>
        </select>

        <label className="sr-only" htmlFor="users-role">Role</label>
        <select
          id="users-role"
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value as 'admin' | 'member' | '')}
          className="input lg:w-40"
        >
          <option value="">All roles</option>
          <option value="member">Members</option>
          <option value="admin">Administrators</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary">
          <Search className="h-3.5 w-3.5" />
          Search
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            title="Reset all search filters"
            className="btn btn-ghost"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}

        <button
          type="button"
          onClick={onExportCsv}
          disabled={totalUsersCount === 0}
          title="Export the currently displayed page to a sanitized CSV file."
          className="btn btn-secondary lg:ml-1"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>
    </form>
  );
}

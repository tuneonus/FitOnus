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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by user name or email address..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors"
          />
        </div>

        {/* Filter Dropdowns & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as 'active' | 'disabled' | '')
            }
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="disabled">Suspended Only</option>
          </select>

          {/* Onboarding Filter */}
          <select
            value={onboardingFilter}
            onChange={(e) =>
              onOnboardingFilterChange(e.target.value as 'completed' | 'pending' | '')
            }
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Onboarding</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending / In-Progress</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) =>
              onRoleFilterChange(e.target.value as 'admin' | 'member' | '')
            }
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Roles</option>
            <option value="member">Members</option>
            <option value="admin">Administrators</option>
          </select>

          {/* Submit Search */}
          <button
            type="submit"
            className="rounded-xl bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 px-3.5 py-2 text-xs font-semibold border border-teal-500/30 transition-colors"
          >
            Filter
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              title="Reset all search filters"
              className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}

          {/* CSV Export Button (Current Page) */}
          <button
            type="button"
            onClick={onExportCsv}
            disabled={totalUsersCount === 0}
            title="Export currently displayed page to sanitized CSV (CWE-1236 injection secured). Full directory export requires pending background export endpoint."
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-teal-400" />
            <span>Export Page CSV</span>
          </button>
        </div>
      </form>
    </div>
  );
}

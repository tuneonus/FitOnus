'use client';

import React from 'react';
import { Search } from 'lucide-react';

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
}: UsersFilterBarProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
      >
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email address..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
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

          <button
            type="submit"
            className="rounded-xl bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 px-3.5 py-2 text-xs font-semibold border border-teal-500/30 transition-colors"
          >
            Search
          </button>
        </div>
      </form>
    </div>
  );
}


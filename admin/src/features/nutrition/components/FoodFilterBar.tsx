'use client';

import React from 'react';
import { Search, Plus, RotateCcw } from 'lucide-react';

interface FoodFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  dataSource: string;
  onDataSourceChange: (value: string) => void;
  verificationStatus: string;
  onVerificationStatusChange: (value: string) => void;
  customFilter: 'all' | 'verified' | 'custom';
  onCustomFilterChange: (value: 'all' | 'verified' | 'custom') => void;
  includeDeleted: boolean;
  onIncludeDeletedChange: (value: boolean) => void;
  onResetFilters: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onOpenCreateModal: () => void;
}

export function FoodFilterBar({
  search,
  onSearchChange,
  dataSource,
  onDataSourceChange,
  verificationStatus,
  onVerificationStatusChange,
  customFilter,
  onCustomFilterChange,
  includeDeleted,
  onIncludeDeletedChange,
  onResetFilters,
  onSubmit,
  onOpenCreateModal,
}: FoodFilterBarProps) {
  const hasActiveFilters =
    Boolean(search) ||
    Boolean(dataSource) ||
    Boolean(verificationStatus) ||
    customFilter !== 'all' ||
    includeDeleted;

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
            placeholder="Search foods by name or brand..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Data Source */}
          <select
            value={dataSource}
            onChange={(e) => onDataSourceChange(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Sources</option>
            <option value="usda_fdc">USDA FDC (Verified)</option>
            <option value="open_food_facts">Open Food Facts</option>
            <option value="manufacturer_label">Manufacturer Label</option>
            <option value="user_custom">User Custom</option>
          </select>

          {/* Verification Status */}
          <select
            value={verificationStatus}
            onChange={(e) => onVerificationStatusChange(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Catalog Type */}
          <select
            value={customFilter}
            onChange={(e) =>
              onCustomFilterChange(e.target.value as 'all' | 'verified' | 'custom')
            }
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-teal-500 focus:outline-none"
          >
            <option value="all">All Foods</option>
            <option value="verified">System Catalog Only</option>
            <option value="custom">User Custom Only</option>
          </select>

          {/* Include Deleted */}
          <label className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 select-none">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => onIncludeDeletedChange(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5"
            />
            <span>Include Deleted</span>
          </label>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              title="Reset all filters"
              className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-2 text-xs text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}

          {/* Action: Add Food */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 shadow-lg shadow-teal-500/20 transition-all ml-auto lg:ml-0"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Add Food</span>
          </button>
        </div>
      </form>
    </div>
  );
}


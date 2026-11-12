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
    <form onSubmit={onSubmit} role="search" aria-label="Filter foods" className="toolbar flex-wrap">
      <div className="relative min-w-0 flex-1 lg:min-w-[240px]">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <label htmlFor="food-search" className="sr-only">Search foods</label>
        <input
          id="food-search"
          type="search"
          placeholder="Search foods by name or brand…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3 lg:flex lg:items-center">
        <label htmlFor="food-source" className="sr-only">Data source</label>
        <select
          id="food-source"
          value={dataSource}
          onChange={(e) => onDataSourceChange(e.target.value)}
          className="input lg:w-44"
        >
          <option value="">All sources</option>
          <option value="usda_fdc">USDA FDC (verified)</option>
          <option value="open_food_facts">Open Food Facts</option>
          <option value="manufacturer_label">Manufacturer label</option>
          <option value="user_custom">User custom</option>
        </select>

        <label htmlFor="food-verification" className="sr-only">Verification status</label>
        <select
          id="food-verification"
          value={verificationStatus}
          onChange={(e) => onVerificationStatusChange(e.target.value)}
          className="input lg:w-36"
        >
          <option value="">All statuses</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="rejected">Rejected</option>
        </select>

        <label htmlFor="food-catalog" className="sr-only">Catalog type</label>
        <select
          id="food-catalog"
          value={customFilter}
          onChange={(e) =>
            onCustomFilterChange(e.target.value as 'all' | 'verified' | 'custom')
          }
          className="input lg:w-44"
        >
          <option value="all">All foods</option>
          <option value="verified">System catalog only</option>
          <option value="custom">User custom only</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-3 text-[13px] text-ink-300 hover:border-ink-600">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => onIncludeDeletedChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded"
          />
          Include deleted
        </label>

        {hasActiveFilters && (
          <button type="button" onClick={onResetFilters} title="Reset all filters" className="btn btn-ghost">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}

        <button type="submit" className="btn btn-secondary">
          <Search className="h-3.5 w-3.5" />
          Search
        </button>

        <button type="button" onClick={onOpenCreateModal} className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Add food
        </button>
      </div>
    </form>
  );
}

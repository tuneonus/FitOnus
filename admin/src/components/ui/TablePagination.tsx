import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Noun used in the range summary, e.g. "users". */
  itemLabel?: string;
  /** Optional rows-per-page selector. */
  limit?: number;
  limitOptions?: number[];
  onLimitChange?: (limit: number) => void;
  disabled?: boolean;
}

/** Shared table footer: range summary, rows-per-page selector and prev/next controls. */
export function TablePagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = 'results',
  limit,
  limitOptions = [10, 20, 50],
  onLimitChange,
  disabled = false,
}: TablePaginationProps) {
  const lastPage = Math.max(totalPages || 1, 1);
  const from = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  return (
    <div className="table-footer">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="tabular-nums">
          Showing <span className="font-medium text-ink-200">{from.toLocaleString()}</span>–
          <span className="font-medium text-ink-200">{to.toLocaleString()}</span> of{' '}
          <span className="font-medium text-ink-200">{total.toLocaleString()}</span> {itemLabel}
        </span>
        {onLimitChange && limit !== undefined && (
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="input h-8 w-[4.5rem] py-0 text-xs"
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav aria-label="Pagination" className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          className="btn btn-secondary btn-icon btn-sm"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[6.5rem] text-center tabular-nums text-ink-300">
          Page <span className="font-medium text-white">{page}</span> of {lastPage}
        </span>
        <button
          type="button"
          disabled={disabled || page >= lastPage}
          onClick={() => onPageChange(Math.min(page + 1, lastPage))}
          className="btn btn-secondary btn-icon btn-sm"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

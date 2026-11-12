'use client';

import React from 'react';
import { Calendar, Pencil, Trash2, Clock, Layers, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TablePagination } from '@/components/ui/TablePagination';
import type { WorkoutTemplate } from '../types';
import type { PaginationMeta } from '@/types';

interface WorkoutTemplatesTableProps {
  templates: WorkoutTemplate[];
  isLoading: boolean;
  error: string | null;
  meta: PaginationMeta;
  limit: number;
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  onEditTemplate: (template: WorkoutTemplate) => void;
  onDeleteTemplate: (template: WorkoutTemplate) => void;
  onOpenCreateModal: () => void;
}

export function WorkoutTemplatesTable({
  templates,
  isLoading,
  error,
  meta,
  limit,
  onLimitChange,
  onPageChange,
  onEditTemplate,
  onDeleteTemplate,
  onOpenCreateModal,
}: WorkoutTemplatesTableProps) {
  const getDifficultyVariant = (diff: string): 'completed' | 'pending' | 'disabled' => {
    switch (diff) {
      case 'beginner':
        return 'completed';
      case 'intermediate':
        return 'pending';
      case 'advanced':
        return 'disabled';
      default:
        return 'pending';
    }
  };

  return (
    <div className="table-shell">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading routines…" />
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">
          <ErrorState title="Couldn't load routines" message={error} compact />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          bare
          icon={<Calendar />}
          title="No curated routines yet"
          description="Create system-curated starter templates to help members get started quickly."
          action={
            <button type="button" onClick={onOpenCreateModal} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              Create first routine
            </button>
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col" className="pl-5">Routine</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Duration</th>
                <th scope="col">Exercises</th>
                <th scope="col">Tags</th>
                <th scope="col" className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id}>
                  <td className="pl-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="avatar h-9 w-9 text-ink-300">
                        <Layers className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="max-w-[280px] truncate font-medium text-white">{tpl.name}</p>
                        <p className="max-w-[280px] truncate text-xs text-ink-400">
                          {tpl.description || 'System starter routine'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge variant={getDifficultyVariant(tpl.difficulty)} size="sm">
                      {tpl.difficulty}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-ink-200">
                      <Clock className="h-3.5 w-3.5 text-ink-500" />
                      {tpl.estimatedDurationMinutes ? `${tpl.estimatedDurationMinutes} min` : '—'}
                    </span>
                  </td>
                  <td className="tabular-nums text-ink-200">
                    {tpl.exerciseCount} {tpl.exerciseCount === 1 ? 'exercise' : 'exercises'}
                  </td>
                  <td>
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {tpl.tags.length === 0 && <span className="text-ink-500">—</span>}
                      {tpl.tags.map((tag) => (
                        <span key={tag} className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEditTemplate(tpl)}
                        title="Edit routine"
                        aria-label={`Edit ${tpl.name}`}
                        className="btn btn-ghost btn-icon btn-sm"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(tpl)}
                        title="Delete routine"
                        aria-label={`Delete ${tpl.name}`}
                        className="btn btn-danger-ghost btn-icon btn-sm text-ink-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && templates.length > 0 && (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          pageSize={meta.limit || limit}
          onPageChange={onPageChange}
          itemLabel="routines"
          limit={limit}
          limitOptions={[10, 25]}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

'use client';

import React from 'react';
import {
  Calendar,
  Edit2,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading workout routines..." />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center">
          <EmptyState
            icon={<Calendar className="h-6 w-6" />}
            title="No curated workout routines yet"
            description="Create system-curated starter templates to help members get started quickly."
          />
          <button
            onClick={onOpenCreateModal}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-teal-500/20 transition-all"
          >
            Create First Routine
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider">Routine Name</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Difficulty</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Duration</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Exercises</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Tags</th>
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {templates.map((tpl) => (
                <tr
                  key={tpl.id}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-emerald-400 font-bold border border-slate-700/60">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{tpl.name}</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">
                          {tpl.description || 'System starter routine'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant={getDifficultyVariant(tpl.difficulty)} size="sm">
                      {tpl.difficulty}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {tpl.estimatedDurationMinutes ? `${tpl.estimatedDurationMinutes} mins` : '—'}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="rounded-md bg-slate-800 px-2.5 py-1 text-teal-300 font-semibold border border-slate-700/60">
                      {tpl.exerciseCount} exercises
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {tpl.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEditTemplate(tpl)}
                        title="Edit Template"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteTemplate(tpl)}
                        title="Delete Template"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
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

      {/* Pagination Footer */}
      {!isLoading && !error && templates.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 bg-slate-950/30 px-6 py-4">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Show</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="10">10</option>
              <option value="25">25</option>
            </select>
            <span>of {meta.total} routines</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(meta.page - 1)}
              disabled={meta.page <= 1}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-slate-400 px-2">
              Page {meta.page} of {meta.totalPages || 1}
            </span>
            <button
              onClick={() => onPageChange(meta.page + 1)}
              disabled={meta.page >= (meta.totalPages || 1)}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

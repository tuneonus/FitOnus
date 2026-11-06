'use client';

import React from 'react';
import {
  Dumbbell,
  Edit2,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Exercise } from '../types';
import type { PaginationMeta } from '@/types';

interface ExercisesTableProps {
  exercises: Exercise[];
  isLoading: boolean;
  error: string | null;
  meta: PaginationMeta;
  limit: number;
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (exercise: Exercise) => void;
}

export function ExercisesTable({
  exercises,
  isLoading,
  error,
  meta,
  limit,
  onLimitChange,
  onPageChange,
  onEditExercise,
  onDeleteExercise,
}: ExercisesTableProps) {
  const getDifficultyVariant = (diff: string): 'completed' | 'pending' | 'disabled' => {
    switch (diff) {
      case 'beginner':
        return 'completed'; // green/teal
      case 'intermediate':
        return 'pending'; // amber
      case 'advanced':
        return 'disabled'; // rose
      default:
        return 'pending';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading exercises catalog..." />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : exercises.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-6 w-6" />}
          title="No exercises match your criteria"
          description="Try adjusting your search query or filter settings to locate catalog exercises."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider">Exercise</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Category</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Primary Muscle</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Equipment</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Difficulty</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Type</th>
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {exercises.map((ex) => (
                <tr
                  key={ex.id}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-teal-400 font-bold border border-slate-700/60">
                        <Dumbbell className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{ex.name}</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">
                          {ex.description || 'No description provided'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 capitalize">
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-300 font-medium">
                      {ex.category}
                    </span>
                  </td>
                  <td className="py-4 px-4 capitalize font-medium text-slate-200">
                    {ex.primaryMuscle}
                  </td>
                  <td className="py-4 px-4 capitalize text-slate-400">
                    {ex.equipment}
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant={getDifficultyVariant(ex.difficulty)} size="sm">
                      {ex.difficulty}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                        ex.isCustom
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {ex.isCustom ? 'Custom' : 'System'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEditExercise(ex)}
                        title="Edit Exercise"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteExercise(ex)}
                        title="Delete Exercise"
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
      {!isLoading && !error && exercises.length > 0 && (
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
              <option value="50">50</option>
            </select>
            <span>of {meta.total} exercises</span>
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


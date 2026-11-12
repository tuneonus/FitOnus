'use client';

import React from 'react';
import { Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TablePagination } from '@/components/ui/TablePagination';
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

export const isProtectedExercise = (id: string): boolean => {
  return /^e0000000-0000-4000-8000-0000000000(0[1-9]|1[0-4])$/.test(id);
};

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
    <div className="table-shell">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading exercises…" />
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">
          <ErrorState title="Couldn't load exercises" message={error} compact />
        </div>
      ) : exercises.length === 0 ? (
        <EmptyState
          bare
          icon={<Dumbbell />}
          title="No exercises match your criteria"
          description="Try adjusting your search query or filter settings to locate catalog exercises."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th scope="col" className="pl-5">Exercise</th>
                <th scope="col">Category</th>
                <th scope="col">Primary muscle</th>
                <th scope="col">Equipment</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Type</th>
                <th scope="col" className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exercises.map((ex) => {
                const isCustom = ex.isCustom || !ex.isSystem;
                const isProtected = isProtectedExercise(ex.id);
                return (
                  <tr key={ex.id}>
                    <td className="pl-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="avatar h-9 w-9 text-ink-300">
                          <Dumbbell className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[280px] truncate font-medium text-white">{ex.name}</p>
                          <p className="max-w-[280px] truncate text-xs text-ink-400">
                            {ex.description || 'No description provided'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant="neutral" size="sm" plain>
                        {ex.category}
                      </Badge>
                    </td>
                    <td className="capitalize text-ink-100">
                      {ex.primaryMuscles && ex.primaryMuscles.length > 0
                        ? ex.primaryMuscles.join(', ')
                        : ex.primaryMuscle || '—'}
                    </td>
                    <td className="capitalize text-ink-300">{ex.equipment}</td>
                    <td>
                      <Badge variant={getDifficultyVariant(ex.difficulty)} size="sm">
                        {ex.difficulty}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={isCustom ? 'admin' : 'active'} size="sm" plain>
                          {isCustom ? 'Custom' : 'System'}
                        </Badge>
                        {ex.isCompound && (
                          <Badge variant="info" size="sm" plain>
                            Compound
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEditExercise(ex)}
                          title="Edit exercise"
                          aria-label={`Edit ${ex.name}`}
                          className="btn btn-ghost btn-icon btn-sm"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteExercise(ex)}
                          disabled={isProtected}
                          title={
                            isProtected
                              ? 'Foundational system exercises are protected and cannot be deleted'
                              : 'Delete exercise'
                          }
                          aria-label={isProtected ? `${ex.name} is protected` : `Delete ${ex.name}`}
                          className="btn btn-danger-ghost btn-icon btn-sm text-ink-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && exercises.length > 0 && (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          pageSize={meta.limit || limit}
          onPageChange={onPageChange}
          itemLabel="exercises"
          limit={limit}
          limitOptions={[10, 25, 50]}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { Utensils, Pencil, Trash2, Eye, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TablePagination } from '@/components/ui/TablePagination';
import type { AdminFood } from '../types';
import type { PaginationMeta } from '@/types';

interface FoodsTableProps {
  foods: AdminFood[];
  isLoading: boolean;
  error: string | null;
  meta: PaginationMeta;
  limit: number;
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  onViewDetails: (food: AdminFood) => void;
  onEditFood: (food: AdminFood) => void;
  onVerifyFood: (food: AdminFood) => void;
  onDeleteFood: (food: AdminFood) => void;
}

export function FoodsTable({
  foods,
  isLoading,
  error,
  meta,
  limit,
  onLimitChange,
  onPageChange,
  onViewDetails,
  onEditFood,
  onVerifyFood,
  onDeleteFood,
}: FoodsTableProps) {
  const getVerificationBadge = (status: string, isVerified: boolean) => {
    if (isVerified || status === 'verified') {
      return (
        <Badge variant="active" size="sm">
          Verified
        </Badge>
      );
    }
    if (status === 'rejected') {
      return (
        <Badge variant="disabled" size="sm">
          Rejected
        </Badge>
      );
    }
    return (
      <Badge variant="pending" size="sm">
        Unverified
      </Badge>
    );
  };

  const getSourceBadge = (source: string, sourceId: string | null) => {
    switch (source) {
      case 'usda_fdc':
        return (
          <span className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] ring-1 ring-inset bg-brand-500/10 text-brand-300 ring-brand-500/25">
            USDA {sourceId ? `#${sourceId}` : ''}
          </span>
        );
      case 'manufacturer_label':
        return (
          <span className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] ring-1 ring-inset bg-cyan-500/10 text-cyan-300 ring-cyan-500/25">
            Label {sourceId ? `#${sourceId}` : ''}
          </span>
        );
      case 'open_food_facts':
        return (
          <span className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] ring-1 ring-inset bg-amber-500/10 text-amber-300 ring-amber-500/25">
            OFF
          </span>
        );
      case 'user_custom':
        return (
          <span className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] ring-1 ring-inset bg-purple-500/10 text-purple-300 ring-purple-500/25">
            User Custom
          </span>
        );
      default:
        return (
          <span className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] ring-1 ring-inset bg-ink-800 text-ink-300 ring-ink-700">
            {source}
          </span>
        );
    }
  };

  return (
    <div className="table-shell">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading food catalog…" />
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">
          <ErrorState title="Couldn't load the food catalog" message={error} compact />
        </div>
      ) : foods.length === 0 ? (
        <EmptyState
          bare
          icon={<Utensils />}
          title="No food items found"
          description="Try adjusting your search query, source, or verification filters."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th scope="col" className="pl-5">Food item</th>
                <th scope="col">Serving</th>
                <th scope="col">Per 100 g</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col" className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {foods.map((food) => {
                const isDeleted = Boolean(food.deletedAt);
                return (
                  <tr key={food.id} className={isDeleted ? 'bg-rose-500/[0.03] opacity-70' : ''}>
                    <td className="pl-5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="max-w-[260px] truncate font-medium text-white">{food.name}</span>
                          {food.isCustom && (
                            <span title="Private custom food created by a user">
                              <Badge variant="admin" size="sm" plain>
                                <Lock className="h-3 w-3" />
                                Private
                              </Badge>
                            </span>
                          )}
                          {isDeleted && (
                            <Badge variant="disabled" size="sm">
                              Deleted
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-ink-400">
                          <span className={food.brand ? '' : 'text-ink-500'}>{food.brand || 'Generic'}</span>
                          {food.barcode && (
                            <span className="font-mono text-[11px] text-ink-500">UPC {food.barcode}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap text-ink-100">
                          {food.servingSize} {food.servingUnit}{' '}
                          <span className="text-ink-400">({food.servingWeightG} g)</span>
                        </span>
                        {food.servingVolumeMl && food.densityGPerMl && (
                          <span className="text-[11px] text-ink-400">
                            {food.servingVolumeMl} ml · ρ {food.densityGPerMl} g/ml
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold tabular-nums text-white">
                          {Math.round(food.referenceNutrients.calories)} kcal
                        </span>
                        <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-ink-400">
                          <span title="Protein">
                            <span className="text-ink-500">P</span> {food.referenceNutrients.proteinG}g
                          </span>
                          <span title="Carbohydrates">
                            <span className="text-ink-500">C</span> {food.referenceNutrients.carbohydratesG}g
                          </span>
                          <span title="Fat">
                            <span className="text-ink-500">F</span> {food.referenceNutrients.fatG}g
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-col items-start gap-1">
                        {getSourceBadge(food.dataSource, food.sourceId)}
                        <span className="text-[11px] text-ink-500">
                          {food.isCustom ? 'User tenant' : 'System global'}
                        </span>
                      </div>
                    </td>

                    <td>{getVerificationBadge(food.verificationStatus, food.isVerified)}</td>

                    <td className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onViewDetails(food)}
                          title="View nutrition details"
                          aria-label={`View details for ${food.name}`}
                          className="btn btn-ghost btn-icon btn-sm"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {!isDeleted && (
                          <button
                            type="button"
                            onClick={() => onEditFood(food)}
                            title="Edit food"
                            aria-label={`Edit ${food.name}`}
                            className="btn btn-ghost btn-icon btn-sm"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}

                        {/* Verification is disabled for private user custom foods */}
                        {!isDeleted &&
                          (food.isCustom ? (
                            <button
                              type="button"
                              disabled
                              title="Private custom foods cannot be promoted to the global catalog without explicit user consent."
                              aria-label="Verification unavailable for private custom foods"
                              className="btn btn-ghost btn-icon btn-sm"
                            >
                              <ShieldAlert className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onVerifyFood(food)}
                              title="Manage verification status"
                              aria-label={`Manage verification for ${food.name}`}
                              className="btn btn-ghost btn-icon btn-sm"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </button>
                          ))}

                        {!isDeleted && (
                          <button
                            type="button"
                            onClick={() => onDeleteFood(food)}
                            title="Delete food"
                            aria-label={`Delete ${food.name}`}
                            className="btn btn-danger-ghost btn-icon btn-sm text-ink-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && foods.length > 0 && (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          pageSize={meta.limit || limit}
          onPageChange={onPageChange}
          itemLabel="foods"
          limit={limit}
          limitOptions={[10, 25, 50]}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

'use client';

import React from 'react';
import {
  Utensils,
  Edit2,
  Trash2,
  Eye,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/50">
            USDA {sourceId ? `#${sourceId}` : ''}
          </span>
        );
      case 'manufacturer_label':
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
            Label {sourceId ? `#${sourceId}` : ''}
          </span>
        );
      case 'open_food_facts':
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
            OFF
          </span>
        );
      case 'user_custom':
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/50">
            User Custom
          </span>
        );
      default:
        return (
          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
            {source}
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading food catalog..." />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : foods.length === 0 ? (
        <EmptyState
          icon={<Utensils className="h-6 w-6" />}
          title="No food items found"
          description="Try adjusting your search query, source, or verification filters."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider">
                  Food Item
                </th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">
                  Serving Basis
                </th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">
                  Nutrients (per 100g)
                </th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">
                  Source Provenance
                </th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">
                  Status
                </th>
                <th className="py-3.5 px-6 text-right font-semibold uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {foods.map((food) => {
                const isDeleted = Boolean(food.deletedAt);
                return (
                  <tr
                    key={food.id}
                    className={`transition-colors hover:bg-slate-800/30 ${
                      isDeleted ? 'opacity-60 bg-rose-950/10' : ''
                    }`}
                  >
                    {/* Food Info */}
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {food.name}
                          </span>
                          {food.isCustom && (
                            <span
                              title="Private custom food created by a user"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-300 bg-purple-950/70 border border-purple-800/60 px-1.5 py-0.2 rounded"
                            >
                              <Lock className="h-2.5 w-2.5" />
                              Private
                            </span>
                          )}
                          {isDeleted && (
                            <Badge variant="disabled" size="sm">
                              Deleted
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                          {food.brand ? (
                            <span>{food.brand}</span>
                          ) : (
                            <span className="text-slate-600">Generic</span>
                          )}
                          {food.barcode && (
                            <span className="font-mono text-slate-500 text-[10px]">
                              UPC: {food.barcode}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Serving Info */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-0.5 text-slate-300">
                        <span className="font-medium">
                          {food.servingSize} {food.servingUnit} ({food.servingWeightG}g)
                        </span>
                        {food.servingVolumeMl && food.densityGPerMl && (
                          <span className="text-[10px] text-teal-400/80">
                            {food.servingVolumeMl}ml • ρ={food.densityGPerMl} g/ml
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Nutrients (Reference 100g) */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 text-[11px]">
                        <span className="font-bold text-teal-300">
                          {Math.round(food.referenceNutrients.calories)} kcal
                        </span>
                        <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
                          <span className="text-blue-300" title="Protein">
                            P: {food.referenceNutrients.proteinG}g
                          </span>
                          <span className="text-amber-300" title="Carbohydrates">
                            C: {food.referenceNutrients.carbohydratesG}g
                          </span>
                          <span className="text-rose-300" title="Fat">
                            F: {food.referenceNutrients.fatG}g
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Source Provenance */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        {getSourceBadge(food.dataSource, food.sourceId)}
                        <span className="text-[10px] text-slate-500">
                          {food.isCustom ? 'User Tenant' : 'System Global'}
                        </span>
                      </div>
                    </td>

                    {/* Status Badges */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {getVerificationBadge(
                          food.verificationStatus,
                          food.isVerified
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View Details */}
                        <button
                          onClick={() => onViewDetails(food)}
                          title="View Nutritional Details"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {/* Edit Food */}
                        {!isDeleted && (
                          <button
                            onClick={() => onEditFood(food)}
                            title="Edit Food Details"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-teal-300 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}

                        {/* Verification Action (Security check: Disabled for user custom foods) */}
                        {!isDeleted && (
                          food.isCustom ? (
                            <button
                              disabled
                              title="Security Notice: Cannot promote private custom foods to global catalog without explicit user consent."
                              className="rounded-lg p-1.5 text-slate-600 cursor-not-allowed opacity-50"
                            >
                              <ShieldAlert className="h-4 w-4 text-slate-600" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onVerifyFood(food)}
                              title="Manage Verification Status"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-emerald-300 transition-colors"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </button>
                          )
                        )}

                        {/* Delete Food */}
                        {!isDeleted && (
                          <button
                            onClick={() => onDeleteFood(food)}
                            title="Soft-Delete Food"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
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

      {/* Pagination Footer */}
      {!isLoading && !error && foods.length > 0 && (
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
            <span>of {meta.total} foods</span>
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


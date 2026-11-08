'use client';

import React, { useState } from 'react';
import {
  Utensils,
  CheckCircle,
  Lock,
  Droplets,
  AlertTriangle,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { FoodFilterBar } from './FoodFilterBar';
import { FoodsTable } from './FoodsTable';
import { FoodModal } from './FoodModal';
import { FoodDetailsModal } from './FoodDetailsModal';
import { FoodVerifyModal } from './FoodVerifyModal';
import { useNutritionStats } from '../hooks/useNutritionStats';
import { useNutritionFoods } from '../hooks/useNutritionFoods';
import { nutritionApi } from '../api';
import type {
  AdminFood,
  CreateFoodInput,
  UpdateFoodInput,
  VerifyFoodInput,
} from '../types';

export function NutritionAdminView() {
  const { toast } = useToast();

  // Stats Hook
  const { stats, refresh: refreshStats } = useNutritionStats();

  // Foods Catalog Hook
  const {
    foods,
    meta,
    search,
    setSearch,
    dataSource,
    setDataSource,
    verificationStatus,
    setVerificationStatus,
    customFilter,
    setCustomFilter,
    includeDeleted,
    setIncludeDeleted,
    setPage,
    limit,
    setLimit,
    isLoading: isLoadingFoods,
    isRefreshing: isRefreshingFoods,
    error: foodsError,
    refresh: refreshFoods,
    fetchFoods,
  } = useNutritionFoods();

  // Food Form Modal State (Create / Edit)
  const [isFoodModalOpen, setIsFoodModalOpen] = useState(false);
  const [foodToEdit, setFoodToEdit] = useState<AdminFood | null>(null);

  // Details Modal State
  const [foodForDetails, setFoodForDetails] = useState<AdminFood | null>(null);

  // Verification Modal State
  const [foodForVerify, setFoodForVerify] = useState<AdminFood | null>(null);

  // Soft-Delete Modal State
  const [foodToDelete, setFoodToDelete] = useState<AdminFood | null>(null);
  const [isDeletingFood, setIsDeletingFood] = useState(false);

  const handleRefreshAll = async () => {
    await Promise.all([refreshStats(), refreshFoods()]);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchFoods();
  };

  const handleResetFilters = () => {
    setSearch('');
    setDataSource('');
    setVerificationStatus('');
    setCustomFilter('all');
    setIncludeDeleted(false);
    setPage(1);
  };

  // Create Food Handler
  const handleOpenCreateFood = () => {
    setFoodToEdit(null);
    setIsFoodModalOpen(true);
  };

  // Edit Food Handler
  const handleOpenEditFood = (food: AdminFood) => {
    setFoodToEdit(food);
    setIsFoodModalOpen(true);
  };

  const handleSubmitFood = async (data: CreateFoodInput | UpdateFoodInput) => {
    try {
      if (foodToEdit) {
        await nutritionApi.updateFood(foodToEdit.id, data as UpdateFoodInput);
        toast.success(`Food "${data.name || foodToEdit.name}" updated successfully.`);
      } else {
        await nutritionApi.createFood(data as CreateFoodInput);
        toast.success(`Verified food "${data.name}" added to catalog.`);
      }
      await refreshFoods();
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save food.';
      toast.error(msg);
      throw err;
    }
  };

  // Details Handler
  const handleViewDetails = (food: AdminFood) => {
    setFoodForDetails(food);
  };

  // Verification Handler
  const handleOpenVerify = (food: AdminFood) => {
    setFoodForVerify(food);
  };

  const handleVerifySubmit = async (id: string, data: VerifyFoodInput) => {
    try {
      await nutritionApi.verifyFood(id, data);
      toast.success(`Food verification status updated to "${data.verificationStatus}".`);
      await refreshFoods();
      await refreshStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update verification status.';
      toast.error(msg);
      throw err;
    }
  };

  // Soft-Delete Handler
  const handleOpenDelete = (food: AdminFood) => {
    setFoodToDelete(food);
  };

  const handleDeleteConfirm = async () => {
    if (!foodToDelete) return;
    setIsDeletingFood(true);
    try {
      await nutritionApi.deleteFood(foodToDelete.id);
      toast.success(`Food "${foodToDelete.name}" soft-deleted. Historical meal snapshots preserved.`);
      setFoodToDelete(null);
      await refreshFoods();
      await refreshStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete food record.');
    } finally {
      setIsDeletingFood(false);
    }
  };

  return (
    <AdminLayout
      title="Nutrition & Food Catalog"
      subtitle="Manage verified system foods, physical serving contracts, and catalog statistics"
      onRefresh={handleRefreshAll}
      isRefreshing={isRefreshingFoods}
    >
      <div className="space-y-6">
        {/* Platform Nutrition KPI Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Verified Foods"
            value={stats ? stats.totalVerifiedFoods : '—'}
            subtitle="Global authoritative catalog"
            icon={<CheckCircle className="h-5 w-5" />}
            accent="teal"
          />

          <StatsCard
            title="Custom Foods"
            value={stats ? stats.totalCustomFoods : '—'}
            subtitle="User-scoped private entries"
            icon={<Lock className="h-5 w-5" />}
            accent="purple"
          />

          <StatsCard
            title="Meals Logged"
            value={stats ? stats.totalMealsLogged : '—'}
            subtitle={
              stats
                ? `${stats.totalMealItemsLogged} food items snapshot`
                : 'Aggregated meal logs'
            }
            icon={<Utensils className="h-5 w-5" />}
            accent="emerald"
          />

          <StatsCard
            title="Hydration Logs"
            value={stats ? stats.totalWaterLogs : '—'}
            subtitle="Total water entries logged"
            icon={<Droplets className="h-5 w-5" />}
            accent="cyan"
          />
        </div>

        {/* Filter and Action Bar */}
        <FoodFilterBar
          search={search}
          onSearchChange={setSearch}
          dataSource={dataSource}
          onDataSourceChange={(val) => {
            setDataSource(val);
            setPage(1);
          }}
          verificationStatus={verificationStatus}
          onVerificationStatusChange={(val) => {
            setVerificationStatus(val);
            setPage(1);
          }}
          customFilter={customFilter}
          onCustomFilterChange={(val) => {
            setCustomFilter(val);
            setPage(1);
          }}
          includeDeleted={includeDeleted}
          onIncludeDeletedChange={(val) => {
            setIncludeDeleted(val);
            setPage(1);
          }}
          onResetFilters={handleResetFilters}
          onSubmit={handleSearchSubmit}
          onOpenCreateModal={handleOpenCreateFood}
        />

        {/* Foods Catalog Table */}
        <FoodsTable
          foods={foods}
          isLoading={isLoadingFoods}
          error={foodsError}
          meta={meta}
          limit={limit}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
          onPageChange={setPage}
          onViewDetails={handleViewDetails}
          onEditFood={handleOpenEditFood}
          onVerifyFood={handleOpenVerify}
          onDeleteFood={handleOpenDelete}
        />

        {/* Create / Edit Food Modal */}
        {isFoodModalOpen && (
          <FoodModal
            isOpen={isFoodModalOpen}
            onClose={() => {
              setIsFoodModalOpen(false);
              setFoodToEdit(null);
            }}
            food={foodToEdit}
            onSubmit={handleSubmitFood}
          />
        )}

        {/* Food Details Modal */}
        {foodForDetails && (
          <FoodDetailsModal
            isOpen={Boolean(foodForDetails)}
            onClose={() => setFoodForDetails(null)}
            food={foodForDetails}
          />
        )}

        {/* Food Verification Modal */}
        {foodForVerify && (
          <FoodVerifyModal
            isOpen={Boolean(foodForVerify)}
            onClose={() => setFoodForVerify(null)}
            food={foodForVerify}
            onSubmit={handleVerifySubmit}
          />
        )}

        {/* Soft-Delete Confirmation Modal */}
        {foodToDelete && (
          <Modal
            isOpen={Boolean(foodToDelete)}
            onClose={() => setFoodToDelete(null)}
            title="Soft-Delete Food Item"
            description="Are you sure you want to delete this food item from the catalog?"
            maxWidth="sm"
          >
            <div className="space-y-4 text-xs">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 flex items-start gap-2 text-rose-300">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Deleting <strong>{foodToDelete.name}</strong> will remove it from active catalog search results. Historical meals already containing this food will preserve their frozen nutrition snapshot.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setFoodToDelete(null)}
                  disabled={isDeletingFood}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeletingFood}
                  className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 font-semibold text-white shadow-md shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {isDeletingFood ? 'Deleting...' : 'Confirm Soft-Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminLayout>
  );
}

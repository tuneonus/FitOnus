'use client';

import React, { useState } from 'react';
import { Utensils, CheckCircle, Lock, Droplets } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
      title="Nutrition"
      subtitle="Manage the verified food catalog, serving definitions and nutrition logging statistics."
      onRefresh={handleRefreshAll}
      isRefreshing={isRefreshingFoods}
    >
      <div className="space-y-6">
        <section aria-label="Nutrition metrics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4 sm:gap-4">
          <StatsCard
            title="Verified foods"
            value={stats ? stats.totalVerifiedFoods : '—'}
            subtitle="Global authoritative catalog"
            icon={<CheckCircle />}
            accent="teal"
          />

          <StatsCard
            title="Custom foods"
            value={stats ? stats.totalCustomFoods : '—'}
            subtitle="User-scoped private entries"
            icon={<Lock />}
            accent="purple"
          />

          <StatsCard
            title="Meals logged"
            value={stats ? stats.totalMealsLogged : '—'}
            subtitle={
              stats
                ? `${stats.totalMealItemsLogged.toLocaleString()} food items logged`
                : 'Aggregated meal logs'
            }
            icon={<Utensils />}
            accent="emerald"
          />

          <StatsCard
            title="Hydration logs"
            value={stats ? stats.totalWaterLogs : '—'}
            subtitle="Total water entries logged"
            icon={<Droplets />}
            accent="cyan"
          />
        </section>

        <div className="space-y-4">

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
        </div>

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
          <ConfirmDialog
            isOpen={Boolean(foodToDelete)}
            onClose={() => setFoodToDelete(null)}
            onConfirm={handleDeleteConfirm}
            isBusy={isDeletingFood}
            title="Delete food item?"
            description="The item is soft-deleted from the catalog."
            confirmLabel="Delete food"
            busyLabel="Deleting…"
          >
            Deleting <strong className="font-semibold text-white">{foodToDelete.name}</strong> removes it
            from catalog search results. Historical meals that contain this food keep their frozen
            nutrition snapshot.
          </ConfirmDialog>
        )}
      </div>
    </AdminLayout>
  );
}

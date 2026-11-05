'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { UsersFilterBar } from './UsersFilterBar';
import { UsersTable } from './UsersTable';
import { UserStatusActionModal } from './UserStatusActionModal';
import { UserDetailModal, useUserDetail } from '@/features/profiles';
import { useUsers } from '../hooks/useUsers';
import { usersApi } from '../api';
import { ApiError } from '@/lib/api-client';
import type { AdminUserListItem } from '../types';

export function UsersView() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const {
    users,
    meta,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    onboardingFilter,
    setOnboardingFilter,
    roleFilter,
    setRoleFilter,
    setPage,
    limit,
    setLimit,
    isLoading,
    isRefreshing,
    error,
    refresh,
    fetchUsers,
  } = useUsers(initialSearch);

  // User details modal state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const {
    userDetail,
    isLoading: isLoadingDetail,
    refresh: refreshDetail,
  } = useUserDetail(selectedUserId);

  // Suspend / Reactivate action modal state
  const [actionTargetUser, setActionTargetUser] = useState<AdminUserListItem | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'reactivate' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleOpenActionModal = (
    user: AdminUserListItem,
    type: 'suspend' | 'reactivate'
  ) => {
    setActionTargetUser(user);
    setActionType(type);
    setActionReason('');
    setActionError(null);
  };

  const handleExecuteStatusChange = async () => {
    if (!actionTargetUser || !actionType) return;
    setIsSubmittingAction(true);
    setActionError(null);

    try {
      if (actionType === 'suspend') {
        await usersApi.suspendUser(actionTargetUser.id, actionReason);
      } else {
        await usersApi.reactivateUser(actionTargetUser.id, actionReason);
      }

      // Close modal and refresh list
      setActionTargetUser(null);
      setActionType(null);
      await fetchUsers();

      // If detail modal is open for this user, refresh it too
      if (selectedUserId === actionTargetUser.id) {
        await refreshDetail();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Failed to change user status.');
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <AdminLayout
      title="User Directory"
      subtitle="Manage user accounts, roles, suspensions, and onboarding status"
      onRefresh={refresh}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-6">
        <UsersFilterBar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
          onboardingFilter={onboardingFilter}
          onOnboardingFilterChange={(val) => {
            setOnboardingFilter(val);
            setPage(1);
          }}
          roleFilter={roleFilter}
          onRoleFilterChange={(val) => {
            setRoleFilter(val);
            setPage(1);
          }}
          onSubmit={handleSearchSubmit}
        />

        <UsersTable
          users={users}
          isLoading={isLoading}
          error={error}
          meta={meta}
          limit={limit}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
          onPageChange={setPage}
          onSelectUser={(userId) => setSelectedUserId(userId)}
          onOpenActionModal={handleOpenActionModal}
        />
      </div>

      <UserDetailModal
        isOpen={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        userDetail={userDetail}
        isLoading={isLoadingDetail}
      />

      <UserStatusActionModal
        targetUser={actionTargetUser}
        actionType={actionType}
        reason={actionReason}
        onReasonChange={setActionReason}
        isSubmitting={isSubmittingAction}
        error={actionError}
        onClose={() => setActionTargetUser(null)}
        onConfirm={handleExecuteStatusChange}
      />
    </AdminLayout>
  );
}

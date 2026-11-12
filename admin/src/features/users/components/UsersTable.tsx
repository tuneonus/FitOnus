'use client';

import React from 'react';
import { Users, Eye, UserCheck, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TablePagination } from '@/components/ui/TablePagination';
import type { AdminUserListItem } from '../types';
import type { PaginationMeta } from '@/types';

interface UsersTableProps {
  users: AdminUserListItem[];
  isLoading: boolean;
  error: string | null;
  meta: PaginationMeta;
  limit: number;
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  onSelectUser: (userId: string) => void;
  onOpenActionModal: (user: AdminUserListItem, type: 'suspend' | 'reactivate') => void;
}

export function UsersTable({
  users,
  isLoading,
  error,
  meta,
  limit,
  onLimitChange,
  onPageChange,
  onSelectUser,
  onOpenActionModal,
}: UsersTableProps) {
  return (
    <div className="table-shell">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading users…" />
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">
          <ErrorState title="Couldn't load users" message={error} compact />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          bare
          icon={<Users />}
          title="No users match your criteria"
          description="Try adjusting your search query or filter settings to locate member accounts."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th scope="col" className="pl-5">User</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Onboarding</th>
                <th scope="col">Registered</th>
                <th scope="col" className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="pl-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="avatar h-9 w-9 text-xs">
                        {u.displayName ? u.displayName.slice(0, 2).toUpperCase() : 'US'}
                      </span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectUser(u.id)}
                          className="max-w-[260px] truncate text-left font-medium text-white hover:text-brand-400"
                        >
                          {u.displayName}
                        </button>
                        <p className="max-w-[260px] truncate text-xs text-ink-400">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  <td>
                    <Badge variant={u.role === 'admin' ? 'admin' : 'member'} size="sm">
                      {u.role}
                    </Badge>
                  </td>

                  <td>
                    <Badge variant={u.status === 'active' ? 'active' : 'disabled'} size="sm">
                      {u.status === 'active' ? 'Active' : 'Suspended'}
                    </Badge>
                  </td>

                  <td>
                    <Badge variant={u.onboardingCompleted ? 'completed' : 'pending'} size="sm">
                      {u.onboardingCompleted
                        ? 'Completed'
                        : u.currentOnboardingStep
                          ? `Step: ${u.currentOnboardingStep}`
                          : 'Pending'}
                    </Badge>
                  </td>

                  <td className="whitespace-nowrap text-ink-400">
                    {new Date(u.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>

                  <td className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectUser(u.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Details
                      </button>

                      {u.role !== 'admin' &&
                        (u.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => onOpenActionModal(u, 'suspend')}
                            className="btn btn-danger-ghost btn-sm"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenActionModal(u, 'reactivate')}
                            className="btn btn-sm text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Reactivate
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          pageSize={meta.limit}
          onPageChange={onPageChange}
          itemLabel="users"
          limit={limit}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

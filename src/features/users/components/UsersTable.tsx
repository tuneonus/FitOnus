'use client';

import React from 'react';
import {
  Users,
  Eye,
  UserCheck,
  UserX,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading users from PostgreSQL..." />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No users match your criteria"
          description="Try adjusting your search query or filter settings to locate member accounts."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider">User</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Role</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Status</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Onboarding</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Registered</th>
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/25 transition-colors">
                  {/* User Info */}
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-teal-300 font-bold text-xs">
                        {u.displayName ? u.displayName.slice(0, 2).toUpperCase() : 'US'}
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-white">{u.displayName}</p>
                        <p className="text-[11px] text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="py-3.5 px-4">
                    <Badge variant={u.role === 'admin' ? 'admin' : 'member'} size="sm">
                      {u.role}
                    </Badge>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    <Badge variant={u.status === 'active' ? 'active' : 'disabled'} size="sm">
                      {u.status === 'active' ? 'Active' : 'Suspended'}
                    </Badge>
                  </td>

                  {/* Onboarding */}
                  <td className="py-3.5 px-4">
                    <Badge
                      variant={u.onboardingCompleted ? 'completed' : 'pending'}
                      size="sm"
                    >
                      {u.onboardingCompleted
                        ? 'Completed'
                        : u.currentOnboardingStep
                        ? `Step: ${u.currentOnboardingStep}`
                        : 'Pending'}
                    </Badge>
                  </td>

                  {/* Created */}
                  <td className="py-3.5 px-4 text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onSelectUser(u.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 border border-slate-700/60 transition-colors"
                      >
                        <Eye className="h-3 w-3 text-teal-400" />
                        <span>Details</span>
                      </button>

                      {u.role !== 'admin' && (
                        u.status === 'active' ? (
                          <button
                            onClick={() => onOpenActionModal(u, 'suspend')}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 text-[11px] font-medium text-rose-400 border border-rose-500/20 transition-colors"
                          >
                            <UserX className="h-3 w-3" />
                            <span>Suspend</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenActionModal(u, 'reactivate')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-400 border border-emerald-500/20 transition-colors"
                          >
                            <UserCheck className="h-3 w-3" />
                            <span>Reactivate</span>
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {!isLoading && users.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 px-6 py-4 bg-slate-950/30 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Showing {Math.min((meta.page - 1) * meta.limit + 1, meta.total)} to{' '}
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} users
            </span>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1">
              <span>Show</span>
              <select
                value={limit}
                onChange={(e) => onLimitChange(Number(e.target.value))}
                className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-xs text-slate-300"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => onPageChange(Math.max(meta.page - 1, 1))}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-white px-2">
              Page {meta.page} of {meta.totalPages || 1}
            </span>
            <button
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(Math.min(meta.page + 1, meta.totalPages))}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


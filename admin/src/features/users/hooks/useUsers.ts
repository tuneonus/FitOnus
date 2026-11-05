'use client';

import { useState, useCallback, useEffect } from 'react';
import { usersApi } from '../api';
import type { AdminUserListItem } from '../types';
import type { PaginationMeta } from '@/types';

export function useUsers(initialSearch: string = '') {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<'active' | 'disabled' | ''>('');
  const [onboardingFilter, setOnboardingFilter] = useState<'completed' | 'pending' | ''>('');
  const [roleFilter, setRoleFilter] = useState<'admin' | 'member' | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const res = await usersApi.listUsers({
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        onboarding: onboardingFilter || undefined,
        role: roleFilter || undefined,
      });

      setUsers(res.users);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user list.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit, search, statusFilter, onboardingFilter, roleFilter]);

  useEffect(() => {
    let isMounted = true;
    usersApi
      .listUsers({
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        onboarding: onboardingFilter || undefined,
        role: roleFilter || undefined,
      })
      .then((res) => {
        if (isMounted) {
          setUsers(res.users);
          if (res.meta) setMeta(res.meta);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch user list.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [page, limit, search, statusFilter, onboardingFilter, roleFilter]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchUsers();
  }, [fetchUsers]);

  return {
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
    page,
    setPage,
    limit,
    setLimit,
    isLoading,
    isRefreshing,
    error,
    refresh,
    fetchUsers,
  };
}


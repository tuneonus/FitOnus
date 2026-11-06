'use client';

import { useState, useCallback, useEffect } from 'react';
import { nutritionApi } from '../api';
import type { AdminFood } from '../types';
import type { PaginationMeta } from '@/types';

export function useNutritionFoods(initialSearch: string = '') {
  const [foods, setFoods] = useState<AdminFood[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState(initialSearch);
  const [dataSource, setDataSource] = useState<string>('');
  const [verificationStatus, setVerificationStatus] = useState<string>('');
  const [customFilter, setCustomFilter] = useState<'all' | 'verified' | 'custom'>('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomParam =
    customFilter === 'verified' ? false : customFilter === 'custom' ? true : undefined;

  const fetchFoods = useCallback(async () => {
    try {
      setError(null);
      const res = await nutritionApi.listFoods({
        page,
        limit,
        q: search.trim() || undefined,
        dataSource: dataSource || undefined,
        verificationStatus: verificationStatus || undefined,
        isCustom: isCustomParam,
        includeDeleted,
      });

      setFoods(res.foods);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch food catalog.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit, search, dataSource, verificationStatus, isCustomParam, includeDeleted]);

  useEffect(() => {
    let isMounted = true;
    nutritionApi
      .listFoods({
        page,
        limit,
        q: search.trim() || undefined,
        dataSource: dataSource || undefined,
        verificationStatus: verificationStatus || undefined,
        isCustom: isCustomParam,
        includeDeleted,
      })
      .then((res) => {
        if (isMounted) {
          setFoods(res.foods);
          if (res.meta) setMeta(res.meta);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch food catalog.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [page, limit, search, dataSource, verificationStatus, isCustomParam, includeDeleted]);

  const refresh = async () => {
    setIsRefreshing(true);
    await fetchFoods();
  };

  return {
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
    page,
    setPage,
    limit,
    setLimit,
    isLoading,
    isRefreshing,
    error,
    refresh,
    fetchFoods,
  };
}


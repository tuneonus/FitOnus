'use client';

import { useState, useCallback, useEffect } from 'react';
import { workoutsApi } from '../api';
import type { WorkoutTemplate } from '../types';
import type { PaginationMeta } from '@/types';

export function useWorkoutTemplates() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setError(null);
      const res = await workoutsApi.listTemplates({ page, limit });
      setTemplates(res.templates);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workout templates.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit]);

  useEffect(() => {
    let isMounted = true;
    workoutsApi
      .listTemplates({ page, limit })
      .then((res) => {
        if (isMounted) {
          setTemplates(res.templates);
          if (res.meta) setMeta(res.meta);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch workout templates.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [page, limit]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    meta,
    page,
    setPage,
    limit,
    setLimit,
    isLoading,
    isRefreshing,
    error,
    refresh,
    fetchTemplates,
  };
}

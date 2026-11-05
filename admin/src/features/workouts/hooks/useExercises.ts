'use client';

import { useState, useCallback, useEffect } from 'react';
import { workoutsApi } from '../api';
import type { Exercise } from '../types';
import type { PaginationMeta } from '@/types';

export function useExercises(initialSearch: string = '') {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState(initialSearch);
  const [muscle, setMuscle] = useState('');
  const [category, setCategory] = useState('');
  const [equipment, setEquipment] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExercises = useCallback(async () => {
    try {
      setError(null);
      const res = await workoutsApi.listExercises({
        page,
        limit,
        search: search.trim() || undefined,
        muscle: muscle || undefined,
        category: category || undefined,
        equipment: equipment || undefined,
        difficulty: difficulty || undefined,
      });

      setExercises(res.exercises);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch exercise catalog.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit, search, muscle, category, equipment, difficulty]);

  useEffect(() => {
    let isMounted = true;
    workoutsApi
      .listExercises({
        page,
        limit,
        search: search.trim() || undefined,
        muscle: muscle || undefined,
        category: category || undefined,
        equipment: equipment || undefined,
        difficulty: difficulty || undefined,
      })
      .then((res) => {
        if (isMounted) {
          setExercises(res.exercises);
          if (res.meta) setMeta(res.meta);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch exercise catalog.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [page, limit, search, muscle, category, equipment, difficulty]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchExercises();
  }, [fetchExercises]);

  return {
    exercises,
    meta,
    search,
    setSearch,
    muscle,
    setMuscle,
    category,
    setCategory,
    equipment,
    setEquipment,
    difficulty,
    setDifficulty,
    page,
    setPage,
    limit,
    setLimit,
    isLoading,
    isRefreshing,
    error,
    refresh,
    fetchExercises,
  };
}

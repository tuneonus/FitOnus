'use client';

import { useState, useCallback, useEffect } from 'react';
import { nutritionApi } from '../api';
import type { NutritionCatalogStats } from '../types';

export function useNutritionStats() {
  const [stats, setStats] = useState<NutritionCatalogStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const data = await nutritionApi.getStats();
      setStats(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch nutrition statistics.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    nutritionApi
      .getStats()
      .then((data) => {
        if (isMounted) {
          setStats(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch nutrition statistics.'
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
  };
}


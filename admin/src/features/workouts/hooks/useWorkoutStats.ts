'use client';

import { useState, useCallback, useEffect } from 'react';
import { workoutsApi } from '../api';
import type { WorkoutStats } from '../types';

export function useWorkoutStats() {
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const data = await workoutsApi.getWorkoutStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workout statistics.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    workoutsApi
      .getWorkoutStats()
      .then((data) => {
        if (isMounted) {
          setStats(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch workout statistics.');
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

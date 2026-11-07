'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { challengesApi } from '../api';
import type { Challenge, ChallengeCadence, ChallengeStatus, ListChallengesQuery } from '../types';

export function useChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChallengeStatus | ''>('');
  const [cadenceFilter, setCadenceFilter] = useState<ChallengeCadence | ''>('');
  const inFlightRef = useRef(false);

  const fetchChallenges = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!opts.silent) setError(null);

      try {
        const params: ListChallengesQuery = {};
        if (statusFilter) params.status = statusFilter;
        if (cadenceFilter) params.cadence = cadenceFilter;
        const data = await challengesApi.listChallenges(params);
        setChallenges(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load challenges.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [statusFilter, cadenceFilter],
  );

  useEffect(() => {
    setIsLoading(true);
    fetchChallenges();
  }, [fetchChallenges]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchChallenges({ silent: true });
  }, [fetchChallenges]);

  // Derived stats
  const stats = {
    total: challenges.length,
    published: challenges.filter((c) => c.status === 'published').length,
    draft: challenges.filter((c) => c.status === 'draft').length,
    archived: challenges.filter((c) => c.status === 'archived').length,
  };

  return {
    challenges,
    isLoading,
    isRefreshing,
    error,
    statusFilter,
    setStatusFilter,
    cadenceFilter,
    setCadenceFilter,
    refresh,
    fetchChallenges,
    stats,
  };
}


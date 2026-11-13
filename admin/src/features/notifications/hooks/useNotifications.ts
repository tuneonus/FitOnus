'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../api';
import { isInFlight } from '../logic';
import type { CampaignStatus, NotificationCampaign } from '../types';

const POLL_MS = 5_000;

/** Campaign list with paging and a status filter. Rows that are still changing refresh themselves. */
export function useNotifications() {
  const [items, setItems] = useState<NotificationCampaign[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignore responses from a request that has since been superseded (filter/page changed).
  const requestId = useRef(0);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const id = ++requestId.current;
      if (!opts.silent) setIsRefreshing(true);
      try {
        const result = await notificationsApi.list({ page, limit, ...(status ? { status } : {}) });
        if (id !== requestId.current) return;
        setItems(result.items);
        setTotal(result.meta?.total ?? result.items.length);
        setTotalPages(result.meta?.totalPages ?? 1);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        if (!opts.silent) setError(err instanceof Error ? err.message : 'Failed to load notifications.');
      } finally {
        if (id === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [page, limit, status],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial/refetch on filter change
    void load();
  }, [load]);

  const hasInFlight = items.some((item) => isInFlight(item.status));
  useEffect(() => {
    if (!hasInFlight) return;
    const timer = setInterval(() => void load({ silent: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [hasInFlight, load]);

  const changeStatus = useCallback((next: CampaignStatus | '') => {
    setStatus(next);
    setPage(1);
  }, []);

  const changeLimit = useCallback((next: number) => {
    setLimit(next);
    setPage(1);
  }, []);

  return {
    items,
    page,
    setPage,
    limit,
    changeLimit,
    status,
    changeStatus,
    total,
    totalPages,
    isLoading,
    isRefreshing,
    error,
    refresh: () => load(),
  };
}

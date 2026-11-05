'use client';

import { useState, useCallback, useEffect } from 'react';
import { auditLogsApi } from '../api';
import type { AuditLogItem } from '../types';
import type { PaginationMeta } from '@/types';

export function useAuditLogs(initialLimit: number = 15) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: initialLimit,
    total: 0,
    totalPages: 1,
  });

  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = initialLimit;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const res = await auditLogsApi.listAuditLogs({
        page,
        limit,
        action: actionFilter || undefined,
      });

      setLogs(res.logs);
      if (res.meta) {
        setMeta(res.meta);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch audit log trail.'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit, actionFilter]);

  useEffect(() => {
    let isMounted = true;
    auditLogsApi
      .listAuditLogs({
        page,
        limit,
        action: actionFilter || undefined,
      })
      .then((res) => {
        if (isMounted) {
          setLogs(res.logs);
          if (res.meta) setMeta(res.meta);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch audit log trail.'
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [page, limit, actionFilter]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    meta,
    actionFilter,
    setActionFilter,
    page,
    setPage,
    limit,
    isLoading,
    isRefreshing,
    error,
    refresh,
    fetchLogs,
  };
}


'use client';

import React from 'react';
import { ScrollText, Eye } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TablePagination } from '@/components/ui/TablePagination';
import { AuditLogActionBadge } from './AuditLogActionBadge';
import type { AuditLogItem } from '../types';
import type { PaginationMeta } from '@/types';

interface AuditLogsTableProps {
  logs: AuditLogItem[];
  isLoading: boolean;
  error: string | null;
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onSelectLog: (log: AuditLogItem) => void;
}

export function AuditLogsTable({
  logs,
  isLoading,
  error,
  meta,
  onPageChange,
  onSelectLog,
}: AuditLogsTableProps) {
  return (
    <div className="table-shell">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading audit logs…" />
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">
          <ErrorState title="Couldn't load audit logs" message={error} compact />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          bare
          icon={<ScrollText />}
          title="No audit events found"
          description="Actions performed by administrators (logins, suspensions, reactivations) will appear here."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[920px]">
            <thead>
              <tr>
                <th scope="col" className="pl-5">Timestamp</th>
                <th scope="col">Action</th>
                <th scope="col">Admin</th>
                <th scope="col">Target</th>
                <th scope="col">Origin</th>
                <th scope="col" className="pr-5 text-right">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap pl-5">
                    <p className="font-medium tabular-nums text-white">
                      {new Date(log.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs tabular-nums text-ink-400">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </p>
                  </td>

                  <td>
                    <AuditLogActionBadge action={log.action} />
                  </td>

                  <td>
                    <p className="max-w-[200px] truncate font-medium text-white">{log.adminName || 'Admin'}</p>
                    <p className="max-w-[200px] truncate text-xs text-ink-400">{log.adminEmail || log.adminId}</p>
                  </td>

                  <td>
                    {log.targetUserId ? (
                      <>
                        <p className="max-w-[200px] truncate text-ink-100">
                          {log.targetUserEmail || 'Member account'}
                        </p>
                        <p className="max-w-[160px] truncate font-mono text-[11px] text-ink-500">
                          {log.targetUserId}
                        </p>
                      </>
                    ) : (
                      <span className="text-ink-500">Self / platform</span>
                    )}
                  </td>

                  <td>
                    <p className="font-mono text-xs text-ink-300">{log.ipAddress || 'Internal'}</p>
                    <p className="max-w-[180px] truncate text-[11px] text-ink-500" title={log.userAgent || undefined}>
                      {log.userAgent || 'API'}
                    </p>
                  </td>

                  <td className="pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectLog(log)}
                      className="btn btn-secondary btn-sm"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && logs.length > 0 && (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          pageSize={meta.limit}
          onPageChange={onPageChange}
          itemLabel="events"
        />
      )}
    </div>
  );
}

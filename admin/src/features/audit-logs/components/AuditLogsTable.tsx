'use client';

import React from 'react';
import {
  ScrollText,
  Eye,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {isLoading ? (
        <div className="flex h-80 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading audit trail from Neon PostgreSQL..." />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="No audit events found"
          description="Actions performed by administrators (logins, suspensions, reactivations) will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider">Timestamp</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Action</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Admin</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Target User</th>
                <th className="py-3.5 px-4 font-semibold uppercase tracking-wider">Origin</th>
                <th className="py-3.5 px-6 font-semibold uppercase tracking-wider text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/25 transition-colors">
                  {/* Timestamp */}
                  <td className="py-3.5 px-6 text-slate-300">
                    <div>
                      <p className="font-semibold text-white">
                        {new Date(log.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4">
                    <AuditLogActionBadge action={log.action} />
                  </td>

                  {/* Admin */}
                  <td className="py-3.5 px-4">
                    <div>
                      <p className="font-semibold text-white">
                        {log.adminName || 'Admin'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {log.adminEmail || log.adminId}
                      </p>
                    </div>
                  </td>

                  {/* Target User */}
                  <td className="py-3.5 px-4">
                    {log.targetUserId ? (
                      <div>
                        <p className="font-medium text-slate-200">
                          {log.targetUserEmail || 'Member Account'}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate max-w-[150px]">
                          {log.targetUserId}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">Self / Platform</span>
                    )}
                  </td>

                  {/* Origin */}
                  <td className="py-3.5 px-4 text-slate-400">
                    <div>
                      <p className="font-mono text-[11px] text-slate-300">
                        {log.ipAddress || 'Internal'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[160px]">
                        {log.userAgent || 'API'}
                      </p>
                    </div>
                  </td>

                  {/* View Button */}
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={() => onSelectLog(log)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-200 border border-slate-700/60 transition-colors"
                    >
                      <Eye className="h-3 w-3 text-teal-400" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && logs.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 px-6 py-4 bg-slate-950/30 text-xs text-slate-400">
          <div>
            Showing {(meta.page - 1) * meta.limit + 1} to{' '}
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} events
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => onPageChange(Math.max(meta.page - 1, 1))}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-white px-2">
              Page {meta.page} of {meta.totalPages || 1}
            </span>
            <button
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(Math.min(meta.page + 1, meta.totalPages))}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


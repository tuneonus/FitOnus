'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuditLogsFilterBar } from './AuditLogsFilterBar';
import { AuditLogsTable } from './AuditLogsTable';
import { AuditLogDetailModal } from './AuditLogDetailModal';
import { useAuditLogs } from '../hooks/useAuditLogs';
import type { AuditLogItem } from '../types';

export function AuditLogsView() {
  const {
    logs,
    meta,
    actionFilter,
    setActionFilter,
    setPage,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useAuditLogs();

  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  return (
    <AdminLayout
      title="Audit Trail"
      subtitle="Immutable security log of administrative actions, logins, and status changes"
      onRefresh={refresh}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-6">
        <AuditLogsFilterBar
          actionFilter={actionFilter}
          onActionFilterChange={(val) => {
            setActionFilter(val);
            setPage(1);
          }}
          totalEvents={meta.total}
        />

        <AuditLogsTable
          logs={logs}
          isLoading={isLoading}
          error={error}
          meta={meta}
          onPageChange={setPage}
          onSelectLog={setSelectedLog}
        />
      </div>

      <AuditLogDetailModal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        log={selectedLog}
      />
    </AdminLayout>
  );
}

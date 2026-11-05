import { Suspense } from 'react';
import { AuditLogsView } from '@/features/audit-logs';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AuditLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <LoadingSpinner size="lg" label="Loading Audit Trail..." />
        </div>
      }
    >
      <AuditLogsView />
    </Suspense>
  );
}

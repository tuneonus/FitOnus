import { Suspense } from 'react';
import { NotificationsAdminView } from '@/features/notifications';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-950">
          <LoadingSpinner size="lg" label="Loading notifications…" />
        </div>
      }
    >
      <NotificationsAdminView />
    </Suspense>
  );
}

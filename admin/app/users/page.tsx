import { Suspense } from 'react';
import { UsersView } from '@/features/users';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <LoadingSpinner size="lg" label="Loading Users..." />
        </div>
      }
    >
      <UsersView />
    </Suspense>
  );
}

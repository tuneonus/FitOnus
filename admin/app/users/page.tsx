import { Suspense } from 'react';
import { UsersView } from '@/features/users';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-950">
          <LoadingSpinner size="lg" label="Loading users…" />
        </div>
      }
    >
      <UsersView />
    </Suspense>
  );
}

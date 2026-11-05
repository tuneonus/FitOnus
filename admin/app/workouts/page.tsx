import { Suspense } from 'react';
import { WorkoutsAdminView } from '@/features/workouts';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function WorkoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <LoadingSpinner size="lg" label="Loading Workouts..." />
        </div>
      }
    >
      <WorkoutsAdminView />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { NutritionAdminView } from '@/features/nutrition';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function NutritionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-950">
          <LoadingSpinner size="lg" label="Loading nutrition…" />
        </div>
      }
    >
      <NutritionAdminView />
    </Suspense>
  );
}


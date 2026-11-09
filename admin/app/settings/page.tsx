import { Suspense } from 'react';
import { AppSettingsView } from '@/features/settings';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <LoadingSpinner size="lg" label="Loading FitOnus Settings..." />
        </div>
      }
    >
      <AppSettingsView />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { ChallengesAdminView } from '@/features/challenges';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ChallengesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-950">
          <LoadingSpinner size="lg" label="Loading challenges…" />
        </div>
      }
    >
      <ChallengesAdminView />
    </Suspense>
  );
}


import { Suspense } from 'react';
import { KnowledgeAdminView } from '@/features/knowledge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function KnowledgePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-950">
          <LoadingSpinner size="lg" label="Loading Knowledge Base…" />
        </div>
      }
    >
      <KnowledgeAdminView />
    </Suspense>
  );
}


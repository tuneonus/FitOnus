'use client';

import React, { useEffect } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log to an error reporting service
    console.error('Unhandled Admin Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <ErrorState
          title="Something went wrong"
          message="An unexpected error occurred while rendering this page. You can try reloading the section."
          onRetry={() => reset()}
          retryLabel="Try again"
        />
      </div>
    </div>
  );
}

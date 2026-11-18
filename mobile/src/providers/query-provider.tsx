import {
  focusManager,
  QueryClient,
  QueryClientProvider as TanStackQueryClientProvider,
} from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { useAuthStore } from '../features/auth/stores/auth-store';

let native: typeof import('react-native') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require('react-native');
} catch {
  /* Headless tests */
}

export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  const err = error as {
    status?: number;
    response?: { status?: number };
    normalized?: { status?: number; isRateLimit?: boolean; code?: string };
  };
  const status = err?.status ?? err?.response?.status ?? err?.normalized?.status;

  // Never retry 400, 401, 403, 404, 409, 422, 429
  if (status && [400, 401, 403, 404, 409, 422, 429].includes(status)) {
    return false;
  }

  // Never retry quota exhaustion or rate limits
  if (err?.normalized?.isRateLimit || err?.normalized?.code === 'AI_QUOTA_EXCEEDED') {
    return false;
  }

  // Allow limited retries (max 2 failures -> 1 retry) for safe transient failures
  return failureCount < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated)
    queryClient.clear();
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider = ({ children }: QueryProviderProps) => {
  useEffect(() => {
    const appState = native?.AppState.addEventListener('change', (state) => {
      if (native?.Platform.OS !== 'web') focusManager.setFocused(state === 'active');
    });
    return () => {
      appState?.remove();
    };
  }, []);
  return <TanStackQueryClientProvider client={queryClient}>{children}</TanStackQueryClientProvider>;
};

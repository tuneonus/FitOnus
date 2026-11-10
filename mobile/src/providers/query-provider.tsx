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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
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

import { QueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false, // Useful for React Native
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider = ({ children }: QueryProviderProps) => {
  return (
    <TanStackQueryClientProvider client={queryClient}>
      {children}
    </TanStackQueryClientProvider>
  );
};

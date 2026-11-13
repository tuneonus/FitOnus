'use client';

import React, { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '@/features/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Optional page-level actions rendered beside the page title. */
  actions?: React.ReactNode;
}

export function AdminLayout({
  children,
  title,
  subtitle,
  onRefresh,
  isRefreshing,
  actions,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <LoadingSpinner size="lg" label="Loading OnusFit Admin…" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-ink-950 text-ink-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <Header title={title} onOpenSidebar={() => setSidebarOpen(true)} />

        <main
          id="main-content"
          className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-400">
                  {subtitle}
                </p>
              )}
            </div>

            {(actions || onRefresh) && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions}
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="btn btn-secondary btn-sm"
                    aria-label="Refresh data"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

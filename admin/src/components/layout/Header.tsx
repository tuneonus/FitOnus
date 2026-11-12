'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Shield, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth, AdminAccountSettingsModal } from '@/features/auth';
import { SystemHealthIndicator } from './SystemHealthIndicator';
import { NAVIGATION_GROUPS } from './Sidebar';

interface HeaderProps {
  title: string;
  onOpenSidebar: () => void;
}

function useBreadcrumb(fallbackTitle: string) {
  const pathname = usePathname();
  for (const group of NAVIGATION_GROUPS) {
    for (const item of group.items) {
      const match = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
      if (match) return { section: group.label, page: item.name };
    }
  }
  return { section: 'Admin', page: fallbackTitle };
}

export function Header({ title, onOpenSidebar }: HeaderProps) {
  const { user } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const crumb = useBreadcrumb(title);

  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'AD';

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="btn btn-ghost btn-icon btn-sm -ml-1 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
              <li className="hidden sm:block">
                <Link href="/" className="text-ink-400 transition-colors hover:text-ink-100">
                  OnusFit
                </Link>
              </li>
              <li aria-hidden="true" className="hidden text-ink-600 sm:block">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li className="hidden text-ink-400 sm:block">{crumb.section}</li>
              <li aria-hidden="true" className="hidden text-ink-600 sm:block">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li aria-current="page" className="truncate font-medium text-ink-100">
                {crumb.page}
              </li>
            </ol>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <SystemHealthIndicator />

          <div className="hidden items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2 py-1 text-[11px] xl:flex">
            <Shield className="h-3.5 w-3.5 text-brand-500" />
            <span className="font-semibold uppercase tracking-wider text-ink-200">
              {user?.role || 'Admin'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Account & security settings"
            aria-haspopup="dialog"
            className="flex h-9 items-center gap-2 rounded-lg border border-transparent pl-1 pr-2 text-[13px] text-ink-200 transition-colors hover:border-ink-800 hover:bg-ink-900"
          >
            <span className="avatar h-7 w-7 rounded-md text-[11px] text-brand-300">{initials}</span>
            <span className="hidden max-w-[140px] truncate font-medium text-white sm:inline">
              {user?.displayName || 'Admin'}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-ink-500 sm:block" />
          </button>
        </div>
      </header>

      <AdminAccountSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
      />
    </>
  );
}

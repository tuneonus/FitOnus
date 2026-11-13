'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ScrollText,
  LogOut,
  Dumbbell,
  Utensils,
  Trophy,
  Bell,
  Sliders,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { BrandMark } from '@/components/ui/BrandMark';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const NAVIGATION_GROUPS = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Management',
    items: [
      { name: 'Users', href: '/users', icon: Users },
      { name: 'Workouts', href: '/workouts', icon: Dumbbell },
      { name: 'Nutrition', href: '/nutrition', icon: Utensils },
      { name: 'Challenges', href: '/challenges', icon: Trophy },
      { name: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Settings', href: '/settings', icon: Sliders },
      { name: 'Audit Logs', href: '/audit-logs', icon: ScrollText },
    ],
  },
] as const;

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'AD';

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink-800 bg-ink-900 transition-transform duration-200 ease-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-ink-800 px-5">
          <Link href="/" onClick={onClose} className="flex items-center gap-3 rounded-lg">
            <BrandMark size={32} />
            <div className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-white">
                OnusFit
              </span>
              <span className="block text-[11px] font-medium text-ink-400">Admin console</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {NAVIGATION_GROUPS.map((group) => (
            <div key={group.label} className="mb-6 last:mb-0">
              <p className="eyebrow px-3 pb-2 text-ink-500">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={`group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                          active
                            ? 'bg-ink-800 text-white'
                            : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-600 transition-opacity ${
                            active ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? 'text-brand-300' : 'text-ink-500 group-hover:text-ink-300'
                          }`}
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Account */}
        <div className="shrink-0 border-t border-ink-800 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="avatar h-9 w-9 text-xs text-brand-300">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">
                {user?.displayName || 'Administrator'}
              </p>
              <p className="truncate text-[11px] text-ink-400">{user?.email || '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              disabled={isLoading}
              title="Sign out"
              aria-label="Sign out"
              className="btn btn-icon btn-sm text-ink-400 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ScrollText,
  LogOut,
  Dumbbell,
} from 'lucide-react';
import { useAuth } from '@/features/auth';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Audit Logs', href: '/audit-logs', icon: ScrollText },
  ];

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-950 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/20">
            <Dumbbell className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide">FitOnus</span>
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
                Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Control Panel</p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 space-y-1.5 px-3 py-6">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Management
          </div>
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-teal-500/20 to-emerald-500/10 text-teal-300 border border-teal-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    active ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Neon DB badge */}
        <div className="px-4 py-3 mx-3 mb-3 rounded-xl border border-slate-800/80 bg-slate-900/40 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Neon DB Connected</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Phase 1 & 2 Live Storage
          </p>
        </div>

        {/* User Card & Logout */}
        <div className="border-t border-slate-800 p-3 bg-slate-900/30">
          <div className="flex items-center justify-between rounded-xl p-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-950 border border-teal-700/50 text-teal-300 font-bold text-xs">
                {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'AD'}
              </div>
              <div className="truncate">
                <p className="truncate text-xs font-semibold text-white">
                  {user?.displayName || 'Administrator'}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {user?.email || 'admin@fitonus.com'}
                </p>
              </div>
            </div>

            <button
              onClick={() => logout()}
              disabled={isLoading}
              title="Sign Out"
              className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

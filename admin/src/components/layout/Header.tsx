'use client';

import React, { useState } from 'react';
import { Menu, RefreshCw, Shield, Settings } from 'lucide-react';
import { useAuth, AdminAccountSettingsModal } from '@/features/auth';
import { SystemHealthIndicator } from './SystemHealthIndicator';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onOpenSidebar: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({
  title,
  subtitle,
  onOpenSidebar,
  onRefresh,
  isRefreshing,
}: HeaderProps) {
  const { user } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">{title}</h1>
            {subtitle && (
              <p className="text-xs text-slate-400 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Dynamic Backend System Health Probe */}
          <SystemHealthIndicator />

          {/* Role Indicator */}
          <div className="hidden lg:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs">
            <Shield className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-slate-400">Role:</span>
            <span className="font-semibold text-teal-300 uppercase tracking-wider text-[11px]">
              {user?.role || 'Admin'}
            </span>
          </div>

          {/* Account Settings Trigger */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Admin Account & Security Settings"
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-950 border border-teal-700/50 text-[10px] font-bold text-teal-300">
              {user?.displayName
                ? user.displayName.slice(0, 2).toUpperCase()
                : user?.email
                ? user.email.slice(0, 2).toUpperCase()
                : 'AD'}
            </div>
            <span className="hidden sm:inline font-medium text-white truncate max-w-[120px]">
              {user?.displayName || 'Admin'}
            </span>
            <Settings className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {/* Refresh Action */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh Data"
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-teal-400 ${
                  isRefreshing ? 'animate-spin' : ''
                }`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </header>

      {/* Admin Account Settings Modal */}
      <AdminAccountSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
      />
    </>
  );
}

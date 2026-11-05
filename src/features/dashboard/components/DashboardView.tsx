'use client';

import React from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Target,
  ShieldAlert,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { RegistrationTrendChart } from './RegistrationTrendChart';
import { OnboardingFunnelCard } from './OnboardingFunnelCard';
import { RecentUsersTable } from './RecentUsersTable';

export function DashboardView() {
  const { stats, isLoading, isRefreshing, error, refresh } = useDashboardStats();

  const onboardingPercentage =
    stats && stats.totalUsers > 0
      ? Math.round((stats.completedOnboarding / stats.totalUsers) * 100)
      : 0;

  return (
    <AdminLayout
      title="Platform Overview"
      subtitle="Live metrics from Neon PostgreSQL for Phase 1 & Phase 2"
      onRefresh={refresh}
      isRefreshing={isRefreshing}
    >
      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading live database metrics..." />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400" />
            <h3 className="font-semibold text-white">Failed to load metrics</h3>
          </div>
          <p className="mt-2 text-sm text-slate-300">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : stats ? (
        <div className="space-y-8">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Users"
              value={stats.totalUsers}
              subtitle="Registered accounts"
              icon={<Users className="h-5 w-5" />}
              accent="teal"
            />
            <StatsCard
              title="Active Accounts"
              value={stats.activeUsers}
              subtitle={`${stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}% of accounts`}
              icon={<UserCheck className="h-5 w-5" />}
              accent="emerald"
            />
            <StatsCard
              title="Completed Onboarding"
              value={stats.completedOnboarding}
              subtitle={`${onboardingPercentage}% completion rate`}
              icon={<Target className="h-5 w-5" />}
              accent="cyan"
            />
            <StatsCard
              title="Suspended Accounts"
              value={stats.disabledUsers}
              subtitle={stats.disabledUsers === 0 ? 'No suspended accounts' : 'Review in Users tab'}
              icon={<UserX className="h-5 w-5" />}
              accent={stats.disabledUsers > 0 ? 'rose' : 'purple'}
            />
          </div>

          {/* Funnel Progress & Registration Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <OnboardingFunnelCard
              totalUsers={stats.totalUsers}
              completedOnboarding={stats.completedOnboarding}
              pendingOnboarding={stats.pendingOnboarding}
            />

            <RegistrationTrendChart
              trend={stats.registrationTrend}
              new7d={stats.newRegistrations7d}
              new30d={stats.newRegistrations30d}
              active7d={stats.activeUsers7d}
              active30d={stats.activeUsers30d}
            />
          </div>

          {/* Recent Registrations Table */}
          <RecentUsersTable users={stats.recentUsers} />
        </div>
      ) : null}
    </AdminLayout>
  );
}


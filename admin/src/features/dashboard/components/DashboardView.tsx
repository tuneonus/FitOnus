'use client';

import React from 'react';
import {
  Users,
  UserCheck,
  TrendingUp,
  Dumbbell,
  Utensils,
  Trophy,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { useToast } from '@/context/ToastContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { DashboardSkeleton } from './DashboardSkeleton';
import { UserGrowthChart } from './UserGrowthChart';
import { OnboardingFunnelCard } from './OnboardingFunnelCard';
import { ActivityTrendsCard } from './ActivityTrendsCard';
import { RecentUsersTable } from './RecentUsersTable';

export function DashboardView() {
  const { toast } = useToast();
  const {
    data,
    timeframe,
    setTimeframe,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useDashboardStats();

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success('Dashboard metrics refreshed from Neon PostgreSQL.');
    } catch {
      toast.error('Failed to refresh dashboard metrics.');
    }
  };

  if (isLoading) {
    return (
      <AdminLayout
        title="Platform Overview"
        subtitle="Live enterprise metrics from Neon PostgreSQL across all OnusFit domains"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      >
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  if (error && !data) {
    return (
      <AdminLayout
        title="Platform Overview"
        subtitle="Live enterprise metrics from Neon PostgreSQL across all OnusFit domains"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400" />
            <h3 className="font-semibold text-white">Failed to load platform metrics</h3>
          </div>
          <p className="mt-2 text-sm text-slate-300">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      </AdminLayout>
    );
  }

  if (!data) return null;

  const { userStats, workoutStats, nutritionStats, challenges } = data;

  // Active users based on selected timeframe
  const activeUsersCount =
    timeframe === '7d'
      ? userStats.activeUsers7d
      : userStats.activeUsers30d;

  const totalUsersCount = userStats.totalUsers;
  const activeUsersRate =
    totalUsersCount > 0
      ? Math.round((activeUsersCount / totalUsersCount) * 100)
      : 0;

  // New registrations based on timeframe
  const newRegistrationsCount =
    timeframe === '7d'
      ? userStats.newRegistrations7d
      : userStats.newRegistrations30d;

  // Challenge metrics
  const publishedChallengesCount =
    challenges?.filter((c) => c.status === 'published').length ?? 0;

  return (
    <AdminLayout
      title="Platform Overview"
      subtitle="Live enterprise metrics from Neon PostgreSQL across all OnusFit domains"
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-8">
        {/* Header Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-slate-400">
              Displaying metrics for timeframe:{' '}
              <strong className="text-white uppercase">{timeframe}</strong>
              {timeframe === '90d' && (
                <span className="ml-2 text-[10px] text-amber-400 font-normal">
                  (Backend returns max 30D window; 90D query pending Phase 11)
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Timeframe Filter:
            </span>
            <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 p-1">
              {(['7d', '30d', '90d'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    timeframe === tf
                      ? 'bg-teal-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 6 Core KPI Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* 1. Total Users */}
          <StatsCard
            title="Total Users"
            value={totalUsersCount}
            subtitle="Registered accounts"
            icon={<Users className="h-5 w-5" />}
            accent="teal"
          />

          {/* 2. Active Users */}
          <StatsCard
            title="Active Users"
            value={activeUsersCount}
            subtitle={
              timeframe === '90d'
                ? `${activeUsersRate}% active (30D max available)`
                : `${activeUsersRate}% active (${timeframe.toUpperCase()})`
            }
            icon={<UserCheck className="h-5 w-5" />}
            accent="emerald"
          />

          {/* 3. New Registrations */}
          <StatsCard
            title="New Signups"
            value={newRegistrationsCount}
            subtitle={
              timeframe === '90d'
                ? 'Registered (30D max available)'
                : `Registered (${timeframe.toUpperCase()})`
            }
            icon={<TrendingUp className="h-5 w-5" />}
            accent="cyan"
          />

          {/* 4. Workout Activity */}
          <StatsCard
            title="Workouts"
            value={
              workoutStats
                ? workoutStats.totalCompletedSessions.toLocaleString()
                : 'Unavailable'
            }
            subtitle={
              workoutStats
                ? `${workoutStats.activeLiftersCount} active lifters`
                : data.errors.workouts || 'Offline'
            }
            icon={<Dumbbell className="h-5 w-5" />}
            accent="purple"
          />

          {/* 5. Nutrition Activity */}
          <StatsCard
            title="Meals Logged"
            value={
              nutritionStats
                ? nutritionStats.totalMealsLogged.toLocaleString()
                : 'Unavailable'
            }
            subtitle={
              nutritionStats
                ? `${nutritionStats.totalWaterLogs} water entries`
                : data.errors.nutrition || 'Offline'
            }
            icon={<Utensils className="h-5 w-5" />}
            accent="amber"
          />

          {/* 6. Challenge Participation */}
          <StatsCard
            title="Challenges"
            value={
              challenges ? `${publishedChallengesCount} Active` : 'Unavailable'
            }
            subtitle={
              challenges
                ? `${challenges.length} total configured`
                : data.errors.challenges || 'Offline'
            }
            icon={<Trophy className="h-5 w-5" />}
            accent="rose"
          />
        </div>

        {/* Growth Chart (2 cols) & Funnel Progress (1 col) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <UserGrowthChart
            trend={userStats.registrationTrend}
            new7d={userStats.newRegistrations7d}
            new30d={userStats.newRegistrations30d}
            active7d={userStats.activeUsers7d}
            active30d={userStats.activeUsers30d}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />

          <OnboardingFunnelCard
            totalUsers={userStats.totalUsers}
            completedOnboarding={userStats.completedOnboarding}
            pendingOnboarding={userStats.pendingOnboarding}
          />
        </div>

        {/* Multi-Domain Activity Trends */}
        <ActivityTrendsCard
          workoutStats={workoutStats}
          nutritionStats={nutritionStats}
          challenges={challenges}
          workoutError={data.errors.workouts}
          nutritionError={data.errors.nutrition}
          challengesError={data.errors.challenges}
        />

        {/* Recent Registrations Table */}
        <RecentUsersTable users={userStats.recentUsers} />
      </div>
    </AdminLayout>
  );
}

'use client';

import React from 'react';
import {
  Users,
  UserCheck,
  TrendingUp,
  Dumbbell,
  Utensils,
  Trophy,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/context/ToastContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import type { DashboardTimeframe } from '../types';
import { DashboardSkeleton } from './DashboardSkeleton';
import { UserGrowthChart } from './UserGrowthChart';
import { OnboardingFunnelCard } from './OnboardingFunnelCard';
import { ActivityTrendsCard } from './ActivityTrendsCard';
import { RecentUsersTable } from './RecentUsersTable';
import { summarizeTimeframe, timeframeLabel } from '../utils/timeframe';

const PAGE_TITLE = 'Overview';
const PAGE_SUBTITLE = 'Live platform metrics across members, training, nutrition and challenges.';
const TIMEFRAMES: DashboardTimeframe[] = ['7d', '30d', '90d'];

function TimeframeSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: DashboardTimeframe;
  onChange: (tf: DashboardTimeframe) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="group" aria-label="Metrics timeframe">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          type="button"
          disabled={disabled}
          onClick={() => onChange(tf)}
          data-active={value === tf}
          aria-pressed={value === tf}
          className="segmented-item tabular-nums"
        >
          {timeframeLabel(tf)}
        </button>
      ))}
    </div>
  );
}

export function DashboardView() {
  const { toast } = useToast();
  const {
    data,
    timeframe,
    loadedTimeframe,
    setTimeframe,
    isLoading,
    isRefreshing,
    error,
    timeframeError,
    refresh,
  } = useDashboardStats();

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success('Dashboard metrics refreshed.');
    } catch {
      toast.error('Failed to refresh dashboard metrics.');
    }
  };

  const timeframeSwitch = (
    <TimeframeSwitch value={timeframe} onChange={setTimeframe} disabled={isLoading} />
  );

  if (isLoading) {
    return (
      <AdminLayout
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        actions={timeframeSwitch}
      >
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  if (error && !data) {
    return (
      <AdminLayout
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      >
        <ErrorState
          title="Failed to load platform metrics"
          message={error}
          onRetry={handleRefresh}
          isRetrying={isRefreshing}
        />
      </AdminLayout>
    );
  }

  if (!data) return null;

  const { userStats, workoutStats, nutritionStats, challenges } = data;

  // Figures follow the timeframe the loaded data was requested for (not the one just clicked), so a label
  // can never describe a different window than the number beside it.
  const summary = summarizeTimeframe(userStats, loadedTimeframe);
  const loadedLabel = timeframeLabel(loadedTimeframe);

  const totalUsersCount = userStats.totalUsers;
  const activeUsersRate =
    totalUsersCount > 0
      ? Math.round((summary.activeUsers / totalUsersCount) * 100)
      : 0;

  // Challenge metrics
  const publishedChallengesCount =
    challenges?.filter((c) => c.status === 'published').length ?? 0;

  return (
    <AdminLayout
      title={PAGE_TITLE}
      subtitle={PAGE_SUBTITLE}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      actions={timeframeSwitch}
    >
      <div className="space-y-6 lg:space-y-8">
        {timeframeError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Couldn’t load that timeframe. {timeframeError}</span>
          </div>
        )}

        {summary.activeWindowIsShorter && (
          <div className="alert alert-info">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <span>
              Registrations cover the full {loadedLabel}. The backend counts active users over up to
              30 days, so that figure covers the last {summary.activeWindowLabel}.
            </span>
          </div>
        )}

        {/* Core KPIs */}
        <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 sm:gap-4">
          <StatsCard
            title="Total users"
            value={totalUsersCount}
            subtitle="Registered accounts"
            icon={<Users />}
            accent="teal"
          />
          <StatsCard
            title="Active users"
            value={summary.activeUsers}
            subtitle={`${activeUsersRate}% of users · ${summary.activeWindowLabel}`}
            icon={<UserCheck />}
            accent="emerald"
          />
          <StatsCard
            title="New signups"
            value={summary.newRegistrations}
            subtitle={`Registered · ${loadedLabel}`}
            icon={<TrendingUp />}
            accent="cyan"
          />
          <StatsCard
            title="Workouts completed"
            value={workoutStats ? workoutStats.totalCompletedSessions.toLocaleString() : 'Unavailable'}
            subtitle={
              workoutStats
                ? `${workoutStats.activeLiftersCount.toLocaleString()} active lifters`
                : data.errors.workouts || 'Source offline'
            }
            icon={<Dumbbell />}
            accent="purple"
          />
          <StatsCard
            title="Meals logged"
            value={nutritionStats ? nutritionStats.totalMealsLogged.toLocaleString() : 'Unavailable'}
            subtitle={
              nutritionStats
                ? `${nutritionStats.totalWaterLogs.toLocaleString()} water entries`
                : data.errors.nutrition || 'Source offline'
            }
            icon={<Utensils />}
            accent="amber"
          />
          <StatsCard
            title="Live challenges"
            value={challenges ? publishedChallengesCount : 'Unavailable'}
            subtitle={
              challenges
                ? `${challenges.length} configured in total`
                : data.errors.challenges || 'Source offline'
            }
            icon={<Trophy />}
            accent="rose"
          />
        </section>

        {/* Growth chart & onboarding */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <UserGrowthChart
            trend={summary.trend}
            timeframe={loadedTimeframe}
            newRegistrations={summary.newRegistrations}
            activeUsers={summary.activeUsers}
            activeWindowLabel={summary.activeWindowLabel}
          />

          <OnboardingFunnelCard
            totalUsers={userStats.totalUsers}
            completedOnboarding={userStats.completedOnboarding}
            pendingOnboarding={userStats.pendingOnboarding}
          />
        </div>

        <ActivityTrendsCard
          workoutStats={workoutStats}
          nutritionStats={nutritionStats}
          challenges={challenges}
          workoutError={data.errors.workouts}
          nutritionError={data.errors.nutrition}
          challengesError={data.errors.challenges}
        />

        <RecentUsersTable users={userStats.recentUsers} />
      </div>
    </AdminLayout>
  );
}

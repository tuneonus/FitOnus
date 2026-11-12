'use client';

import React from 'react';
import Link from 'next/link';
import { Dumbbell, Utensils, Trophy, ArrowUpRight, Info, AlertTriangle } from 'lucide-react';
import type { WorkoutStats } from '@/features/workouts/types';
import type { NutritionCatalogStats } from '@/features/nutrition/types';
import type { Challenge } from '@/features/challenges/types';

interface ActivityTrendsCardProps {
  workoutStats: WorkoutStats | null;
  nutritionStats: NutritionCatalogStats | null;
  challenges: Challenge[] | null;
  workoutError?: string;
  nutritionError?: string;
  challengesError?: string;
}

interface Metric {
  label: string;
  value: string;
}

function DomainCard({
  title,
  description,
  href,
  icon,
  iconClass,
  error,
  metrics,
  emptyLabel,
  footnote,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  iconClass: string;
  error?: string;
  metrics: Metric[] | null;
  emptyLabel: string;
  footnote?: React.ReactNode;
}) {
  return (
    <section className="card flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-850 ring-1 ring-ink-800 [&>svg]:h-4 [&>svg]:w-4 ${iconClass}`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="card-title">{title}</h3>
            <p className="truncate text-xs text-ink-400">{description}</p>
          </div>
        </div>
        <Link
          href={href}
          className="btn btn-ghost btn-icon btn-sm text-ink-400"
          aria-label={`Open ${title.toLowerCase()} management`}
          title={`Open ${title.toLowerCase()} management`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {error ? (
          <div className="alert alert-error text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : metrics ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            {metrics.map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="truncate text-xs text-ink-400">{m.label}</dt>
                <dd className="mt-1 truncate text-lg font-semibold tabular-nums tracking-tight text-white">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="py-4 text-[13px] text-ink-400">{emptyLabel}</p>
        )}

        {footnote && !error && <div className="mt-auto pt-5">{footnote}</div>}
      </div>
    </section>
  );
}

export function ActivityTrendsCard({
  workoutStats,
  nutritionStats,
  challenges,
  workoutError,
  nutritionError,
  challengesError,
}: ActivityTrendsCardProps) {
  // Format tonnage
  const formatVolume = (kg: number) => {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)} t`;
    }
    return `${kg.toLocaleString()} kg`;
  };

  // Challenge metrics
  const totalChallenges = challenges?.length ?? 0;
  const publishedChallenges = challenges?.filter((c) => c.status === 'published').length ?? 0;
  const autoEnrollChallenges = challenges?.filter((c) => c.autoEnroll).length ?? 0;
  const autoEnrollPercent =
    totalChallenges > 0 ? Math.round((autoEnrollChallenges / totalChallenges) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-white">Platform activity</h2>
          <p className="text-xs text-ink-400">All-time totals by domain</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DomainCard
          title="Workouts"
          description="Training sessions and exercise library"
          href="/workouts"
          icon={<Dumbbell />}
          iconClass="text-purple-300"
          error={workoutError}
          emptyLabel="No workout stats recorded."
          metrics={
            workoutStats
              ? [
                  { label: 'Completed sessions', value: workoutStats.totalCompletedSessions.toLocaleString() },
                  { label: 'Active lifters', value: workoutStats.activeLiftersCount.toLocaleString() },
                  { label: 'Total volume', value: formatVolume(workoutStats.totalVolumeLiftedKg) },
                  { label: 'Exercise library', value: workoutStats.totalExercises.toLocaleString() },
                ]
              : null
          }
        />

        <DomainCard
          title="Nutrition"
          description="Meal logging, hydration and food catalog"
          href="/nutrition"
          icon={<Utensils />}
          iconClass="text-amber-300"
          error={nutritionError}
          emptyLabel="No nutrition stats recorded."
          metrics={
            nutritionStats
              ? [
                  { label: 'Meals logged', value: nutritionStats.totalMealsLogged.toLocaleString() },
                  { label: 'Food items logged', value: nutritionStats.totalMealItemsLogged.toLocaleString() },
                  { label: 'Water entries', value: nutritionStats.totalWaterLogs.toLocaleString() },
                  { label: 'Verified foods', value: nutritionStats.totalVerifiedFoods.toLocaleString() },
                ]
              : null
          }
        />

        <DomainCard
          title="Challenges"
          description="Programs, badges and rewards"
          href="/challenges"
          icon={<Trophy />}
          iconClass="text-rose-300"
          error={challengesError}
          emptyLabel="No challenges configured."
          metrics={
            challenges
              ? [
                  { label: 'Published', value: publishedChallenges.toLocaleString() },
                  { label: 'Total configured', value: totalChallenges.toLocaleString() },
                  { label: 'Auto-enroll', value: `${autoEnrollPercent}%` },
                  { label: 'Auto-enroll count', value: autoEnrollChallenges.toLocaleString() },
                ]
              : null
          }
          footnote={
            challenges ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
                <Info className="mt-px h-3 w-3 shrink-0" />
                <span>
                  Participation counts need the{' '}
                  <code className="font-mono text-ink-400">/challenges/stats</code> endpoint (pending).
                </span>
              </p>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

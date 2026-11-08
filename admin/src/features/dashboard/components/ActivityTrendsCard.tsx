'use client';

import React from 'react';
import Link from 'next/link';
import {
  Dumbbell,
  Utensils,
  Trophy,
  ArrowRight,
  Flame,
  Droplets,
  Sparkles,
  Info,
} from 'lucide-react';
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
      return `${(kg / 1000).toFixed(1)} tons`;
    }
    return `${kg.toLocaleString()} kg`;
  };

  // Challenge metrics
  const totalChallenges = challenges?.length ?? 0;
  const publishedChallenges =
    challenges?.filter((c) => c.status === 'published').length ?? 0;
  const autoEnrollChallenges =
    challenges?.filter((c) => c.autoEnroll).length ?? 0;
  const autoEnrollPercent =
    totalChallenges > 0
      ? Math.round((autoEnrollChallenges / totalChallenges) * 100)
      : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-white">
            Platform Activity & Engagement Trends
          </h3>
          <p className="text-xs text-slate-400">
            Real-time cross-pillar fitness activity tracked in Neon PostgreSQL
          </p>
        </div>
        <span className="text-[11px] text-teal-400 font-medium">
          Multi-domain Analytics
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Workout Activity Pillar */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Workout Activity
                  </h4>
                  <p className="text-[10px] text-slate-400">Strength & Cardio</p>
                </div>
              </div>
              <Link
                href="/workouts"
                className="text-slate-400 hover:text-purple-300 transition-colors p-1"
                title="View Workouts Management"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {workoutError ? (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-[11px] text-rose-300">
                {workoutError}
              </div>
            ) : workoutStats ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Completed Sessions</span>
                  <p className="text-base font-bold text-white mt-0.5">
                    {workoutStats.totalCompletedSessions.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Active Lifters</span>
                  <p className="text-base font-bold text-purple-300 mt-0.5">
                    {workoutStats.activeLiftersCount.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Total Volume</span>
                  <p className="text-base font-bold text-emerald-400 mt-0.5">
                    {formatVolume(workoutStats.totalVolumeLiftedKg)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Exercise Library</span>
                  <p className="text-base font-bold text-cyan-300 mt-0.5">
                    {workoutStats.totalExercises} exercises
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-3">No workout stats recorded.</div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
            <Flame className="h-3 w-3 text-purple-400" />
            <span>Curated routines & custom strength tracking</span>
          </div>
        </div>

        {/* Nutrition Activity Pillar */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Utensils className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Nutrition Activity
                  </h4>
                  <p className="text-[10px] text-slate-400">Meals & Hydration</p>
                </div>
              </div>
              <Link
                href="/nutrition"
                className="text-slate-400 hover:text-amber-300 transition-colors p-1"
                title="View Nutrition Management"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {nutritionError ? (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-[11px] text-rose-300">
                {nutritionError}
              </div>
            ) : nutritionStats ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Meals Logged</span>
                  <p className="text-base font-bold text-white mt-0.5">
                    {nutritionStats.totalMealsLogged.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Food Items Tracked</span>
                  <p className="text-base font-bold text-amber-300 mt-0.5">
                    {nutritionStats.totalMealItemsLogged.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Water Entries</span>
                  <p className="text-base font-bold text-cyan-400 mt-0.5">
                    {nutritionStats.totalWaterLogs.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                  <span className="text-[10px] text-slate-400">Verified Catalog</span>
                  <p className="text-base font-bold text-teal-300 mt-0.5">
                    {nutritionStats.totalVerifiedFoods} foods
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-3">No nutrition stats recorded.</div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
            <Droplets className="h-3 w-3 text-cyan-400" />
            <span>Physical serving contracts & macronutrient compliance</span>
          </div>
        </div>

        {/* Challenges & Gamification Pillar */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Trophy className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Challenges & Rewards
                  </h4>
                  <p className="text-[10px] text-slate-400">Community Gamification</p>
                </div>
              </div>
              <Link
                href="/challenges"
                className="text-slate-400 hover:text-rose-300 transition-colors p-1"
                title="View Challenges Management"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {challengesError ? (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-[11px] text-rose-300">
                {challengesError}
              </div>
            ) : challenges ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                    <span className="text-[10px] text-slate-400">Published Active</span>
                    <p className="text-base font-bold text-emerald-400 mt-0.5">
                      {publishedChallenges}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5">
                    <span className="text-[10px] text-slate-400">Total Configured</span>
                    <p className="text-base font-bold text-white mt-0.5">
                      {totalChallenges}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900/80 border border-slate-800/80 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Auto-Enroll Rate</span>
                    <span className="font-semibold text-teal-300">
                      {autoEnrollPercent}% ({autoEnrollChallenges} challenges)
                    </span>
                  </div>
                </div>

                {/* Missing Backend Endpoint Notice */}
                <div className="flex items-start gap-1.5 rounded-lg bg-slate-900/90 border border-slate-800 p-2 text-[10px] text-slate-400">
                  <Info className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    Aggregate user participation counts pending{' '}
                    <code className="text-slate-300 font-mono">/challenges/stats</code> (Phase 10.4).
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-3">No challenges configured.</div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
            <Sparkles className="h-3 w-3 text-rose-400" />
            <span>Badges, point rewards, and cadence tracking</span>
          </div>
        </div>
      </div>
    </div>
  );
}

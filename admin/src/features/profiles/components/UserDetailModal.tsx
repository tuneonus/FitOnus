'use client';

import React, { useState, useEffect } from 'react';
import { Dumbbell, Activity, CheckCircle, Flame, Scale } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { profilesApi } from '../api';
import type { AdminUserDetail, AdminUserActivity } from '../types';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDetail: AdminUserDetail | null;
  isLoading: boolean;
}

export function UserDetailModal({
  isOpen,
  onClose,
  userDetail,
  isLoading,
}: UserDetailModalProps) {
  const [activity, setActivity] = useState<AdminUserActivity | null>(null);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (isOpen && userDetail?.user?.id) {
      setIsLoadingActivity(true);
      profilesApi
        .getUserActivity(userDetail.user.id)
        .then((data) => {
          if (isMounted) setActivity(data);
        })
        .catch(() => {
          if (isMounted) setActivity(null);
        })
        .finally(() => {
          if (isMounted) setIsLoadingActivity(false);
        });
    } else {
      setActivity(null);
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, userDetail?.user?.id]);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User Record & Fitness Profile"
      description="Comprehensive user information, active sessions, and onboarding status"
      maxWidth="xl"
    >
      {isLoading || !userDetail ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="md" label="Loading details from Neon DB..." />
        </div>
      ) : (
        <div className="space-y-6 text-xs">
          {/* Header Identity Card */}
          <div className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 font-bold text-sm">
                {userDetail.user.displayName
                  ? userDetail.user.displayName.slice(0, 2).toUpperCase()
                  : 'US'}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  {userDetail.user.displayName}
                </h4>
                <p className="text-slate-400">{userDetail.user.email}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  ID: {userDetail.user.id}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <Badge
                variant={
                  userDetail.user.status === 'active' ? 'active' : 'disabled'
                }
                size="sm"
              >
                {userDetail.user.status.toUpperCase()}
              </Badge>
              <Badge
                variant={userDetail.user.role === 'admin' ? 'admin' : 'member'}
                size="sm"
              >
                {userDetail.user.role}
              </Badge>
            </div>
          </div>

          {/* Sessions & Security Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <span className="text-slate-400">Active Database Sessions</span>
              <p className="text-base font-bold text-white mt-1">
                {userDetail.sessionsSummary.activeSessionsCount} active
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <span className="text-slate-400">Last Active Timestamp</span>
              <p className="text-xs font-semibold text-slate-200 mt-1">
                {userDetail.sessionsSummary.lastActiveAt
                  ? new Date(
                      userDetail.sessionsSummary.lastActiveAt
                    ).toLocaleString()
                  : 'No recent activity'}
              </p>
            </div>
          </div>

          {/* Phase 2: Fitness Profile & Onboarding Metadata */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-teal-400" />
                <span className="font-semibold text-white">
                  Phase 2: Fitness & Nutrition Profile
                </span>
              </div>
              <Badge
                variant={
                  userDetail.profileMetadata.onboardingCompleted
                    ? 'completed'
                    : 'pending'
                }
                size="sm"
              >
                {userDetail.profileMetadata.onboardingCompleted
                  ? 'Onboarding Completed'
                  : `In Progress (${userDetail.profileMetadata.currentOnboardingStep || 'Start'})`}
              </Badge>
            </div>

            {userDetail.profileMetadata.hasProfile ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-400 text-[11px]">Primary Goal</span>
                  <p className="font-semibold text-slate-200 capitalize">
                    {userDetail.profileMetadata.primaryGoal?.replace(/_/g, ' ') ||
                      'Not specified'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">
                    Experience Level
                  </span>
                  <p className="font-semibold text-slate-200 capitalize">
                    {userDetail.profileMetadata.experienceLevel ||
                      'Not specified'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">
                    Workout Place
                  </span>
                  <p className="font-semibold text-slate-200 capitalize">
                    {userDetail.profileMetadata.preferredWorkoutPlace ||
                      'Not specified'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Weekly Target</span>
                  <p className="font-semibold text-slate-200">
                    {userDetail.profileMetadata.workoutDaysPerWeek
                      ? `${userDetail.profileMetadata.workoutDaysPerWeek} days/week`
                      : 'Not specified'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">
                    Session Duration
                  </span>
                  <p className="font-semibold text-slate-200">
                    {userDetail.profileMetadata.preferredWorkoutDurationMin
                      ? `${userDetail.profileMetadata.preferredWorkoutDurationMin} mins`
                      : 'Not specified'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">
                    Diet / Nutrition
                  </span>
                  <p className="font-semibold text-slate-200 capitalize">
                    {userDetail.profileMetadata.dietType || 'Standard'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">
                    Calorie Target
                  </span>
                  <p className="font-semibold text-slate-200">
                    {userDetail.profileMetadata.dailyCalorieTarget
                      ? `${userDetail.profileMetadata.dailyCalorieTarget} kcal/day`
                      : 'Auto'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Daily Protein</span>
                  <p className="font-semibold text-slate-200">
                    {userDetail.profileMetadata.dailyProteinGrams
                      ? `${userDetail.profileMetadata.dailyProteinGrams} g`
                      : 'Auto'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-slate-400">
                <p>User has not completed the onboarding flow yet.</p>
              </div>
            )}
          </div>

          {/* Member Activity & Real Data Status */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-400" />
                <span className="font-semibold text-white">
                  Real Activity & Logs Summary
                </span>
              </div>
              <span className="text-[10px] font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Live Data Connected
              </span>
            </div>

            {isLoadingActivity ? (
              <div className="py-6 flex justify-center">
                <LoadingSpinner size="sm" label="Fetching user activity..." />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Dumbbell className="h-3 w-3 text-teal-400" />
                      <span>Workouts</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200 mt-0.5">
                      {activity?.workouts.totalSessions ?? 0} sessions
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {activity?.workouts.totalDurationMin ?? 0}m • {activity?.workouts.totalVolumeKg ?? 0}kg
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Flame className="h-3 w-3 text-amber-400" />
                      <span>Nutrition</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200 mt-0.5">
                      {activity?.nutrition.totalMeals ?? 0} meals logged
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {activity?.nutrition.avgDailyCalories ?? 0} kcal avg
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Scale className="h-3 w-3 text-sky-400" />
                      <span>Body Weight</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200 mt-0.5">
                      {activity?.weight.currentWeightKg != null
                        ? `${activity.weight.currentWeightKg} kg`
                        : 'No weight logged'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {activity?.weight.totalEntries ?? 0} check-ins
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Activity className="h-3 w-3 text-indigo-400" />
                      <span>Active Sessions</span>
                    </div>
                    <p className="text-xs font-semibold text-teal-300 mt-0.5">
                      {userDetail.sessionsSummary.activeSessionsCount} active
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {userDetail.sessionsSummary.lastActiveAt
                        ? 'Recently active'
                        : 'No active session'}
                    </p>
                  </div>
                </div>

                {/* Recent Activity Items */}
                {activity && (activity.workouts.recentSessions.length > 0 || activity.nutrition.recentMeals.length > 0) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {activity.workouts.recentSessions.length > 0 && (
                      <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 p-2.5 space-y-1.5">
                        <span className="text-[11px] font-semibold text-teal-400">Recent Workouts</span>
                        {activity.workouts.recentSessions.slice(0, 3).map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-[11px] text-slate-300 border-b border-slate-800/40 pb-1 last:border-none">
                            <span className="truncate max-w-[140px]">{s.name}</span>
                            <span className="text-slate-400">{s.durationMin}m • {new Date(s.startedAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {activity.nutrition.recentMeals.length > 0 && (
                      <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 p-2.5 space-y-1.5">
                        <span className="text-[11px] font-semibold text-amber-400">Recent Meals</span>
                        {activity.nutrition.recentMeals.slice(0, 3).map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-[11px] text-slate-300 border-b border-slate-800/40 pb-1 last:border-none">
                            <span className="capitalize">{m.mealType}</span>
                            <span className="text-slate-400">{m.calories} kcal • {new Date(m.loggedAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-900/40 border border-slate-800/60 p-2.5 text-center text-[11px] text-slate-400">
                    No workout sessions or meal logs recorded for this user yet.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3 text-slate-400 text-[11px]">
            <div>
              <span>Account Created: </span>
              <span className="text-slate-300">
                {new Date(userDetail.user.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span>Last Updated: </span>
              <span className="text-slate-300">
                {new Date(userDetail.user.updatedAt).toLocaleString()}
              </span>
            </div>
            {userDetail.user.disabledAt && (
              <div className="col-span-2 text-rose-400">
                <span>Suspended At: </span>
                <span>
                  {new Date(userDetail.user.disabledAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

'use client';

import React from 'react';
import { Dumbbell, Activity, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { AdminUserDetail } from '../types';

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
                  Activity & Logs Summary
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Phase 11 Scope
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                <span className="text-[10px] text-slate-400">Workout Plan</span>
                <p className="text-xs font-semibold text-slate-200 mt-0.5">
                  {userDetail.profileMetadata.workoutDaysPerWeek
                    ? `${userDetail.profileMetadata.workoutDaysPerWeek}d/wk • ${userDetail.profileMetadata.preferredWorkoutDurationMin || 45}m`
                    : 'Unconfigured'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                <span className="text-[10px] text-slate-400">Nutrition Plan</span>
                <p className="text-xs font-semibold text-slate-200 mt-0.5 capitalize">
                  {userDetail.profileMetadata.dietType || 'Standard'}
                </p>
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                <span className="text-[10px] text-slate-400">Active Sessions</span>
                <p className="text-xs font-semibold text-teal-300 mt-0.5">
                  {userDetail.sessionsSummary.activeSessionsCount} token(s)
                </p>
              </div>

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
                <span className="text-[10px] text-slate-400">Health History</span>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">
                  Protected (HIPAA)
                </p>
              </div>
            </div>

            {/* Missing Backend Endpoint Notice */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-300">
              <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Backend Endpoint Pending: </span>
                Individual member workout session logs and historical meal entries (
                <code className="font-mono text-[10px] text-amber-200 bg-amber-500/20 px-1 py-0.5 rounded">
                  GET /api/v1/admin/users/:id/activity
                </code>
                ) are scheduled for Phase 11 Real Data Integration. Zero mock activity data is fabricated.
              </div>
            </div>
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

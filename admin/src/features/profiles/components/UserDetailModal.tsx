'use client';

import React, { useState, useEffect } from 'react';
import { Dumbbell, Activity, Flame, Scale, Target } from 'lucide-react';
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

function Field({ label, value, capitalize }: { label: string; value: React.ReactNode; capitalize?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className={`mt-0.5 truncate text-[13px] font-medium text-ink-100 ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function SectionHeading({ icon, title, aside }: { icon: React.ReactNode; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-ink-400">
        {icon}
        {title}
      </h3>
      {aside}
    </div>
  );
}

function ActivityTile({ icon, label, primary, secondary }: { icon: React.ReactNode; label: string; primary: string; secondary: string }) {
  return (
    <div className="card-inset min-w-0 p-3">
      <div className="flex items-center gap-1.5 text-xs text-ink-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 truncate text-[13px] font-semibold text-white">{primary}</p>
      <p className="truncate text-xs text-ink-400">{secondary}</p>
    </div>
  );
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
  const pm = userDetail?.profileMetadata;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User details"
      description="Account, sessions, fitness profile and recent activity"
      maxWidth="2xl"
    >
      {isLoading || !userDetail || !pm ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="md" label="Loading user details…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Identity */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="avatar h-12 w-12 rounded-xl text-sm text-brand-300">
                {userDetail.user.displayName
                  ? userDetail.user.displayName.slice(0, 2).toUpperCase()
                  : 'US'}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-white">
                  {userDetail.user.displayName}
                </h3>
                <p className="truncate text-[13px] text-ink-400">{userDetail.user.email}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-ink-500">
                  {userDetail.user.id}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <Badge variant={userDetail.user.status === 'active' ? 'active' : 'disabled'} size="sm">
                {userDetail.user.status === 'active' ? 'Active' : 'Suspended'}
              </Badge>
              <Badge variant={userDetail.user.role === 'admin' ? 'admin' : 'member'} size="sm">
                {userDetail.user.role}
              </Badge>
            </div>
          </div>

          {/* Account */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-ink-800 p-4 sm:grid-cols-4">
            <Field label="Active sessions" value={`${userDetail.sessionsSummary.activeSessionsCount}`} />
            <Field
              label="Last active"
              value={
                userDetail.sessionsSummary.lastActiveAt
                  ? new Date(userDetail.sessionsSummary.lastActiveAt).toLocaleString()
                  : 'No recent activity'
              }
            />
            <Field label="Created" value={new Date(userDetail.user.createdAt).toLocaleDateString()} />
            <Field label="Updated" value={new Date(userDetail.user.updatedAt).toLocaleDateString()} />
            {userDetail.user.disabledAt && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-xs font-medium text-rose-300">
                  Suspended {new Date(userDetail.user.disabledAt).toLocaleString()}
                </p>
              </div>
            )}
          </dl>

          {/* Fitness profile */}
          <section>
            <SectionHeading
              icon={<Target />}
              title="Fitness & nutrition profile"
              aside={
                <Badge variant={pm.onboardingCompleted ? 'completed' : 'pending'} size="sm">
                  {pm.onboardingCompleted
                    ? 'Onboarding completed'
                    : `In progress · ${pm.currentOnboardingStep || 'start'}`}
                </Badge>
              }
            />
            {pm.hasProfile ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-ink-800 p-4 sm:grid-cols-4">
                <Field label="Primary goal" capitalize value={pm.primaryGoal?.replace(/_/g, ' ') || 'Not specified'} />
                <Field label="Experience" capitalize value={pm.experienceLevel || 'Not specified'} />
                <Field label="Workout place" capitalize value={pm.preferredWorkoutPlace || 'Not specified'} />
                <Field label="Weekly target" value={pm.workoutDaysPerWeek ? `${pm.workoutDaysPerWeek} days/week` : 'Not specified'} />
                <Field label="Session length" value={pm.preferredWorkoutDurationMin ? `${pm.preferredWorkoutDurationMin} min` : 'Not specified'} />
                <Field label="Diet" capitalize value={pm.dietType || 'Standard'} />
                <Field label="Calorie target" value={pm.dailyCalorieTarget ? `${pm.dailyCalorieTarget} kcal/day` : 'Auto'} />
                <Field label="Daily protein" value={pm.dailyProteinGrams ? `${pm.dailyProteinGrams} g` : 'Auto'} />
              </dl>
            ) : (
              <p className="rounded-lg border border-dashed border-ink-700 p-4 text-center text-[13px] text-ink-400">
                This user has not completed onboarding yet.
              </p>
            )}
          </section>

          {/* Activity */}
          <section>
            <SectionHeading icon={<Activity />} title="Activity summary" />
            {isLoadingActivity ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="sm" label="Loading activity…" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <ActivityTile
                    icon={<Dumbbell className="text-purple-300" />}
                    label="Workouts"
                    primary={`${activity?.workouts.totalSessions ?? 0} sessions`}
                    secondary={`${activity?.workouts.totalDurationMin ?? 0} min · ${activity?.workouts.totalVolumeKg ?? 0} kg`}
                  />
                  <ActivityTile
                    icon={<Flame className="text-amber-300" />}
                    label="Nutrition"
                    primary={`${activity?.nutrition.totalMeals ?? 0} meals`}
                    secondary={`${activity?.nutrition.avgDailyCalories ?? 0} kcal avg`}
                  />
                  <ActivityTile
                    icon={<Scale className="text-cyan-300" />}
                    label="Body weight"
                    primary={
                      activity?.weight.currentWeightKg != null
                        ? `${activity.weight.currentWeightKg} kg`
                        : 'Not logged'
                    }
                    secondary={`${activity?.weight.totalEntries ?? 0} check-ins`}
                  />
                  <ActivityTile
                    icon={<Activity className="text-brand-500" />}
                    label="Sessions"
                    primary={`${userDetail.sessionsSummary.activeSessionsCount} active`}
                    secondary={userDetail.sessionsSummary.lastActiveAt ? 'Recently active' : 'No active session'}
                  />
                </div>

                {activity &&
                (activity.workouts.recentSessions.length > 0 ||
                  activity.nutrition.recentMeals.length > 0) ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activity.workouts.recentSessions.length > 0 && (
                      <div className="rounded-lg border border-ink-800 p-3">
                        <p className="eyebrow mb-2">Recent workouts</p>
                        <ul className="divide-y divide-ink-800">
                          {activity.workouts.recentSessions.slice(0, 3).map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                              <span className="truncate text-ink-200">{s.name}</span>
                              <span className="shrink-0 tabular-nums text-ink-400">
                                {s.durationMin}m · {new Date(s.startedAt).toLocaleDateString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activity.nutrition.recentMeals.length > 0 && (
                      <div className="rounded-lg border border-ink-800 p-3">
                        <p className="eyebrow mb-2">Recent meals</p>
                        <ul className="divide-y divide-ink-800">
                          {activity.nutrition.recentMeals.slice(0, 3).map((m) => (
                            <li key={m.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                              <span className="capitalize text-ink-200">{m.mealType}</span>
                              <span className="shrink-0 tabular-nums text-ink-400">
                                {m.calories} kcal · {new Date(m.loggedAt).toLocaleDateString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-ink-700 p-3 text-center text-xs text-ink-400">
                    No workout sessions or meal logs recorded for this user yet.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

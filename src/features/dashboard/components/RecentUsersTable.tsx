'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { RecentUserItem } from '../types';

interface RecentUsersTableProps {
  users: RecentUserItem[];
}

export function RecentUsersTable({ users }: RecentUsersTableProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">
            Recently Registered Users
          </h3>
          <p className="text-xs text-slate-400">
            Latest members onboarded into FitOnus
          </p>
        </div>

        <Link
          href="/users"
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
        >
          <span>View Full Directory</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="pb-3 font-semibold uppercase tracking-wider">User</th>
              <th className="pb-3 font-semibold uppercase tracking-wider">Role</th>
              <th className="pb-3 font-semibold uppercase tracking-wider">Status</th>
              <th className="pb-3 font-semibold uppercase tracking-wider">Onboarding</th>
              <th className="pb-3 font-semibold uppercase tracking-wider">Created</th>
              <th className="pb-3 font-semibold uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-teal-300 font-semibold text-xs border border-slate-700">
                      {u.displayName ? u.displayName.slice(0, 2).toUpperCase() : 'US'}
                    </div>
                    <div>
                      <p className="font-medium text-white">{u.displayName}</p>
                      <p className="text-slate-400 text-[11px]">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3">
                  <Badge variant={u.role === 'admin' ? 'admin' : 'member'} size="sm">
                    {u.role}
                  </Badge>
                </td>
                <td className="py-3">
                  <Badge variant={u.status === 'active' ? 'active' : 'disabled'} size="sm">
                    {u.status}
                  </Badge>
                </td>
                <td className="py-3">
                  <Badge
                    variant={u.onboardingCompleted ? 'completed' : 'pending'}
                    size="sm"
                  >
                    {u.onboardingCompleted ? 'Completed' : 'Pending'}
                  </Badge>
                </td>
                <td className="py-3 text-slate-400">
                  {new Date(u.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="py-3 text-right">
                  <Link
                    href={`/users?search=${encodeURIComponent(u.email)}`}
                    className="text-teal-400 hover:text-teal-300 font-medium inline-flex items-center gap-1"
                  >
                    <span>Manage</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


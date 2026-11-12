'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import type { RecentUserItem } from '../types';

interface RecentUsersTableProps {
  users: RecentUserItem[];
}

export function RecentUsersTable({ users }: RecentUsersTableProps) {
  return (
    <Panel
      title="Recent registrations"
      description="Latest members to join OnusFit"
      icon={<Users />}
      flush
      actions={
        <Link href="/users" className="btn btn-secondary btn-sm">
          View all users
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {users.length === 0 ? (
        <EmptyState
          bare
          icon={<Users />}
          title="No registered users yet"
          description="Newly registered users will appear here after creating an account."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Onboarding</th>
                <th scope="col">Joined</th>
                <th scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="avatar h-8 w-8 text-[11px]">
                        {u.displayName ? u.displayName.slice(0, 2).toUpperCase() : 'US'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{u.displayName}</p>
                        <p className="truncate text-xs text-ink-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge variant={u.role === 'admin' ? 'admin' : 'member'} size="sm">
                      {u.role}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={u.status === 'active' ? 'active' : 'disabled'} size="sm">
                      {u.status}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={u.onboardingCompleted ? 'completed' : 'pending'} size="sm">
                      {u.onboardingCompleted ? 'Completed' : 'Pending'}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap text-ink-400">
                    {new Date(u.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/users?search=${encodeURIComponent(u.email)}`}
                      className="link text-xs"
                    >
                      Manage
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

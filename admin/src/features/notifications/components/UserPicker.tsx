'use client';

import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usersApi } from '@/features/users/api';
import type { AdminUserListItem } from '@/features/users/types';
import { MAX_AUDIENCE_USERS } from '../logic';

interface UserPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

interface KnownUser {
  displayName: string;
  email: string;
}

/** Search active members by name or e-mail and pick the people a notification should reach. */
export function UserPicker({ selectedIds, onChange, disabled = false }: UserPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUserListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Names for chips. Users loaded from a saved draft are not known until they show up in a search.
  const [known, setKnown] = useState<Record<string, KnownUser>>({});

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the query is too short
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearching(true);
      usersApi
        .listUsers({ search: text, status: 'active', limit: 8 })
        .then(({ users }) => {
          if (cancelled) return;
          setResults(users);
          setSearchError(null);
          setKnown((prev) => {
            const next = { ...prev };
            for (const user of users) next[user.id] = { displayName: user.displayName, email: user.email };
            return next;
          });
        })
        .catch((err: unknown) => {
          if (!cancelled) setSearchError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const selected = new Set(selectedIds);
  const atLimit = selectedIds.length >= MAX_AUDIENCE_USERS;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-500" />
        <label htmlFor="notification-user-search" className="sr-only">
          Search users by name or e-mail
        </label>
        <input
          id="notification-user-search"
          type="search"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search active users by name or e-mail…"
          className="input pl-9"
          autoComplete="off"
        />
      </div>

      {searchError && <p className="field-error">{searchError}</p>}

      {query.trim().length >= 2 && (
        <ul aria-label="Search results" className="card-inset divide-y divide-ink-800 overflow-hidden">
          {isSearching && results.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-ink-400">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-ink-400">No active users match “{query.trim()}”.</li>
          ) : (
            results.map((user) => {
              const isSelected = selected.has(user.id);
              return (
                <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{user.displayName}</p>
                    <p className="truncate text-xs text-ink-400">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled || isSelected || atLimit}
                    onClick={() => onChange([...selectedIds, user.id])}
                    className="btn btn-secondary btn-sm"
                  >
                    {isSelected ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}

      {selectedIds.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Selected ({selectedIds.length})</p>
          <ul className="flex flex-wrap gap-2">
            {selectedIds.map((id) => {
              const info = known[id];
              const label = info ? info.displayName : `User ${id.slice(0, 8)}…`;
              return (
                <li
                  key={id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-ink-800 py-1 pl-2.5 pr-1 text-xs text-ink-100 ring-1 ring-inset ring-ink-700"
                >
                  <span className="truncate" title={info?.email ?? id}>
                    {label}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Remove ${label}`}
                    onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                    className="btn-icon inline-flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {atLimit && <p className="field-hint">You reached the {MAX_AUDIENCE_USERS}-user limit. Use a segment to reach more people.</p>}
    </div>
  );
}

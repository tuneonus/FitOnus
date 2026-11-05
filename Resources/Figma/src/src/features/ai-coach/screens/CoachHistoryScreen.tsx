import React, { useState } from 'react';
import { MessagesSquareIcon, SearchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { TextField } from '../../../shared/components/ui/TextField';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { pastConversations } from '../data/conversationsMock';

const groups = ['Today', 'This week', 'Earlier'] as const;

export function CoachHistoryScreen() {
  const { navigate } = useNavigation();
  const [query, setQuery] = useState('');
  const filtered = pastConversations.filter((c) => `${c.title} ${c.preview}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Screen title="Conversations">
      <div className="px-4">
        <TextField
          label="Search conversations"
          hideLabel
          placeholder="Search conversations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          trailing={<SearchIcon size={18} className="text-muted" aria-hidden="true" />} />
        
      </div>
      {filtered.length === 0 ?
      <EmptyState icon={MessagesSquareIcon} title="No matching conversations" body={`Nothing matches “${query}”. Try a metric like “sleep” or “protein”.`} /> :

      groups.map((g) => {
        const items = filtered.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="mt-6 px-4" aria-label={g}>
              <h2 className="mb-2 px-1 text-[12px] font-medium text-muted">{g}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {items.map((c) =>
              <li key={c.id}>
                    <button
                  type="button"
                  onClick={() => navigate('coachConversation', { id: c.id })}
                  className="w-full px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface2/60 focus-visible:bg-surface2 focus-visible:outline-none">
                  
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[15px] font-semibold text-ink">{c.title}</span>
                        <span className="shrink-0 text-[12px] text-muted">{c.date}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{c.preview}</span>
                    </button>
                  </li>
              )}
              </ul>
            </section>);

      })
      }
    </Screen>);

}
import React from 'react';
import { ArrowUpRightIcon, ShieldCheckIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useMemoryStore } from '../../ai-memory/store/memoryStore';
import { welcomePrompts } from '../data/conversationsMock';

export function CoachWelcome({ onAsk }: {onAsk: (q: string) => void;}) {
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const memoryCount = useMemoryStore((s) => s.enabled ? s.items.length : 0);
  const hasDevice = status === 'synced' || status === 'offline' || status === 'error';
  const access = hasDevice ? ['Sleep', 'HRV', 'Heart rate', 'Workouts', 'Meals', 'Weight'] : ['Workouts', 'Meals', 'Weight'];

  return (
    <div className="px-5 pt-4">
      <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.03em] text-ink">
        Hi Aarav.
        <br />
        <span className="text-muted">What’s on your mind?</span>
      </h2>

      <button
        type="button"
        onClick={() => navigate(hasDevice ? 'aiMemory' : 'healthIntegration')}
        className="mt-5 w-full rounded-2xl bg-surface2 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
        
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
          <ShieldCheckIcon size={13} aria-hidden="true" /> Your coach can see
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {access.map((a) =>
          <span key={a} className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-ink">{a}</span>
          )}
          <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-ink">{memoryCount} memories</span>
        </span>
        {!hasDevice && <span className="mt-2 block text-[12.5px] text-muted">Connect a device to unlock recovery and sleep answers →</span>}
      </button>

      <div className="mt-6 space-y-5">
        {welcomePrompts.map((group) =>
        <section key={group.topic} aria-label={group.topic}>
            <h3 className="mb-1 text-[12px] font-medium text-muted">{group.topic}</h3>
            <ul className="divide-y divide-line">
              {group.questions.map((q) =>
            <li key={q}>
                  <button
                type="button"
                onClick={() => onAsk(q)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left text-[15px] text-ink focus-visible:outline-none focus-visible:bg-surface2">
                
                    {q}
                    <ArrowUpRightIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />
                  </button>
                </li>
            )}
            </ul>
          </section>
        )}
      </div>
    </div>);

}
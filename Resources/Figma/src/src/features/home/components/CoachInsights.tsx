import React from 'react';
import { ArrowUpRightIcon, DumbbellIcon, SaladIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { coachInsights } from '../data/homeMock';

const icons = { nutrition: SaladIcon, strength: DumbbellIcon };

export function CoachInsights() {
  const { navigate, switchTab } = useNavigation();

  return (
    <section aria-labelledby="insights-title" className="px-4">
      <SectionHeader id="insights-title" title="From your coach" action="Insights" onAction={() => switchTab('progress')} />
      <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
        {coachInsights.map((insight) => {
          const Icon = icons[insight.kind];
          return (
            <li key={insight.title} className="flex gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/25">
                <Icon size={17} className="text-accentStrong" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-semibold leading-snug text-ink">{insight.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{insight.body}</p>
                <button
                  type="button"
                  onClick={() => navigate('coach', { q: insight.question })}
                  className="mt-2 inline-flex h-8 items-center gap-1 rounded-full text-[13px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
                  
                  {insight.action}
                  <ArrowUpRightIcon size={14} aria-hidden="true" />
                </button>
              </div>
            </li>);

        })}
      </ul>
    </section>);

}
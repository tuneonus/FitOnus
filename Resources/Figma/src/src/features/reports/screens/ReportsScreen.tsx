import React, { useState } from 'react';
import { CalendarDaysIcon, CalendarRangeIcon, ChevronRightIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { reportArchive, weeklyReport, monthlyReport } from '../data/reportsMock';

export function ReportsScreen() {
  const { navigate } = useNavigation();
  const [generating, setGenerating] = useState(false);

  const generate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      navigate('weeklyReport', { period: 'Oct 4 – 9 (so far)' });
    }, 2400);
  };

  return (
    <Screen title="AI reports">
      <div className="space-y-3 px-4">
        <button type="button" onClick={() => navigate('weeklyReport')} className="w-full rounded-[28px] bg-hero p-5 text-left text-heroInk">
          <span className="flex items-center gap-1.5 text-[12px] text-heroMuted"><CalendarRangeIcon size={13} aria-hidden="true" /> Weekly · {weeklyReport.period}</span>
          <span className="mt-2 block text-[20px] font-semibold leading-tight tracking-[-0.02em]">{weeklyReport.headline}</span>
          <span className="mt-3 flex items-center gap-1 text-[13px] font-semibold text-accent">Read report <ChevronRightIcon size={14} aria-hidden="true" /></span>
        </button>
        <button type="button" onClick={() => navigate('monthlyReport')} className="w-full rounded-[28px] border border-line bg-surface p-5 text-left">
          <span className="flex items-center gap-1.5 text-[12px] text-muted"><CalendarDaysIcon size={13} aria-hidden="true" /> Monthly · {monthlyReport.month}</span>
          <span className="mt-2 block text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">{monthlyReport.headline}</span>
          <span className="mt-3 flex items-center gap-1 text-[13px] font-semibold text-ink">Read report <ChevronRightIcon size={14} aria-hidden="true" /></span>
        </button>

        <div className="rounded-3xl border border-dashed border-line p-5">
          {generating ?
          <ThinkingIndicator toolCalls={['getWorkoutHistory', 'getNutritionLogs', 'getSleepHistory', 'getWeightHistory', 'generateWeeklyReport']} /> :

          <>
              <p className="text-[14px] font-semibold text-ink">Next weekly report: Sunday, Oct 11</p>
              <p className="mt-1 text-[13px] text-muted">Want a preview of this week so far?</p>
              <Button variant="secondary" size="sm" icon={SparklesIcon} className="mt-3" onClick={generate}>Generate preview</Button>
            </>
          }
        </div>
      </div>

      <section className="mt-6 px-4" aria-labelledby="archive">
        <h2 id="archive" className="mb-2 px-1 text-[17px] font-semibold text-ink">Past reports</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {reportArchive.map((r) =>
          <li key={r.id}>
              <button type="button" onClick={() => navigate(r.type === 'weekly' ? 'weeklyReport' : 'monthlyReport', { id: r.id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface2/60">
                <span className="w-16 text-[12px] font-medium capitalize text-muted">{r.type}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{r.title}</span>
                  <span className="block text-[12.5px] text-muted">{r.summary}</span>
                </span>
                <ChevronRightIcon size={16} className="text-muted" aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      </section>
    </Screen>);

}
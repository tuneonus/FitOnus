import React from 'react';
import { ArrowUpRightIcon, CircleCheckIcon, EyeIcon, InfoIcon } from 'lucide-react';
import { Badge } from '../../../shared/components/ui/Badge';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import type { AiInsight } from '../data/insightsMock';

const severity = {
  positive: { icon: CircleCheckIcon, cls: 'text-good' },
  watch: { icon: EyeIcon, cls: 'text-warn' },
  info: { icon: InfoIcon, cls: 'text-sky' }
};

export function InsightCard({ insight, onAsk }: {insight: AiInsight;onAsk: () => void;}) {
  const { icon: Icon, cls } = severity[insight.severity];
  return (
    <article className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${cls}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-semibold leading-snug text-ink">{insight.title}</h3>
            {insight.series && <Sparkline points={insight.series.map((p) => p.value)} width={56} height={22} />}
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{insight.explanation}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Supporting data">
            {insight.evidence.map((e) => <li key={e} className="rounded-full bg-surface2 px-2 py-0.5 text-[11.5px] text-ink">{e}</li>)}
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <Badge tone={insight.confidence === 'high' ? 'good' : insight.confidence === 'low' ? 'warn' : 'neutral'}>{insight.confidence} confidence</Badge>
            <button type="button" onClick={onAsk} className="inline-flex h-8 items-center gap-1 text-[13px] font-semibold text-ink">
              {insight.action} <ArrowUpRightIcon size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </article>);

}
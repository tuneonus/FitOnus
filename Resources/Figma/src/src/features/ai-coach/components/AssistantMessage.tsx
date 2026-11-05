import React from 'react';
import { BrainIcon, DatabaseIcon, RefreshCwIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import type { ActionStatus, Block, CoachMessage } from '../types/coach';
import { ThinkingIndicator } from './ThinkingIndicator';
import { MetricsBlock } from './blocks/MetricsBlock';
import { WorkoutBlock } from './blocks/WorkoutBlock';
import { NutritionBlock } from './blocks/NutritionBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { ComparisonBlock } from './blocks/ComparisonBlock';
import { LinkBlock } from './blocks/LinkBlock';
import { ActionBlock } from './blocks/ActionBlock';

type AssistantMessageProps = {
  message: CoachMessage;
  onFollowUp?: (q: string) => void;
  onRetry?: () => void;
  onActionStatus?: (actionId: string, status: ActionStatus, resultText?: string) => void;
  readOnly?: boolean;
};

export function AssistantMessage({ message, onFollowUp, onRetry, onActionStatus, readOnly }: AssistantMessageProps) {
  const renderBlock = (block: Block, i: number) => {
    switch (block.type) {
      case 'metrics':return <MetricsBlock key={i} block={block} />;
      case 'workout':return <WorkoutBlock key={i} block={block} />;
      case 'nutrition':return <NutritionBlock key={i} block={block} />;
      case 'chart':return <ChartBlock key={i} block={block} />;
      case 'comparison':return <ComparisonBlock key={i} block={block} />;
      case 'link':return <LinkBlock key={i} block={block} />;
      case 'action':
        return readOnly ? null :
        <ActionBlock key={block.id} block={block} onStatusChange={(s, t) => onActionStatus?.(block.id, s, t)} />;

    }
  };

  return (
    <article className="flex gap-3" aria-label="Coach reply">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accentInk">
        <SparklesIcon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {message.status === 'thinking' && <ThinkingIndicator toolCalls={message.toolCalls} />}

        {message.status === 'error' &&
        <div role="alert" className="rounded-2xl bg-bad/10 p-3.5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <TriangleAlertIcon size={16} className="text-bad" aria-hidden="true" /> Response failed
            </p>
            <p className="mt-1 text-[13px] text-muted">{message.text}</p>
            {onRetry &&
          <button type="button" onClick={onRetry} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-ink">
                <RefreshCwIcon size={14} aria-hidden="true" /> Try again
              </button>
          }
          </div>
        }

        {message.status === 'done' &&
        <>
            {message.text && <p className="text-[15px] leading-relaxed text-ink">{message.text}</p>}
            {message.memoryUsed &&
          <p className="flex items-start gap-2 rounded-2xl bg-surface2 px-3 py-2.5 text-[12.5px] leading-snug text-muted">
                <BrainIcon size={14} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
                <span><span className="font-semibold text-ink">From memory: </span>{message.memoryUsed}</span>
              </p>
          }
            {message.blocks?.map(renderBlock)}
            {message.sources && message.sources.length > 0 &&
          <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-[11.5px] text-muted">
                  <DatabaseIcon size={12} aria-hidden="true" /> Based on
                </span>
                {message.sources.map((s) =>
            <span key={s} className="rounded-full bg-surface2 px-2 py-0.5 text-[11.5px] text-ink">{s}</span>
            )}
              </div>
          }
            {message.medicalNote &&
          <p className="text-[11.5px] leading-snug text-muted">
                Coaching insight from your data, not a medical diagnosis. Talk to a doctor about symptoms or persistent changes.
              </p>
          }
            {!readOnly && message.followUps && onFollowUp &&
          <div className="flex flex-wrap gap-2 pt-1">
                {message.followUps.map((q) =>
            <button
              key={q}
              type="button"
              onClick={() => onFollowUp(q)}
              className="rounded-full border border-line bg-surface px-3 py-2 text-left text-[13px] text-ink transition-colors duration-150 hover:border-ink/30">
              
                    {q}
                  </button>
            )}
              </div>
          }
          </>
        }
      </div>
    </article>);

}
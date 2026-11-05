import React from 'react';
import { PencilLineIcon } from 'lucide-react';
import type { DataSource } from '../../types/health';

type SourceTagProps = {
  source: DataSource;
  tone?: 'default' | 'hero';
};

/** Every metric must declare where it came from: synced, estimated, or manual. */
export function SourceTag({ source, tone = 'default' }: SourceTagProps) {
  const textClass = tone === 'hero' ? 'text-heroMuted' : 'text-muted';
  const srPrefix =
  source.kind === 'synced' ?
  'Synced reading: ' :
  source.kind === 'estimated' ?
  'Estimated value: ' :
  'Manually logged: ';

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] ${textClass}`}>
      {source.kind === 'synced' &&
      <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
      }
      {source.kind === 'estimated' &&
      <span
        className="rounded-[4px] border border-dashed border-current px-1 text-[10px] font-medium leading-[14px]"
        aria-hidden="true">
        
          Est.
        </span>
      }
      {source.kind === 'manual' && <PencilLineIcon size={11} aria-hidden="true" />}
      <span>
        <span className="sr-only">{srPrefix}</span>
        {source.label}
      </span>
    </span>);

}
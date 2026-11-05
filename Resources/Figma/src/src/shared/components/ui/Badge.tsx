import React from 'react';
import { cn } from '../../utils/cn';

type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'sleep';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-ink/[0.07] text-ink',
  good: 'bg-good/[0.12] text-good',
  warn: 'bg-warn/[0.12] text-warn',
  bad: 'bg-bad/10 text-bad',
  accent: 'bg-accent/25 text-accentStrong',
  sleep: 'bg-sleep/[0.12] text-sleep'
};

export function Badge({
  tone = 'neutral',
  children,
  className




}: {tone?: BadgeTone;children: React.ReactNode;className?: string;}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11.5px] font-semibold',
        tones[tone],
        className
      )}>
      
      {children}
    </span>);

}
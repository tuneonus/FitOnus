import React from 'react';
import { cn } from '../../utils/cn';

export function Skeleton({ className }: {className?: string;}) {
  return <div className={cn('animate-pulse rounded-xl bg-ink/[0.07]', className)} aria-hidden="true" />;
}
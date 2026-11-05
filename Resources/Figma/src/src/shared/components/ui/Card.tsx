import React from 'react';
import { cn } from '../../utils/cn';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  tone?: 'default' | 'muted' | 'hero';
};

const tones = {
  default: 'border border-line bg-surface',
  muted: 'bg-surface2',
  hero: 'bg-hero text-heroInk'
};

export function Card({ padded = true, tone = 'default', className, ...rest }: CardProps) {
  return <div className={cn('rounded-3xl', tones[tone], padded && 'p-5', className)} {...rest} />;
}
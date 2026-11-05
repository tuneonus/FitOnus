import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type ProgressRingProps = {
  size: number;
  stroke: number;
  value: number;
  className: string;
  trackClassName?: string;
  wrapperClassName?: string;
  label?: string;
  delay?: number;
  children?: React.ReactNode;
};

export function ProgressRing({
  size,
  stroke,
  value,
  className,
  trackClassName = 'stroke-ink/[0.08]',
  wrapperClassName = 'relative',
  label,
  delay = 0,
  children
}: ProgressRingProps) {
  const reduceMotion = useReducedMotion();
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const progress = Math.max(0, Math.min(1, value));

  return (
    <div
      className={wrapperClassName}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}>
      
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className={trackClassName} />
        {progress > 0 &&
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={className}
          initial={{ pathLength: reduceMotion ? progress : 0 }}
          animate={{ pathLength: progress }}
          transition={{ duration: 0.3, delay, ease: [0.23, 1, 0.32, 1] }} />

        }
      </svg>
      {children &&
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      }
    </div>);

}
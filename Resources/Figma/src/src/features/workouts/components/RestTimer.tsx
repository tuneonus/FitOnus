import React from 'react';
import { motion } from 'framer-motion';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';

type RestTimerProps = {
  remaining: number;
  total: number;
  nextLabel: string;
  onAdd: () => void;
  onSkip: () => void;
};

export function RestTimer({ remaining, total, nextLabel, onAdd, onSkip }: RestTimerProps) {
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <motion.div
      role="timer"
      aria-label={`Rest ${mm} minutes ${ss} seconds remaining`}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-4 rounded-[28px] bg-hero p-4 text-heroInk shadow-xl">
      
      <ProgressRing size={64} stroke={6} value={remaining / total} className="stroke-accent" trackClassName="stroke-heroInk/10">
        <span className="font-mono text-[15px] font-semibold">{mm}:{ss}</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Rest</p>
        <p className="truncate text-[12.5px] text-heroMuted">Next: {nextLabel}</p>
      </div>
      <button type="button" onClick={onAdd} className="h-10 rounded-full bg-heroInk/10 px-3 text-[13px] font-semibold">+15s</button>
      <button type="button" onClick={onSkip} className="h-10 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accentInk">Skip</button>
    </motion.div>);

}
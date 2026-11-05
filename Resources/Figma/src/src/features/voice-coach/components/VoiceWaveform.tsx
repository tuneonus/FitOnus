import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const bars = [0.35, 0.6, 0.9, 0.5, 1, 0.7, 0.4, 0.85, 0.55, 0.95, 0.45, 0.7, 0.3];

export function VoiceWaveform({ active }: {active: boolean;}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-24 items-center justify-center gap-[5px]" aria-hidden="true">
      {bars.map((h, i) =>
      <motion.span
        key={i}
        className="w-[5px] rounded-full bg-accent"
        initial={{ height: 6 }}
        animate={
        active && !reduce ?
        { height: [8, h * 80, 12, h * 56, 8] } :
        { height: active ? h * 40 : 6 }
        }
        transition={active && !reduce ? { duration: 1.1, repeat: Infinity, delay: i * 0.06, ease: 'easeInOut' } : { duration: 0.2 }} />

      )}
    </div>);

}
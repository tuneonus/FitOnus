import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[30px] w-[50px] shrink-0 rounded-full p-[3px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-40',
        checked ? 'bg-accentStrong' : 'bg-ink/15'
      )}>
      
      <motion.span
        className="block h-6 w-6 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} />
      
    </button>);

}
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, Loader2Icon } from 'lucide-react';
import { toolLabels } from '../services/aiToolContracts';
import type { ToolName } from '../types/coach';

/** AI processing state: shows which data tools the coach is calling. */
export function ThinkingIndicator({ toolCalls = [] }: {toolCalls?: ToolName[];}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= toolCalls.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 480);
    return () => clearTimeout(t);
  }, [step, toolCalls.length]);

  return (
    <div role="status" aria-live="polite" className="space-y-1.5">
      {toolCalls.map((tool, i) =>
      <motion.p
        key={tool}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: i <= step ? 1 : 0, y: i <= step ? 0 : 4 }}
        transition={{ duration: 0.18 }}
        className="flex items-center gap-2 text-[13px] text-muted">
        
          {i < step ?
        <CheckIcon size={14} className="text-good" aria-hidden="true" /> :

        <Loader2Icon size={14} className="animate-spin" aria-hidden="true" />
        }
          {toolLabels[tool]}
        </motion.p>
      )}
      {step >= toolCalls.length &&
      <div className="flex items-center gap-1 pt-1" aria-label="Coach is typing">
          {[0, 1, 2].map((i) =>
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-ink/40"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />

        )}
        </div>
      }
    </div>);

}
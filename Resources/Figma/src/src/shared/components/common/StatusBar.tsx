import React from 'react';
import { BatteryFullIcon, SignalIcon, WifiIcon } from 'lucide-react';

export function StatusBar({ tone = 'default' }: {tone?: 'default' | 'hero';}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between px-8 ${
      tone === 'hero' ? 'text-heroInk' : 'bg-bg/85 text-ink backdrop-blur-md'}`
      }
      aria-hidden="true">
      
      <span className="font-mono text-[15px] font-semibold">9:41</span>
      <span className="flex items-center gap-1.5">
        <SignalIcon size={15} strokeWidth={2.5} />
        <WifiIcon size={15} strokeWidth={2.5} />
        <BatteryFullIcon size={20} strokeWidth={2} />
      </span>
    </div>);

}
import React from 'react';

type LogoProps = {size?: number;withWordmark?: boolean;tone?: 'default' | 'hero';};

/** FitOnus mark: a rising pulse inside a lime tile. */
export function Logo({ size = 40, withWordmark, tone = 'default' }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="flex items-center justify-center rounded-[30%] bg-accent text-accentInk"
        style={{ width: size, height: size }}
        aria-hidden="true">
        
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <path d="M3 15h4l2.5-6 4 10 2.5-6H21" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {withWordmark &&
      <span className={`text-[22px] font-semibold tracking-[-0.03em] ${tone === 'hero' ? 'text-heroInk' : 'text-ink'}`}>
          FitOnus
        </span>
      }
      {!withWordmark && <span className="sr-only">FitOnus</span>}
    </span>);

}
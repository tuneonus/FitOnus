import React from 'react';
import Image from 'next/image';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** Approved OnusFit app mark, shown on a light tile exactly like the mobile app. */
export function BrandMark({ size = 32, className = '' }: BrandMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/10 ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
    >
      <Image
        src="/brand/onusfit-mark.png"
        alt="OnusFit"
        width={size}
        height={size}
        priority
        className="h-full w-full object-cover"
      />
    </span>
  );
}

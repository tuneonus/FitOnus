'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';

interface ImageThumbnailProps {
  imageUrl: string;
  /** Shown instead of the picture when it cannot be loaded (default: a quiet image icon, never a broken-image glyph). */
  fallback?: React.ReactNode;
  /** Tailwind size classes of the square, e.g. "h-10 w-10". */
  sizeClass?: string;
  /** The `sizes` hint for the image, matching `sizeClass`. */
  sizes?: string;
}

/**
 * Small square picture for a table row. Decorative (the name sits next to it). The public WebP is shown as it is
 * stored (no second, smaller copy exists), so it is scaled down by the browser.
 */
export function ImageThumbnail({
  imageUrl,
  fallback = <ImageIcon className="h-4 w-4 text-ink-500" aria-hidden="true" />,
  sizeClass = 'h-10 w-10',
  sizes = '2.5rem',
}: ImageThumbnailProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`relative flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-900 ring-1 ring-ink-700`}
    >
      {failed ? (
        fallback
      ) : (
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

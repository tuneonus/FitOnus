'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';

/**
 * Small square picture for a notification row. Decorative (the title sits next to it), and if the file cannot be
 * loaded it falls back to a quiet icon rather than a broken-image glyph.
 */
export function NotificationThumbnail({ imageUrl }: { imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-900 ring-1 ring-ink-700">
      {failed ? (
        <ImageIcon className="h-4 w-4 text-ink-500" aria-hidden="true" />
      ) : (
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes="2.5rem"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

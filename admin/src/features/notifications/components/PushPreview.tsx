'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Bell } from 'lucide-react';
import { DESTINATION_LABELS } from '../logic';
import type { NotificationDestination } from '../types';

interface PushPreviewProps {
  title: string;
  body: string;
  destination: NotificationDestination | null;
  /** Public URL (or a local preview) of the notification image. Omitted for a text-only notification. */
  imageUrl?: string | null;
}

/** Approximates how the notification looks in the Android shade. The OS controls the exact rendering. */
export function PushPreview({ title, body, destination, imageUrl = null }: PushPreviewProps) {
  // Keyed by address, so a replaced image gets a fresh chance to load after an earlier one failed.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = imageUrl !== null && imageUrl !== failedUrl;

  return (
    <figure aria-label="Notification preview" className="card-inset p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
          <Bell className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-400">OnusFit · now</p>
          <p className="mt-0.5 break-words text-sm font-semibold text-white">{title || 'Notification title'}</p>
          <p className="mt-0.5 line-clamp-4 whitespace-pre-line break-words text-[13px] leading-snug text-ink-200">
            {body || 'Your message appears here.'}
          </p>
        </div>
      </div>
      {showImage && (
        // Android's expanded notification shows the picture below the text, cropped to about 2:1.
        <div className="relative mt-3 aspect-[2/1] w-full overflow-hidden rounded-md bg-ink-950">
          <Image
            src={imageUrl}
            alt="Notification image"
            fill
            unoptimized
            sizes="18rem"
            className="object-cover"
            onError={() => setFailedUrl(imageUrl)}
          />
        </div>
      )}
      <figcaption className="mt-3 border-t border-ink-800 pt-2 text-[11px] text-ink-400">
        {destination ? `Tapping opens: ${DESTINATION_LABELS[destination]}` : 'Tapping just opens the app.'}
      </figcaption>
    </figure>
  );
}

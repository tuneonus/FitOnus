import React, { useEffect, useRef, useState } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { registerPrivateImageCacheReset } from './private-image-cache';

/** After this many failed loads of the same picture it is treated as unavailable (no endless retries). */
const MAX_FAILURES = 2;

export interface PrivateImageProps {
  /** A short-lived signed URL. */
  uri: string;
  /** From `privateImageCacheKey`: stable across URL refreshes, different for a replaced picture. */
  cacheKey: string;
  style: StyleProp<ImageStyle>;
  /** Called when the picture failed to load, so the screen can ask the server for fresh URLs (an expired one is the usual cause). */
  onNeedsFreshUrl?: () => void;
  /** Shown when the picture is unavailable (deleted elsewhere, or still failing after a refresh). */
  fallback: React.ReactNode;
  contentFit?: 'cover' | 'contain';
  accessibilityLabel?: string;
}

/**
 * A private picture from a signed URL, with the two failure modes handled:
 *
 * - expired URL: the first failure asks the screen for fresh URLs (and the picture then loads from the new one, or from
 *   the on-device cache when it is already there, which is why the cache is keyed by version and not by URL);
 * - missing file: a second failure for the same picture shows the fallback instead of retrying for ever.
 */
export function PrivateImage({
  uri,
  cacheKey,
  style,
  onNeedsFreshUrl,
  fallback,
  contentFit = 'cover',
  accessibilityLabel,
}: PrivateImageProps) {
  const failures = useRef<{ key: string; count: number }>({ key: cacheKey, count: 0 });
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    registerPrivateImageCacheReset();
  }, []);

  // A different picture (or version) starts with a clean slate.
  useEffect(() => {
    failures.current = { key: cacheKey, count: 0 };
    setUnavailable(false);
  }, [cacheKey]);

  // Fresh URLs arriving after the picture was given up on (a pull to refresh, the scheduled refresh) deserve a new try.
  const lastUri = useRef(uri);
  useEffect(() => {
    if (lastUri.current === uri) return;
    lastUri.current = uri;
    if (unavailable) {
      failures.current = { key: cacheKey, count: 0 };
      setUnavailable(false);
    }
  }, [uri, unavailable, cacheKey]);

  if (unavailable) return <>{fallback}</>;

  return (
    <Image
      source={{ uri, cacheKey }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={cacheKey}
      {...(accessibilityLabel !== undefined ? { accessibilityLabel, accessible: true } : {})}
      onError={() => {
        const record = failures.current.key === cacheKey ? failures.current : { key: cacheKey, count: 0 };
        record.count += 1;
        failures.current = record;
        if (record.count >= MAX_FAILURES) setUnavailable(true);
        else onNeedsFreshUrl?.();
      }}
    />
  );
}

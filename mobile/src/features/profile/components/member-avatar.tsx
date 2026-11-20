import React from 'react';
import { PrivateImage } from '@/shared/media/PrivateImage';
import { privateImageCacheKey } from '@/shared/media/private-image';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useAvatar } from '../hooks/use-avatar';

/** At or below this size the 128 px thumbnail is plenty and saves the download; above it the 400 px picture is used. */
const THUMBNAIL_MAX_SIZE = 40;

export interface MemberAvatarProps {
  /** Width and height in points. The picture is a circle of this size. */
  size: number;
  /**
   * What to show when the member has no picture, or it cannot be loaded: the screen's own initials circle content, so every
   * screen keeps its existing look until a picture is set.
   */
  fallback: React.ReactNode;
}

/**
 * The signed-in member's profile picture, or `fallback` (their initials). Used by the profile, the home header and the
 * dashboard, so setting or replacing the picture changes all of them at once.
 *
 * The image cache key is the member, the picture's `version` and the size, so a replaced picture always loads fresh while
 * an unchanged one is reused across the hourly URL refreshes.
 */
export function MemberAvatar({ size, fallback }: MemberAvatarProps) {
  const userId = useAuthStore((state) => state.user?.id);
  const { data, refetch } = useAvatar();
  const avatar = data?.avatar ?? null;
  if (!avatar || !userId) return <>{fallback}</>;

  const thumbnail = size <= THUMBNAIL_MAX_SIZE;
  return (
    <PrivateImage
      uri={thumbnail ? avatar.thumbnailUrl : avatar.url}
      cacheKey={privateImageCacheKey('avatar', userId, avatar.version, thumbnail ? 'thumb' : 'full')}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onNeedsFreshUrl={() => void refetch()}
      fallback={fallback}
      accessibilityLabel="Your profile picture"
    />
  );
}

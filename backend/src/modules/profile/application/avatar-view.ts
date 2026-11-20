import type { PrivateImageUrlIssuer } from '../../../shared/private-media/private-image-urls.js';
import type { MemberAvatarRecord } from './avatar-ports.js';

/** What the app receives. The URLs are short-lived signed URLs (credentials): use them now, never store them. */
export interface AvatarView {
  /** Changes whenever the picture is replaced. Clients put it in their image-cache key so a new picture is never hidden behind an old one. */
  version: string;
  url: string;
  thumbnailUrl: string;
  /** ISO 8601: after this the URLs stop working and a fresh `GET /profile/avatar` is needed. */
  expiresAt: string;
  width: number;
  height: number;
  updatedAt: string;
}

export interface AvatarResponse {
  /** Null when the member has no profile picture (the app shows their initials). */
  avatar: AvatarView | null;
}

/**
 * Builds the view of a member's avatar. Null when there is none, or when the stored key is not this member's own
 * avatar key (a corrupt or foreign row shows nothing rather than someone else's picture; the database CHECK makes this
 * unreachable, this is the second wall).
 */
export function toAvatarView(
  record: MemberAvatarRecord | null,
  urls: PrivateImageUrlIssuer,
): AvatarView | null {
  if (!record) return null;
  const signed = urls.issue(record.userId, 'avatar', record.objectKey);
  if (!signed) return null;
  return {
    version: signed.version,
    url: signed.url,
    thumbnailUrl: signed.thumbnailUrl,
    expiresAt: signed.expiresAt,
    width: record.width,
    height: record.height,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** The member's profile picture as short-lived signed URLs (credentials: shown, never stored or logged). */
export interface AvatarView {
  /** Changes whenever the picture is replaced: part of the image-cache key. */
  version: string;
  url: string;
  thumbnailUrl: string;
  /** After this the URLs stop working; the hook asks again a minute before. */
  expiresAt: string;
  width: number;
  height: number;
  updatedAt: string;
}

export interface AvatarResponse {
  /** Null when the member has no picture (the app shows their initials). */
  avatar: AvatarView | null;
}

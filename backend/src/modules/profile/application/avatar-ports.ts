/** A member's profile picture as stored: a key in the PRIVATE bucket, never a URL. */
export interface MemberAvatarRecord {
  userId: string;
  objectKey: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveAvatarParams {
  objectKey: string;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * Every method is scoped to one user id taken from the authenticated session: there is no way to name another
 * member's avatar. Replacing or removing the row queues the old picture's objects for deletion inside the database
 * (migration 0026), so no method needs to, or can forget to, clean up.
 */
export interface AvatarRepository {
  find(userId: string): Promise<MemberAvatarRecord | null>;
  /** Inserts the user's avatar, or replaces the existing one (one row per user). */
  save(userId: string, picture: SaveAvatarParams): Promise<MemberAvatarRecord>;
  /** True when there was an avatar to remove. */
  remove(userId: string): Promise<boolean>;
}

export type ProgressPhotoTag = 'front' | 'side' | 'back' | 'other';

/** A photo in the gallery: the thumbnail only. */
export interface ProgressPhotoItem {
  id: string;
  /** `YYYY-MM-DD`, the member's own calendar day. */
  takenOn: string;
  tag: ProgressPhotoTag | null;
  width: number;
  height: number;
  createdAt: string;
  /** Changes whenever the stored picture changes: part of the image-cache key. */
  version: string;
  /** A short-lived signed URL (a credential): shown, never stored or logged. */
  thumbnailUrl: string;
  urlExpiresAt: string;
}

/** One photo with its full-size picture. */
export interface ProgressPhotoDetail extends ProgressPhotoItem {
  url: string;
}

export interface ProgressPhotoGallery {
  photos: ProgressPhotoItem[];
  count: number;
  limit: number;
  nearLimit: boolean;
}

export interface ProgressPhotoUploadResult {
  photo: ProgressPhotoDetail;
  count: number;
  limit: number;
  nearLimit: boolean;
}

export interface ProgressPhotoDeleteResult {
  id: string;
  deleted: true;
  count: number;
  limit: number;
  nearLimit: boolean;
}

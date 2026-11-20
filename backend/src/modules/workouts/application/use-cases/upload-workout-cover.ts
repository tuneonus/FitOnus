import type { ImageLogger } from '../../../../shared/images/public-image-check.js';
import type { ProcessedImage } from '../../../../shared/images/image-processor.js';
import {
  PublicImageUploader,
  type PublicImageUploadInput,
  type UploadedPublicImage,
} from '../../../../shared/images/public-image-upload.js';
import type { PublicObjectStore } from '../../../../shared/storage/object-store.js';
import type { IWorkoutAuditLogger } from '../ports.js';

export interface UploadWorkoutCoverDeps {
  /** Null when R2 is not configured: uploads then answer 503 and templates without a cover are unaffected. */
  store: PublicObjectStore | null;
  /** Converts an upload with the `workouts` size profile. Null turns uploads off like a missing store. */
  process: ((bytes: Uint8Array) => Promise<ProcessedImage>) | null;
  resolveUrl: (key: string | null) => string | null;
  audit: IWorkoutAuditLogger;
  logger?: ImageLogger | undefined;
}

export interface UploadWorkoutCoverActor {
  adminId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Stores one admin-supplied cover picture for a system workout template in the public media bucket and returns its key
 * and public URL.
 *
 * All of the validation, conversion and storage is the shared `PublicImageUploader`: the stored result is one optimized
 * WebP (at most 1600 px on the long side, no EXIF or other metadata) named by a random key under `onusfit/workouts/`.
 * The route has already required `admin:access` and applied the admin upload rate limit; this adds the audit entry.
 * Uploading does not attach the picture to anything: the admin saves the template with the returned key, and an
 * upload that is never saved simply stays unreferenced in the bucket (it is never deleted here).
 */
export class UploadWorkoutCoverUseCase {
  constructor(private readonly deps: UploadWorkoutCoverDeps) {}

  async execute(actor: UploadWorkoutCoverActor, input: PublicImageUploadInput): Promise<UploadedPublicImage> {
    const uploader = new PublicImageUploader({
      store: this.deps.store,
      process: this.deps.process,
      resolveUrl: this.deps.resolveUrl,
      logger: this.deps.logger,
      label: 'Workout cover',
    });
    const { image, auditDetails } = await uploader.upload('workouts', input);

    await this.deps.audit.logAction(
      actor.adminId,
      'workout.template.cover_upload',
      auditDetails,
      null,
      actor.ipAddress,
      actor.userAgent,
    );
    return image;
  }
}

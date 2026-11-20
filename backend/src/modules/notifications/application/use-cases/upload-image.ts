import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import {
  PublicImageUploader,
  type PublicImageUploadInput,
} from '../../../../shared/images/public-image-upload.js';
import type {
  AdminAuditPort,
  NotificationImageProcessor,
  NotificationImages,
  UploadedImageView,
} from '../ports.js';
import type { DispatcherLogger } from '../services/notification-dispatcher.js';
import type { RequestMeta } from './campaigns.js';

export type ImageUploadInput = PublicImageUploadInput;

interface Deps {
  images: NotificationImages;
  /** Null when image handling is not available: uploads then answer 503 like an unconfigured store. */
  processor: NotificationImageProcessor | null;
  audit: AdminAuditPort;
  logger?: DispatcherLogger;
}

/**
 * Stores one admin-supplied image for a notification in the public media bucket and returns its key and public URL.
 *
 * All of the validation, conversion and storage is the shared `PublicImageUploader` (see shared/images): the stored
 * result is an optimized WebP with no EXIF or other metadata, plus a JPEG for the push, named by a random key under
 * `onusfit/notifications/`. This use case adds what belongs to notifications: the `notifications:send` permission
 * and the audit entry. The bucket is public: this endpoint is for admin marketing artwork, never a member's photo.
 */
export class UploadNotificationImageUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: ImageUploadInput, meta: RequestMeta = {}): Promise<UploadedImageView> {
    assertPermission(actor, 'notifications:send');
    const { store, resolveUrl } = this.deps.images;
    const { processor, logger } = this.deps;

    const uploader = new PublicImageUploader({
      store,
      process: processor ? (bytes) => processor.process(bytes) : null,
      resolveUrl,
      logger,
      label: 'Notification',
    });
    const { image, auditDetails } = await uploader.upload('notifications', input);

    await this.deps.audit.recordAuditLog({
      adminId: actor.userId,
      action: 'notification.image_upload',
      details: auditDetails,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return image;
  }
}

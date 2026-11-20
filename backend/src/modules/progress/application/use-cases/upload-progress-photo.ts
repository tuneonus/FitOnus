import type { Actor } from '../../../../shared/auth/actor.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { ImageLogger } from '../../../../shared/images/public-image-check.js';
import {
  privateStorageNotConfigured,
  type PrivateImageUploadInput,
  type PrivateMedia,
} from '../../../../shared/private-media/index.js';
import {
  EARLIEST_PHOTO_DAY,
  PROGRESS_PHOTO_LIMIT,
  ProgressPhotoLimitReachedError,
  defaultPhotoDay,
  isCalendarDate,
  latestPhotoDay,
  type ProgressPhotoTag,
} from '../../domain/progress-photo.js';
import type { ProgressPhotoRepository } from '../photo-ports.js';
import { galleryCounts, toPhotoView, type ProgressPhotoUploadResult } from '../photo-view.js';

export interface UploadProgressPhotoDeps {
  photos: ProgressPhotoRepository;
  /** Null when private media is not configured: uploads then answer 503. */
  media: PrivateMedia | null;
  logger?: ImageLogger | undefined;
  now?: () => Date;
}

export interface UploadProgressPhotoInput {
  /** `YYYY-MM-DD`, the member's own calendar day. Today (UTC) when absent. */
  takenOn?: string | undefined;
  tag?: ProgressPhotoTag | undefined;
  image: PrivateImageUploadInput;
}

const limitReached = (): AppError =>
  new AppError(
    'conflict',
    'PHOTO_LIMIT_REACHED',
    `You can keep up to ${PROGRESS_PHOTO_LIMIT} progress photos. Delete one to add another.`,
  );

const invalidDay = (message: string): AppError =>
  new AppError('validation', 'VALIDATION_FAILED', 'The request is invalid.', [
    { location: 'query', path: 'takenOn', message },
  ]);

/**
 * Adds one progress photo for the signed-in member.
 *
 * Order matters: the cheap refusals (storage off, bad date, limit already reached) come before the body is read, so a
 * member at the limit never makes the server decode a 10 MB photo only to refuse it. After that the picture is converted
 * (at most 1600 px, WebP, no EXIF or GPS) and written to the private bucket with a 200 px thumbnail, then one INSERT
 * records it. The database is the authority on the limit of 50 (it counts under a per-member lock), so two uploads racing
 * at 49 photos cannot both succeed; the loser's stored objects are removed again. Any failure after storing removes
 * (or queues) what was stored, so nothing is left behind.
 */
export class UploadProgressPhotoUseCase {
  constructor(private readonly deps: UploadProgressPhotoDeps) {}

  async execute(actor: Actor, input: UploadProgressPhotoInput): Promise<ProgressPhotoUploadResult> {
    const { photos, media } = this.deps;
    if (!media) throw privateStorageNotConfigured();

    const now = (this.deps.now ?? (() => new Date()))();
    const takenOn = input.takenOn ?? defaultPhotoDay(now);
    if (!isCalendarDate(takenOn)) throw invalidDay('Use a real date written YYYY-MM-DD.');
    if (takenOn < EARLIEST_PHOTO_DAY) throw invalidDay(`The date cannot be before ${EARLIEST_PHOTO_DAY}.`);
    if (takenOn > latestPhotoDay(now)) throw invalidDay('The date cannot be in the future.');

    if ((await photos.count(actor.userId)) >= PROGRESS_PHOTO_LIMIT) throw limitReached();

    const stored = await media.uploader.upload(actor.userId, 'progress', input.image);
    let record;
    try {
      record = await photos.insert(actor.userId, {
        objectKey: stored.key,
        takenOn,
        tag: input.tag ?? null,
        width: stored.width,
        height: stored.height,
        byteSize: stored.byteSize,
      });
    } catch (error) {
      await media.uploader.discard(stored);
      if (error instanceof ProgressPhotoLimitReachedError) throw limitReached();
      throw error;
    }

    const photo = toPhotoView(record, media.urls);
    if (!photo) throw new Error("A progress photo was stored under a key that is not its owner's");
    return { photo, ...galleryCounts(await photos.count(actor.userId)) };
  }
}

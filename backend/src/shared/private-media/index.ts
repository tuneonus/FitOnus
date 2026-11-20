import type { SqlExecutor } from '../../database/transaction.js';
import type { ImageLogger } from '../images/public-image-check.js';
import { R2PrivateObjectStore } from '../storage/r2-private-object-store.js';
import type { PrivateObjectStore } from '../storage/private-object-store.js';
import type { PrivateMediaDeletionQueue } from './deletion-queue.js';
import { PgPrivateMediaDeletionQueue } from './pg-deletion-queue.js';
import type { PrivateMediaConfig } from './private-media-config.js';
import { PrivateImageProcessor, type ImageIntake } from './private-image-processor.js';
import { PrivateImageUploader } from './private-image-uploader.js';
import { PrivateMediaPurger } from './private-media-purger.js';
import { PrivateImageUrlIssuer } from './private-image-urls.js';

export * from './private-image-policy.js';
export type { PrivateMediaDeletionQueue } from './deletion-queue.js';
export { PgPrivateMediaDeletionQueue } from './pg-deletion-queue.js';
export { PrivateImageProcessor, type ImageIntake } from './private-image-processor.js';
export {
  PrivateImageUploader,
  privateStorageNotConfigured,
  privateStorageUnavailable,
  type PrivateImageUploadInput,
  type StoredPrivateImage,
} from './private-image-uploader.js';
export { PrivateMediaPurger } from './private-media-purger.js';
export { PrivateImageUrlIssuer, type SignedImageUrls } from './private-image-urls.js';
export { parsePrivateMediaConfig, type PrivateMediaConfig } from './private-media-config.js';

/** Everything a feature needs to keep member photos privately. `null` (not configured) turns those features off. */
export interface PrivateMedia {
  store: PrivateObjectStore;
  uploader: PrivateImageUploader;
  urls: PrivateImageUrlIssuer;
  deletionQueue: PrivateMediaDeletionQueue;
  purger: PrivateMediaPurger;
  /** Whether the container should start the purger's background loop (PRIVATE_MEDIA_PURGE_ENABLED). */
  purgeEnabled: boolean;
}

export interface CreatePrivateMediaDeps {
  /** Null when private media is not configured. */
  config: PrivateMediaConfig | null;
  db: SqlExecutor;
  /** The shared decode/validate pipeline (the same `ImageProcessor` the public features use). */
  intake: ImageIntake;
  logger?: ImageLogger | undefined;
  /** Tests inject an in-memory store here so nothing reaches real storage. Wins over `config`. */
  store?: PrivateObjectStore | null;
  /** Used with an injected `store`, where there is no `config`. */
  urlTtlSeconds?: number;
}

export function createPrivateMedia(deps: CreatePrivateMediaDeps): PrivateMedia | null {
  const { config } = deps;
  const store: PrivateObjectStore | null =
    deps.store !== undefined
      ? deps.store
      : config
        ? new R2PrivateObjectStore({
            accountId: config.accountId,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            bucket: config.bucket,
            timeoutMs: config.timeoutMs,
          })
        : null;
  if (!store) return null;

  const deletionQueue = new PgPrivateMediaDeletionQueue(deps.db);
  const processor = new PrivateImageProcessor({ intake: deps.intake });
  return {
    store,
    deletionQueue,
    uploader: new PrivateImageUploader({ store, processor, deletionQueue, logger: deps.logger }),
    urls: new PrivateImageUrlIssuer(store, config?.urlTtlSeconds ?? deps.urlTtlSeconds ?? 900),
    purger: new PrivateMediaPurger({
      queue: deletionQueue,
      store,
      logger: deps.logger,
      enabled: config?.purgeEnabled ?? true,
    }),
    purgeEnabled: config?.purgeEnabled ?? false,
  };
}

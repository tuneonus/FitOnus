import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import { parseContentLength, readBodyUpTo } from '../../../shared/http/read-upload-body.js';
import type { RouteResult } from '../../../shared/http/route.js';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../shared/images/image-policy.js';
import type {
  ProgressPhotoGallery,
  ProgressPhotoUploadResult,
  ProgressPhotoView,
} from '../application/photo-view.js';
import type {
  DeleteProgressPhotoResult,
  DeleteProgressPhotoUseCase,
} from '../application/use-cases/delete-progress-photo.js';
import type { GetProgressPhotoUseCase } from '../application/use-cases/get-progress-photo.js';
import type { ListProgressPhotosUseCase } from '../application/use-cases/list-progress-photos.js';
import type { UploadProgressPhotoUseCase } from '../application/use-cases/upload-progress-photo.js';
import { progressPhotoIdRequest, uploadProgressPhotoRequest } from './photo.schemas.js';

export interface ProgressPhotoUseCases {
  list: ListProgressPhotosUseCase;
  get: GetProgressPhotoUseCase;
  upload: UploadProgressPhotoUseCase;
  delete: DeleteProgressPhotoUseCase;
}

export type ProgressPhotoController = ReturnType<typeof createProgressPhotoController>;

/** Responses carry signed URLs (credentials for private pictures): no cache may keep them. */
const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export function createProgressPhotoController(useCases: ProgressPhotoUseCases) {
  return {
    list: async (req: Request): Promise<RouteResult<ProgressPhotoGallery>> => {
      const data = await useCases.list.execute(requireActor(req));
      return { data, headers: PRIVATE_NO_STORE, message: 'Progress photos retrieved' };
    },

    get: async (req: Request): Promise<RouteResult<ProgressPhotoView>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, progressPhotoIdRequest);
      const data = await useCases.get.execute(actor, params.id);
      return { data, headers: PRIVATE_NO_STORE, message: 'Progress photo retrieved' };
    },

    /**
     * The body is the raw image (`Content-Type: image/jpeg|png|webp|heic`), the metadata is in the query string. The body
     * is read inside the use case only after authentication, the date check and the limit check have passed.
     */
    upload: async (req: Request): Promise<RouteResult<ProgressPhotoUploadResult>> => {
      const actor = requireActor(req);
      const { query } = getValidated(req, uploadProgressPhotoRequest);
      const data = await useCases.upload.execute(actor, {
        takenOn: query.takenOn,
        tag: query.tag,
        image: {
          contentType: req.get('content-type'),
          declaredLength: parseContentLength(req.get('content-length')),
          readBody: () => readBodyUpTo(req, IMAGE_UPLOAD_MAX_BYTES),
        },
      });
      return { data, status: 201, headers: PRIVATE_NO_STORE, message: 'Progress photo saved' };
    },

    delete: async (req: Request): Promise<RouteResult<DeleteProgressPhotoResult>> => {
      const actor = requireActor(req);
      const { params } = getValidated(req, progressPhotoIdRequest);
      const data = await useCases.delete.execute(actor, params.id);
      return { data, headers: PRIVATE_NO_STORE, message: 'Progress photo deleted' };
    },
  };
}

import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { IMAGE_UPLOAD_MAX_BYTES } from '../../../shared/images/image-policy.js';
import { parseContentLength, readBodyUpTo } from '../../../shared/http/read-upload-body.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { AvatarResponse } from '../application/avatar-view.js';
import type { GetAvatarUseCase } from '../application/use-cases/get-avatar.js';
import type { RemoveAvatarUseCase } from '../application/use-cases/remove-avatar.js';
import type { UploadAvatarUseCase } from '../application/use-cases/upload-avatar.js';

export interface AvatarUseCases {
  getAvatar: GetAvatarUseCase;
  uploadAvatar: UploadAvatarUseCase;
  removeAvatar: RemoveAvatarUseCase;
}

export type AvatarController = ReturnType<typeof createAvatarController>;

/** The response carries signed URLs (credentials for a private picture): no cache may keep it. */
const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export function createAvatarController(useCases: AvatarUseCases) {
  return {
    get: async (req: Request): Promise<RouteResult<AvatarResponse>> => {
      const actor = requireActor(req);
      const data = await useCases.getAvatar.execute(actor);
      return { data, headers: PRIVATE_NO_STORE, message: 'Profile picture retrieved' };
    },

    /**
     * The body is the raw image (`Content-Type: image/jpeg|png|webp|heic`). It is read here, inside the handler, which
     * the route chain only reaches after authentication: a caller who is not signed in never makes the server buffer
     * a byte.
     */
    upload: async (req: Request): Promise<RouteResult<AvatarResponse>> => {
      const actor = requireActor(req);
      const data = await useCases.uploadAvatar.execute(actor, {
        contentType: req.get('content-type'),
        declaredLength: parseContentLength(req.get('content-length')),
        readBody: () => readBodyUpTo(req, IMAGE_UPLOAD_MAX_BYTES),
      });
      return { data, headers: PRIVATE_NO_STORE, message: 'Profile picture saved' };
    },

    remove: async (req: Request): Promise<RouteResult<AvatarResponse>> => {
      const actor = requireActor(req);
      const data = await useCases.removeAvatar.execute(actor);
      return { data, headers: PRIVATE_NO_STORE, message: 'Profile picture removed' };
    },
  };
}

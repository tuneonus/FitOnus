import type { RequestHandler } from 'express';
import { defineRoute, type AnyRouteSpec } from '../../../shared/http/route.js';
import type { AvatarController } from './avatar.controller.js';
import { avatarResponseSchema } from './avatar.schemas.js';

const tags = ['Profile & Onboarding'];

export interface AvatarRouteLimiters {
  /** Member photo uploads: each one decodes and re-encodes a picture. */
  memberImageUploads: RequestHandler;
}

/** The avatar routes, mounted on the profile group (`/api/v1/profile/avatar`). */
export function createAvatarRoutes(
  controller: AvatarController,
  limiters?: AvatarRouteLimiters,
): readonly AnyRouteSpec[] {
  return [
    defineRoute({
      method: 'get',
      path: '/avatar',
      summary: 'Get my profile picture',
      description:
        "The signed-in member's own profile picture as short-lived signed URLs (picture and thumbnail), or `avatar: null`. " +
        'The URLs expire at `expiresAt`; request fresh ones then. `version` changes whenever the picture is replaced.',
      tags,
      access: { kind: 'authenticated' },
      response: {
        status: 200,
        description: 'The profile picture, or null',
        message: 'Profile picture retrieved',
        schema: avatarResponseSchema,
      },
      handler: controller.get,
    }),
    defineRoute({
      method: 'put',
      path: '/avatar',
      summary: 'Set my profile picture',
      description:
        'The body is the raw image (not JSON or multipart) with `Content-Type: image/jpeg`, `image/png`, `image/webp` or ' +
        '`image/heic`, up to 10 MiB. It is converted to an optimized square WebP (at most 400 px, all metadata removed) ' +
        'and stored privately with a thumbnail; a previous picture is replaced and removed from storage. Answers 503 when ' +
        'private photo storage is not configured.',
      tags,
      access: { kind: 'authenticated' },
      middleware: limiters ? [limiters.memberImageUploads] : [],
      response: {
        status: 200,
        description: 'The new profile picture',
        message: 'Profile picture saved',
        schema: avatarResponseSchema,
      },
      errorStatuses: [413, 415, 422, 429, 503],
      handler: controller.upload,
    }),
    defineRoute({
      method: 'delete',
      path: '/avatar',
      summary: 'Remove my profile picture',
      description:
        "Removes the signed-in member's profile picture. Succeeds when there is none. The stored files are deleted " +
        'from private storage in the background and retried until storage accepts.',
      tags,
      access: { kind: 'authenticated' },
      response: {
        status: 200,
        description: 'No profile picture',
        message: 'Profile picture removed',
        schema: avatarResponseSchema,
      },
      handler: controller.remove,
    }),
  ];
}

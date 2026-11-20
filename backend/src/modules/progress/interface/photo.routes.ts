import type { RequestHandler } from 'express';
import { defineRoute, type AnyRouteSpec } from '../../../shared/http/route.js';
import type { ProgressPhotoController } from './photo.controller.js';
import {
  progressPhotoDeleteResultSchema,
  progressPhotoGallerySchema,
  progressPhotoIdRequest,
  progressPhotoUploadResultSchema,
  progressPhotoViewSchema,
  uploadProgressPhotoRequest,
} from './photo.schemas.js';

const tags = ['Progress'];

export interface PhotoRouteLimiters {
  /** Member photo uploads: each one decodes and re-encodes a picture. */
  memberImageUploads: RequestHandler;
}

/** The progress-photo routes, mounted on the progress group (`/api/v1/progress/photos`). */
export function createProgressPhotoRoutes(
  controller: ProgressPhotoController,
  limiters?: PhotoRouteLimiters,
): readonly AnyRouteSpec[] {
  return [
    defineRoute({
      method: 'get',
      path: '/photos',
      summary: 'List my progress photos',
      description:
        "The signed-in member's own photos, newest day first, as thumbnails with short-lived signed URLs (valid until " +
        '`urlExpiresAt`; ask again after). At most 50, so there is no paging. `count`, `limit` and `nearLimit` tell the app ' +
        'when to warn. Answers 503 when private photo storage is not configured.',
      tags,
      access: { kind: 'authenticated' },
      response: {
        status: 200,
        description: 'The gallery',
        message: 'Progress photos retrieved',
        schema: progressPhotoGallerySchema,
      },
      errorStatuses: [503],
      handler: controller.list,
    }),
    defineRoute({
      method: 'post',
      path: '/photos',
      summary: 'Add a progress photo',
      description:
        'The body is the raw image (not JSON or multipart) with `Content-Type: image/jpeg`, `image/png`, `image/webp` or ' +
        "`image/heic`, up to 10 MiB. Optional query: `takenOn` (YYYY-MM-DD, the member's own day, default today) and `tag` " +
        '(front, side, back, other). Converted to an optimized WebP (at most 1600 px, all metadata removed) with a 200 px ' +
        'thumbnail and stored privately. Answers 409 PHOTO_LIMIT_REACHED at 50 photos and 503 when storage is not configured.',
      tags,
      access: { kind: 'authenticated' },
      middleware: limiters ? [limiters.memberImageUploads] : [],
      request: uploadProgressPhotoRequest,
      response: {
        status: 201,
        description: 'The stored photo',
        message: 'Progress photo saved',
        schema: progressPhotoUploadResultSchema,
      },
      errorStatuses: [409, 413, 415, 422, 429, 503],
      handler: controller.upload,
    }),
    defineRoute({
      method: 'get',
      path: '/photos/:id',
      summary: 'Get one of my progress photos',
      description:
        "One of the signed-in member's own photos with its full-size picture URL (short-lived). Another member's photo " +
        'is answered exactly like one that does not exist: 404.',
      tags,
      access: { kind: 'authenticated' },
      request: progressPhotoIdRequest,
      response: {
        status: 200,
        description: 'The photo',
        message: 'Progress photo retrieved',
        schema: progressPhotoViewSchema,
      },
      errorStatuses: [404, 503],
      handler: controller.get,
    }),
    defineRoute({
      method: 'delete',
      path: '/photos/:id',
      summary: 'Delete one of my progress photos',
      description:
        'Deletes the photo for good. Its stored files are removed from private storage in the background and retried until ' +
        "storage accepts. Another member's photo is a 404.",
      tags,
      access: { kind: 'authenticated' },
      request: progressPhotoIdRequest,
      response: {
        status: 200,
        description: 'Deletion confirmation and the new count',
        message: 'Progress photo deleted',
        schema: progressPhotoDeleteResultSchema,
      },
      errorStatuses: [404],
      handler: controller.delete,
    }),
  ];
}

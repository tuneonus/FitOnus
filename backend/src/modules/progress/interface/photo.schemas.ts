import { z } from 'zod';
import { PROGRESS_PHOTO_LIMIT, PROGRESS_PHOTO_TAGS } from '../domain/progress-photo.js';

const VERSION = /^[0-9a-f]{32}$/;

const photoBase = {
  id: z.string().uuid(),
  takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tag: z.enum(PROGRESS_PHOTO_TAGS).nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string().datetime(),
  version: z.string().regex(VERSION),
  thumbnailUrl: z.string().url(),
  urlExpiresAt: z.string().datetime(),
};

const counts = {
  count: z.number().int().nonnegative(),
  limit: z.literal(PROGRESS_PHOTO_LIMIT),
  nearLimit: z.boolean(),
};

export const progressPhotoListItemSchema = z.object(photoBase);
export const progressPhotoViewSchema = z.object({ ...photoBase, url: z.string().url() });

export const progressPhotoGallerySchema = z.object({
  photos: z.array(progressPhotoListItemSchema),
  ...counts,
});

export const progressPhotoUploadResultSchema = z.object({ photo: progressPhotoViewSchema, ...counts });

export const progressPhotoDeleteResultSchema = z.object({
  id: z.string().uuid(),
  deleted: z.literal(true),
  ...counts,
});

/** The photo's metadata travels in the query string, because the body is the raw image. Unknown keys are refused. */
export const uploadProgressPhotoRequest = {
  query: z
    .object({
      takenOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date written YYYY-MM-DD')
        .optional(),
      tag: z.enum(PROGRESS_PHOTO_TAGS).optional(),
    })
    .strict(),
};

export const progressPhotoIdRequest = {
  params: z.object({ id: z.string().uuid() }),
};

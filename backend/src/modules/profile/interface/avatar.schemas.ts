import { z } from 'zod';

export const avatarViewSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{32}$/),
  url: z.string().url(),
  thumbnailUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});

export const avatarResponseSchema = z.object({
  avatar: avatarViewSchema.nullable(),
});

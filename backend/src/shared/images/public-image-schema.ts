import { z } from 'zod';

/** What every public image upload endpoint answers with (notifications, exercises). */
export const uploadedPublicImageSchema = z.object({
  imageKey: z.string(),
  imageUrl: z.string(),
  // Whatever was uploaded, the stored image is an optimized WebP.
  contentType: z.literal('image/webp'),
  sizeBytes: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  source: z.object({
    format: z.enum(['jpeg', 'png', 'webp', 'heic']),
    bytes: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
  }),
});

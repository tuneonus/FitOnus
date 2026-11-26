import { z } from 'zod';
import type { RequestSchemas } from '../../../middleware/validate.js';
import type { KnowledgeCategory, ProcessingStatus, ReindexStatus } from '../domain/knowledge.types.js';

export const knowledgeCategorySchema = z.enum([
  'fitness',
  'nutrition',
  'recovery',
  'app_guide',
]) as z.ZodType<KnowledgeCategory>;

export const processingStatusSchema = z.enum([
  'ready',
  'processing',
  'failed',
  'pending',
]) as z.ZodType<ProcessingStatus>;

export const reindexStatusSchema = z.enum(['processing', 'failed', 'completed']) as z.ZodType<ReindexStatus>;

export const knowledgeDocumentViewSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: knowledgeCategorySchema,
  author: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  version: z.number(),
  isActive: z.boolean().default(true),
  contentHash: z.string().nullable().optional(),
  processingStatus: processingStatusSchema.default('ready'),
  processingError: z.string().nullable().optional(),
  reindexStatus: reindexStatusSchema.nullable().optional(),
  reindexError: z.string().nullable().optional(),
  lastReindexedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export const knowledgeChunkViewSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  chunkIndex: z.number(),
  content: z.string(),
  tokenCount: z.number(),
  createdAt: z.union([z.string(), z.date()]),
});

export const knowledgeDocumentDetailViewSchema = knowledgeDocumentViewSchema.extend({
  content: z.string(),
  chunks: z.array(knowledgeChunkViewSchema).optional(),
});

export const documentIngestResponseSchema = z.object({
  document: knowledgeDocumentViewSchema,
  chunkCount: z.number(),
  message: z.string().optional(),
});

export const reindexDocumentResponseSchema = z.object({
  document: knowledgeDocumentViewSchema,
  chunkCount: z.number(),
  message: z.string().optional(),
});

export const deleteDocumentResponseSchema = z.object({
  idOrSlug: z.string(),
  deleted: z.boolean(),
});

export const createDocumentAdminBodySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(
      /^[a-z0-9_-]+$/,
      'Slug must only contain lowercase alphanumeric characters, hyphens, and underscores.',
    )
    .optional(),
  category: knowledgeCategorySchema,
  content: z.string().trim().min(20, 'Content must be at least 20 characters.'),
  author: z.string().trim().max(255).optional(),
  license: z.string().trim().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createDocumentAdminRequest: RequestSchemas = {
  body: createDocumentAdminBodySchema,
};

export const updateDocumentStatusBodySchema = z.object({
  isActive: z.boolean(),
});

export const updateDocumentStatusRequest: RequestSchemas = {
  params: z.object({
    idOrSlug: z.string().trim().min(1),
  }),
  body: updateDocumentStatusBodySchema,
};

export const updateDocumentMetadataBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  category: knowledgeCategorySchema.optional(),
  author: z.string().trim().max(255).optional(),
  license: z.string().trim().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateDocumentMetadataRequest: RequestSchemas = {
  params: z.object({
    idOrSlug: z.string().trim().min(1),
  }),
  body: updateDocumentMetadataBodySchema,
};

export const reindexDocumentRequest: RequestSchemas = {
  params: z.object({
    idOrSlug: z.string().trim().min(1),
  }),
};

export const listDocumentsAdminQuerySchema = z.object({
  category: knowledgeCategorySchema.optional(),
  isActive: z
    .preprocess((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return val;
    }, z.boolean())
    .optional(),
  status: processingStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(),
});

export const listDocumentsAdminRequest: RequestSchemas = {
  query: listDocumentsAdminQuerySchema,
};

export const getDocumentAdminParamsSchema = z.object({
  idOrSlug: z.string().trim().min(1),
});

export const getDocumentAdminQuerySchema = z.object({
  includeChunks: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export const getDocumentAdminRequest: RequestSchemas = {
  params: getDocumentAdminParamsSchema,
  query: getDocumentAdminQuerySchema,
};

export const deleteDocumentAdminRequest: RequestSchemas = {
  params: z.object({
    idOrSlug: z.string().trim().min(1),
  }),
};

export const searchKnowledgeAdminBodySchema = z.object({
  query: z.string().trim().min(1, 'Search query cannot be empty').max(1000),
  category: knowledgeCategorySchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  vectorWeight: z.coerce.number().min(0).max(1).optional(),
  textWeight: z.coerce.number().min(0).max(1).optional(),
  rrfK: z.coerce.number().int().min(1).max(100).optional(),
  testRagContext: z.boolean().default(true),
});

export const searchKnowledgeAdminRequest: RequestSchemas = {
  body: searchKnowledgeAdminBodySchema,
};

export const knowledgeSearchResultViewSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  documentSlug: z.string(),
  documentTitle: z.string(),
  documentCategory: knowledgeCategorySchema,
  chunkIndex: z.number(),
  content: z.string(),
  tokenCount: z.number(),
  similarity: z.number().optional(),
  textRank: z.number().optional(),
  rrfScore: z.number().optional(),
  denseRank: z.number().optional(),
  textualRank: z.number().optional(),
});

export const groundedCitationSchema = z.object({
  documentSlug: z.string(),
  documentTitle: z.string(),
  category: z.string().optional(),
  chunkIndex: z.number().optional(),
  citation: z.string(),
});

export const ragContextItemSchema = z.object({
  documentSlug: z.string(),
  documentTitle: z.string(),
  category: z.string(),
  chunkIndex: z.number(),
  content: z.string(),
  citation: z.string(),
  similarity: z.number(),
  rrfScore: z.number(),
});

export const ragContextViewSchema = z.object({
  items: z.array(ragContextItemSchema),
  citations: z.array(groundedCitationSchema),
  formattedPromptSection: z.string(),
  totalTokens: z.number(),
});

export const knowledgeSearchResponseViewSchema = z.object({
  query: z.string(),
  chunks: z.array(knowledgeSearchResultViewSchema),
  ragContext: ragContextViewSchema.optional(),
});

export type KnowledgeDocumentView = z.infer<typeof knowledgeDocumentViewSchema>;
export type KnowledgeDocumentDetailView = z.infer<typeof knowledgeDocumentDetailViewSchema>;
export type KnowledgeChunkView = z.infer<typeof knowledgeChunkViewSchema>;
export type IngestDocumentResponseData = z.infer<typeof documentIngestResponseSchema>;
export type ReindexDocumentResponseData = z.infer<typeof reindexDocumentResponseSchema>;
export type DeleteDocumentResponseData = z.infer<typeof deleteDocumentResponseSchema>;
export type CreateDocumentAdminBody = z.infer<typeof createDocumentAdminBodySchema>;
export type UpdateDocumentStatusBody = z.infer<typeof updateDocumentStatusBodySchema>;
export type UpdateDocumentMetadataBody = z.infer<typeof updateDocumentMetadataBodySchema>;
export type KnowledgeSearchResponseView = z.infer<typeof knowledgeSearchResponseViewSchema>;

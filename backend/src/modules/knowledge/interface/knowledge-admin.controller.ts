import type { Request } from 'express';
import { getValidated } from '../../../middleware/validate.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { parseContentLength, readBodyUpTo } from '../../../shared/http/read-upload-body.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { KnowledgeService } from '../application/knowledge-service.js';
import type { KnowledgeCategory, ProcessingStatus } from '../domain/knowledge.types.js';
import {
  createDocumentAdminRequest,
  deleteDocumentAdminRequest,
  getDocumentAdminRequest,
  listDocumentsAdminRequest,
  reindexDocumentRequest,
  searchKnowledgeAdminRequest,
  updateDocumentMetadataRequest,
  updateDocumentStatusRequest,
  type CreateDocumentAdminBody,
  type DeleteDocumentResponseData,
  type IngestDocumentResponseData,
  type KnowledgeDocumentDetailView,
  type KnowledgeDocumentView,
  type KnowledgeSearchResponseView,
  type ReindexDocumentResponseData,
  type UpdateDocumentMetadataBody,
  type UpdateDocumentStatusBody,
} from './knowledge-admin.schemas.js';
import {
  extractTextFromFile,
  MAX_DOCUMENT_UPLOAD_BYTES,
  sanitizeFileName,
} from './text-extractor.js';

export const KNOWLEDGE_ADMIN_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};

/** Normalizes a string into a URL-friendly slug */
export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  if (base.length >= 3) return base;
  return `${base || 'doc'}-${Date.now().toString(36)}`;
}

function getRequestId(req: Request): string | undefined {
  if (typeof req.id === 'string') return req.id;
  if (typeof req.id === 'number') return req.id.toString();
  return undefined;
}

export type KnowledgeAdminController = ReturnType<typeof createKnowledgeAdminController>;

export function createKnowledgeAdminController(knowledgeService: KnowledgeService) {
  return {
    /**
     * Ingests a file (PDF, TXT, MD) into the knowledge base.
     * Can receive raw file buffer (streamed bounded up to MAX_DOCUMENT_UPLOAD_BYTES)
     * with query/header metadata, or JSON with base64/content.
     */
    uploadDocument: async (req: Request): Promise<RouteResult<IngestDocumentResponseData>> => {
      let buffer: Buffer;
      let contentType = req.get('content-type') || 'application/octet-stream';
      let title: string | undefined = (req.query.title as string) || req.get('x-document-title');
      let category = ((req.query.category as string) || req.get('x-document-category')) as KnowledgeCategory | undefined;
      let slug: string | undefined = (req.query.slug as string) || req.get('x-document-slug');
      let author: string | undefined = (req.query.author as string) || req.get('x-document-author');
      let license: string | undefined = (req.query.license as string) || req.get('x-document-license');
      const rawFileName: string | undefined = (req.query.fileName as string) || req.get('x-file-name');
      const fileName = sanitizeFileName(rawFileName);

      if (contentType.includes('application/json') && req.body && typeof req.body === 'object') {
        const body = req.body as Record<string, unknown>;
        title = (body.title as string) || title;
        category = (body.category as KnowledgeCategory) || category;
        slug = (body.slug as string) || slug;
        author = (body.author as string) || author;
        license = (body.license as string) || license;

        if (body.fileBase64 && typeof body.fileBase64 === 'string') {
          buffer = Buffer.from(body.fileBase64, 'base64');
          if (body.mimeType && typeof body.mimeType === 'string') {
            contentType = body.mimeType;
          }
        } else if (body.content && typeof body.content === 'string') {
          buffer = Buffer.from(body.content, 'utf-8');
          contentType = 'text/plain';
        } else {
          throw new AppError(
            'validation',
            'VALIDATION_FAILED',
            'JSON upload must include either fileBase64 or content string.',
          );
        }
      } else {
        const declaredLength = parseContentLength(req.get('content-length'));
        if (declaredLength !== null && declaredLength > MAX_DOCUMENT_UPLOAD_BYTES) {
          throw new AppError(
            'validation',
            'VALIDATION_FAILED',
            `Document size (${Math.round(declaredLength / 1024 / 1024)} MiB) exceeds maximum allowed size of ${MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024)} MiB.`,
          );
        }
        buffer = await readBodyUpTo(req, MAX_DOCUMENT_UPLOAD_BYTES);
      }

      const extracted = await extractTextFromFile({
        buffer,
        contentType,
        fileName,
      });

      if (!title || !title.trim()) {
        if (fileName) {
          title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
        } else {
          // Fallback: Use first non-empty line of text
          const firstLine = extracted.text.split('\n').map((l) => l.trim()).find(Boolean);
          title = firstLine ? firstLine.slice(0, 100) : 'Ingested Document';
        }
      }

      if (!category) {
        category = 'fitness';
      }

      const validCategories: KnowledgeCategory[] = [
        'fitness',
        'nutrition',
        'recovery',
        'app_guide',
      ];
      if (!validCategories.includes(category)) {
        throw new AppError(
          'validation',
          'VALIDATION_FAILED',
          `Invalid category '${category}'. Allowed: ${validCategories.join(', ')}`,
        );
      }

      const finalSlug = slug ? slugify(slug) : slugify(title);

      const result = await knowledgeService.ingestDocument(
        {
          slug: finalSlug,
          title: title.trim(),
          category,
          content: extracted.text,
          author: author?.trim() || undefined,
          license: license?.trim() || undefined,
          metadata: {
            sourceFileName: fileName ?? null,
            fileType: extracted.detectedType,
            byteLength: extracted.byteLength,
            wordCount: extracted.wordCount,
          },
        },
        getRequestId(req),
      );

      return {
        data: {
          document: result.document,
          chunkCount: result.chunkCount,
        },
        status: 201,
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Document uploaded and ingested successfully',
      };
    },

    /**
     * Direct JSON document creation / ingestion.
     */
    createDocument: async (req: Request): Promise<RouteResult<IngestDocumentResponseData>> => {
      const { body } = getValidated(req, createDocumentAdminRequest) as { body: CreateDocumentAdminBody };
      const finalSlug = body.slug ? slugify(body.slug) : slugify(body.title);

      const result = await knowledgeService.ingestDocument(
        {
          slug: finalSlug,
          title: body.title.trim(),
          category: body.category,
          content: body.content.trim(),
          author: body.author?.trim() || undefined,
          license: body.license?.trim() || undefined,
          metadata: body.metadata,
        },
        getRequestId(req),
      );

      return {
        data: {
          document: result.document,
          chunkCount: result.chunkCount,
        },
        status: 201,
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Document ingested successfully',
      };
    },

    /**
     * Explicitly reindexes an existing document: re-chunks and re-embeds without data loss.
     */
    reindexDocument: async (req: Request): Promise<RouteResult<ReindexDocumentResponseData>> => {
      const { params } = getValidated(req, reindexDocumentRequest) as {
        params: { idOrSlug: string };
      };

      const result = await knowledgeService.reindexDocument(params.idOrSlug, getRequestId(req));

      return {
        data: {
          document: result.document,
          chunkCount: result.chunkCount,
          message: `Successfully reindexed document into ${result.chunkCount} vector chunks.`,
        },
        status: 200,
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Document reindexed successfully',
      };
    },

    /**
     * Toggles the active status of a knowledge document (enables/disables retrieval).
     */
    updateDocumentStatus: async (req: Request): Promise<RouteResult<KnowledgeDocumentView>> => {
      const { params, body } = getValidated(req, updateDocumentStatusRequest) as {
        params: { idOrSlug: string };
        body: UpdateDocumentStatusBody;
      };

      const updated = await knowledgeService.updateDocumentStatus(params.idOrSlug, body.isActive);

      return {
        data: updated,
        status: 200,
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: `Document status updated to ${body.isActive ? 'active' : 'disabled'}`,
      };
    },

    /**
     * Updates document metadata (title, category, author, license, metadata).
     */
    updateDocumentMetadata: async (req: Request): Promise<RouteResult<KnowledgeDocumentView>> => {
      const { params, body } = getValidated(req, updateDocumentMetadataRequest) as {
        params: { idOrSlug: string };
        body: UpdateDocumentMetadataBody;
      };

      const updated = await knowledgeService.updateDocumentMetadata(params.idOrSlug, body);

      return {
        data: updated,
        status: 200,
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Document metadata updated successfully',
      };
    },

    /**
     * Lists documents with optional category, active status filter, and pagination.
     */
    listDocuments: async (req: Request): Promise<RouteResult<KnowledgeDocumentView[]>> => {
      const { query } = getValidated(req, listDocumentsAdminRequest) as {
        query: {
          category?: KnowledgeCategory;
          isActive?: boolean;
          status?: ProcessingStatus;
          limit: number;
          offset: number;
          page?: number;
        };
      };

      const limit = query.limit || 20;
      let offset = query.offset || 0;
      const page = query.page || Math.floor(offset / limit) + 1;
      if (query.page && !query.offset) {
        offset = (page - 1) * limit;
      }

      const { documents, total } = await knowledgeService.listDocuments({
        category: query.category,
        isActive: query.isActive,
        status: query.status,
        limit,
        offset,
      });

      const totalPages = Math.max(1, Math.ceil(total / limit));

      return {
        data: documents,
        meta: {
          page,
          limit,
          total,
          totalPages,
        },
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Documents retrieved successfully',
      };
    },

    /**
     * Retrieves document details and optionally all its vector chunks.
     */
    getDocument: async (req: Request): Promise<RouteResult<KnowledgeDocumentDetailView>> => {
      const { params, query } = getValidated(req, getDocumentAdminRequest) as {
        params: { idOrSlug: string };
        query: { includeChunks?: boolean };
      };

      const doc = await knowledgeService.getDocument(params.idOrSlug);
      if (!doc) {
        throw new AppError('not_found', 'NOT_FOUND', `Document '${params.idOrSlug}' not found.`);
      }

      let chunks: KnowledgeDocumentDetailView['chunks'] = undefined;
      if (query.includeChunks) {
        chunks = await knowledgeService.getDocumentChunks(doc.id);
      }

      return {
        data: {
          ...doc,
          chunks,
        },
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Document details retrieved successfully',
      };
    },

    /**
     * Deletes a document and all related chunks (cascading).
     */
    deleteDocument: async (req: Request): Promise<RouteResult<DeleteDocumentResponseData>> => {
      const { params } = getValidated(req, deleteDocumentAdminRequest) as {
        params: { idOrSlug: string };
      };

      const deleted = await knowledgeService.deleteDocument(params.idOrSlug);
      if (!deleted) {
        throw new AppError('not_found', 'NOT_FOUND', `Document '${params.idOrSlug}' not found.`);
      }

      return {
        data: {
          idOrSlug: params.idOrSlug,
          deleted: true,
        },
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Document and associated vector chunks deleted successfully',
      };
    },

    /**
     * Tests hybrid search & RRF ranking, returning matched chunks and formatted RAG prompt context.
     */
    searchKnowledge: async (req: Request): Promise<RouteResult<KnowledgeSearchResponseView>> => {
      const { body } = getValidated(req, searchKnowledgeAdminRequest) as {
        body: {
          query: string;
          category?: KnowledgeCategory;
          limit?: number;
          vectorWeight?: number;
          textWeight?: number;
          rrfK?: number;
          testRagContext?: boolean;
        };
      };

      const chunks = await knowledgeService.searchHybrid(body.query, {
        category: body.category,
        limit: body.limit ?? 5,
        vectorWeight: body.vectorWeight,
        textWeight: body.textWeight,
        rrfK: body.rrfK,
        correlationId: getRequestId(req),
      });

      let ragContext: KnowledgeSearchResponseView['ragContext'] = undefined;
      if (body.testRagContext !== false && chunks.length > 0) {
        ragContext = knowledgeService.buildRagContext(chunks);
      }

      return {
        data: {
          query: body.query,
          chunks,
          ragContext,
        },
        headers: KNOWLEDGE_ADMIN_HEADERS,
        message: 'Search executed successfully',
      };
    },
  };
}

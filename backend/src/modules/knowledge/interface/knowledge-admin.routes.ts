import { z } from 'zod';
import type { RequestHandler } from 'express';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { KnowledgeAdminController } from './knowledge-admin.controller.js';
import {
  createDocumentAdminRequest,
  deleteDocumentAdminRequest,
  deleteDocumentResponseSchema,
  documentIngestResponseSchema,
  getDocumentAdminRequest,
  knowledgeDocumentDetailViewSchema,
  knowledgeDocumentViewSchema,
  knowledgeSearchResponseViewSchema,
  listDocumentsAdminRequest,
  reindexDocumentRequest,
  reindexDocumentResponseSchema,
  searchKnowledgeAdminRequest,
  updateDocumentMetadataRequest,
  updateDocumentStatusRequest,
} from './knowledge-admin.schemas.js';

const tags = ['Admin Knowledge'];

export interface KnowledgeAdminRoutesOptions {
  uploadLimiter?: RequestHandler | undefined;
}

export function createKnowledgeAdminRoutes(
  basePath: string,
  controller: KnowledgeAdminController,
  options?: KnowledgeAdminRoutesOptions,
): RouteGroup {
  return {
    basePath,
    routes: [
      // 1. Upload Document File (PDF, TXT, MD)
      defineRoute({
        method: 'post',
        path: '/upload',
        summary: 'Admin Upload Knowledge Document',
        description:
          'Uploads and ingests a PDF, Markdown, or plain text file into the vector knowledge base. Performs semantic chunking and 768-d Gemini vector embeddings. Supports raw binary file upload or JSON with base64.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        middleware: options?.uploadLimiter ? [options.uploadLimiter] : [],
        bodyLimit: '15mb',
        response: {
          status: 201,
          description: 'Document uploaded and ingested',
          message: 'Document uploaded and ingested successfully',
          schema: documentIngestResponseSchema,
        },
        errorStatuses: [400, 401, 403, 409, 413, 422, 429],
        handler: controller.uploadDocument,
      }),

      // 2. Direct JSON Document Ingestion
      defineRoute({
        method: 'post',
        path: '/documents',
        summary: 'Admin Create Knowledge Document',
        description: 'Direct JSON ingestion of a curated knowledge article or document.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: createDocumentAdminRequest,
        response: {
          status: 201,
          description: 'Document created and ingested',
          message: 'Document ingested successfully',
          schema: documentIngestResponseSchema,
        },
        errorStatuses: [400, 401, 403, 409],
        handler: controller.createDocument,
      }),

      // 3. Reindex Knowledge Document
      defineRoute({
        method: 'post',
        path: '/documents/:idOrSlug/reindex',
        summary: 'Admin Reindex Knowledge Document',
        description:
          'Re-chunks and re-embeds an existing document. Atomically updates chunks on success without destroying existing chunks on error.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: reindexDocumentRequest,
        response: {
          status: 200,
          description: 'Document reindexed',
          message: 'Document reindexed successfully',
          schema: reindexDocumentResponseSchema,
        },
        errorStatuses: [400, 401, 403, 404, 500],
        handler: controller.reindexDocument,
      }),

      // 4. Update Document Status (Enable / Disable)
      defineRoute({
        method: 'patch',
        path: '/documents/:idOrSlug/status',
        summary: 'Admin Update Knowledge Document Status',
        description:
          'Enables or disables a knowledge document from being retrieved by the AI Coach without deleting underlying data.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: updateDocumentStatusRequest,
        response: {
          status: 200,
          description: 'Document status updated',
          message: 'Document status updated successfully',
          schema: knowledgeDocumentViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.updateDocumentStatus,
      }),

      // 5. Update Document Metadata
      defineRoute({
        method: 'patch',
        path: '/documents/:idOrSlug',
        summary: 'Admin Update Knowledge Document Metadata',
        description: 'Updates document title, category, author, license, or custom metadata.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: updateDocumentMetadataRequest,
        response: {
          status: 200,
          description: 'Document metadata updated',
          message: 'Document metadata updated successfully',
          schema: knowledgeDocumentViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.updateDocumentMetadata,
      }),

      // 6. List Knowledge Documents
      defineRoute({
        method: 'get',
        path: '/documents',
        summary: 'Admin List Knowledge Documents',
        description: 'Browse ingested knowledge documents with category/status filtering and pagination.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: listDocumentsAdminRequest,
        response: {
          status: 200,
          description: 'Knowledge documents list',
          message: 'Documents retrieved successfully',
          schema: z.array(knowledgeDocumentViewSchema),
          paginated: true,
        },
        errorStatuses: [400, 401, 403],
        handler: controller.listDocuments,
      }),

      // 7. Get Knowledge Document Details
      defineRoute({
        method: 'get',
        path: '/documents/:idOrSlug',
        summary: 'Admin Get Knowledge Document Details',
        description: 'Retrieve full document details by ID or slug, optionally including all vector chunks.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: getDocumentAdminRequest,
        response: {
          status: 200,
          description: 'Knowledge document details',
          message: 'Document details retrieved successfully',
          schema: knowledgeDocumentDetailViewSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.getDocument,
      }),

      // 8. Delete Knowledge Document
      defineRoute({
        method: 'delete',
        path: '/documents/:idOrSlug',
        summary: 'Admin Delete Knowledge Document',
        description: 'Delete a knowledge document and cascade removal of all its vector chunks.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: deleteDocumentAdminRequest,
        response: {
          status: 200,
          description: 'Document deleted',
          message: 'Document and associated vector chunks deleted successfully',
          schema: deleteDocumentResponseSchema,
        },
        errorStatuses: [400, 401, 403, 404],
        handler: controller.deleteDocument,
      }),

      // 9. Test Hybrid Search & RRF Retrieval
      defineRoute({
        method: 'post',
        path: '/search',
        summary: 'Admin Test Knowledge Retrieval',
        description:
          'Test Phase 06 Hybrid Search (dense vector + lexical full-text with Reciprocal Rank Fusion) and preview prompt grounding context.',
        tags,
        access: { kind: 'permission', permission: 'admin:access' },
        request: searchKnowledgeAdminRequest,
        response: {
          status: 200,
          description: 'Search results and RAG preview',
          message: 'Search executed successfully',
          schema: knowledgeSearchResponseViewSchema,
        },
        errorStatuses: [400, 401, 403],
        handler: controller.searchKnowledge,
      }),
    ],
  };
}

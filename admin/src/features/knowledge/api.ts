import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type {
  CreateDocumentInput,
  DocumentIngestResponse,
  DocumentListQuery,
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  KnowledgeSearchQuery,
  KnowledgeSearchResponse,
  ReindexDocumentResponse,
  UpdateDocumentMetadataInput,
  UploadFileInput,
} from './types';

export const knowledgeApi = {
  /**
   * Lists knowledge base documents with optional category, active, status filtering, and pagination.
   */
  async listDocuments(
    params: DocumentListQuery = {}
  ): Promise<{ documents: KnowledgeDocument[]; meta?: ApiResponse<unknown>['meta'] }> {
    const searchParams = new URLSearchParams();
    if (params.category) searchParams.set('category', params.category);
    if (params.isActive !== undefined) searchParams.set('isActive', params.isActive.toString());
    if (params.status) searchParams.set('status', params.status);
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.offset !== undefined) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<KnowledgeDocument[]>(`/knowledge/documents${query}`, {
      method: 'GET',
    });

    return {
      documents: res.data,
      meta: res.meta,
    };
  },

  /**
   * Retrieves single document details and optional vector chunks.
   */
  async getDocument(idOrSlug: string, includeChunks = false): Promise<KnowledgeDocumentDetail> {
    const query = includeChunks ? '?includeChunks=true' : '';
    const res = await apiClient<KnowledgeDocumentDetail>(
      `/knowledge/documents/${encodeURIComponent(idOrSlug)}${query}`,
      { method: 'GET' }
    );
    return res.data;
  },

  /**
   * Direct JSON ingestion of a knowledge document.
   */
  async createDocument(data: CreateDocumentInput): Promise<DocumentIngestResponse> {
    const res = await apiClient<DocumentIngestResponse>('/knowledge/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  /**
   * Uploads and ingests a document file (PDF, TXT, MD) with semantic chunking and 768-d Gemini vector embeddings.
   * Sends raw binary stream with metadata query parameters and extended timeout.
   */
  async uploadFile(input: UploadFileInput): Promise<DocumentIngestResponse> {
    const searchParams = new URLSearchParams();
    if (input.title) searchParams.set('title', input.title);
    if (input.category) searchParams.set('category', input.category);
    if (input.slug) searchParams.set('slug', input.slug);
    if (input.author) searchParams.set('author', input.author);
    if (input.license) searchParams.set('license', input.license);
    searchParams.set('fileName', input.file.name);

    const query = `?${searchParams.toString()}`;
    const contentType = input.file.type || 'application/octet-stream';

    const res = await apiClient<DocumentIngestResponse>(`/knowledge/upload${query}`, {
      method: 'POST',
      body: input.file,
      headers: {
        'Content-Type': contentType,
      },
      signal: AbortSignal.timeout(60000),
    });

    return res.data;
  },

  /**
   * Explicitly reindexes an existing document: re-chunks and re-embeds without data loss.
   */
  async reindexDocument(idOrSlug: string): Promise<ReindexDocumentResponse> {
    const res = await apiClient<ReindexDocumentResponse>(
      `/knowledge/documents/${encodeURIComponent(idOrSlug)}/reindex`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
      }
    );
    return res.data;
  },

  /**
   * Toggles the active status of a document (enables/disables retrieval by AI Coach).
   */
  async toggleDocumentStatus(idOrSlug: string, isActive: boolean): Promise<KnowledgeDocument> {
    const res = await apiClient<KnowledgeDocument>(
      `/knowledge/documents/${encodeURIComponent(idOrSlug)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }
    );
    return res.data;
  },

  /**
   * Updates document metadata (title, category, author, license, metadata).
   */
  async updateDocumentMetadata(
    idOrSlug: string,
    updates: UpdateDocumentMetadataInput
  ): Promise<KnowledgeDocument> {
    const res = await apiClient<KnowledgeDocument>(
      `/knowledge/documents/${encodeURIComponent(idOrSlug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return res.data;
  },

  /**
   * Deletes a document and cascades removal of all its vector chunks.
   */
  async deleteDocument(idOrSlug: string): Promise<{ idOrSlug: string; deleted: boolean }> {
    const res = await apiClient<{ idOrSlug: string; deleted: boolean }>(
      `/knowledge/documents/${encodeURIComponent(idOrSlug)}`,
      { method: 'DELETE' }
    );
    return res.data;
  },

  /**
   * Tests Phase 06 Hybrid Search (Dense Cosine + Lexical Full-Text with Reciprocal Rank Fusion)
   * and previews grounded RAG context for AI Coach.
   */
  async search(query: KnowledgeSearchQuery): Promise<KnowledgeSearchResponse> {
    const res = await apiClient<KnowledgeSearchResponse>('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify(query),
    });
    return res.data;
  },
};

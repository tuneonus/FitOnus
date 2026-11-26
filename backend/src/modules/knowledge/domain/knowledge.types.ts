/**
 * Knowledge Base Domain Types & Repository Port Interface
 * FitOnus Phase 05 & 06.5: Vector Database, pgvector Integration (768 dimensions),
 * Document Lifecycle, Status Tracking & Multilingual Hybrid Search
 */

export type KnowledgeCategory = 'fitness' | 'nutrition' | 'recovery' | 'app_guide';

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type ReindexStatus = 'processing' | 'failed' | 'completed';

export interface KnowledgeDocument {
  id: string;
  slug: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  author: string;
  license: string;
  metadata: Record<string, unknown>;
  version: number;
  isActive: boolean;
  contentHash: string | null;
  processingStatus: ProcessingStatus;
  processingError?: string | null;
  reindexStatus?: ReindexStatus | null;
  reindexError?: string | null;
  lastReindexedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface SimilarChunk {
  id: string;
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  documentCategory: KnowledgeCategory;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  similarity: number; // Cosine similarity in range [0, 1]
  createdAt: Date;
}

export interface TextChunk {
  id: string;
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  documentCategory: KnowledgeCategory;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  rank: number; // PostgreSQL full-text rank (ts_rank_cd)
  createdAt: Date;
}

export interface HybridChunk {
  id: string;
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  documentCategory: KnowledgeCategory;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  similarity: number; // Cosine similarity from dense search [0, 1]
  textRank: number; // Lexical score from text search
  rrfScore: number; // Reciprocal Rank Fusion score
  createdAt: Date;
}

export interface SaveDocumentInput {
  slug: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  author?: string | undefined;
  license?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  version?: number | undefined;
  isActive?: boolean | undefined;
  contentHash?: string | undefined;
  processingStatus?: ProcessingStatus | undefined;
  processingError?: string | null | undefined;
  reindexStatus?: ReindexStatus | null | undefined;
  reindexError?: string | null | undefined;
  lastReindexedAt?: Date | null | undefined;
}

export interface SaveChunkInput {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  metadata?: Record<string, unknown> | undefined;
}

export interface FindSimilarChunksParams {
  embedding: number[];
  limit?: number | undefined;
  minSimilarity?: number | undefined;
  category?: KnowledgeCategory | undefined;
}

export interface FindTextChunksParams {
  query: string;
  limit?: number | undefined;
  minRank?: number | undefined;
  category?: KnowledgeCategory | undefined;
}

export interface FindHybridChunksParams {
  query: string;
  embedding: number[];
  limit?: number | undefined;
  minSimilarity?: number | undefined;
  category?: KnowledgeCategory | undefined;
  rrfK?: number | undefined;
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
}

export interface ListDocumentsFilter {
  category?: KnowledgeCategory | undefined;
  isActive?: boolean | undefined;
  status?: ProcessingStatus | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface UpdateDocumentMetadataInput {
  title?: string | undefined;
  category?: KnowledgeCategory | undefined;
  author?: string | undefined;
  license?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface KnowledgeRepository {
  saveDocument(doc: SaveDocumentInput, chunks: SaveChunkInput[]): Promise<KnowledgeDocument>;
  getDocumentById(id: string): Promise<KnowledgeDocument | null>;
  getDocumentBySlug(slug: string): Promise<KnowledgeDocument | null>;
  getDocumentByContentHash(hash: string): Promise<KnowledgeDocument | null>;
  listDocuments(filter?: ListDocumentsFilter): Promise<{ documents: KnowledgeDocument[]; total: number }>;
  deleteDocument(idOrSlug: string): Promise<boolean>;
  replaceDocumentChunks(documentId: string, chunks: SaveChunkInput[]): Promise<void>;
  updateDocumentStatus(idOrSlug: string, isActive: boolean): Promise<KnowledgeDocument | null>;
  updateDocumentProcessing(
    idOrSlug: string,
    status: ProcessingStatus,
    error?: string | null,
  ): Promise<KnowledgeDocument | null>;
  startDocumentReindex(idOrSlug: string): Promise<KnowledgeDocument>;
  failDocumentReindex(idOrSlug: string, error: string): Promise<KnowledgeDocument>;
  updateDocumentMetadata(
    idOrSlug: string,
    updates: UpdateDocumentMetadataInput,
  ): Promise<KnowledgeDocument | null>;
  getChunksByDocumentId(documentId: string): Promise<KnowledgeChunk[]>;
  findSimilarChunks(params: FindSimilarChunksParams): Promise<SimilarChunk[]>;
  findTextChunks(params: FindTextChunksParams): Promise<TextChunk[]>;
  findHybridChunks(params: FindHybridChunksParams): Promise<HybridChunk[]>;
}

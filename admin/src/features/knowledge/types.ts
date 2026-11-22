export type KnowledgeCategory = 'fitness' | 'nutrition' | 'recovery' | 'app_guide';

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type ReindexStatus = 'processing' | 'failed' | 'completed';

export interface KnowledgeDocument {
  id: string;
  slug: string;
  title: string;
  category: KnowledgeCategory;
  author?: string | null;
  license?: string | null;
  metadata?: Record<string, unknown>;
  version: number;
  isActive: boolean;
  contentHash?: string | null;
  processingStatus: ProcessingStatus;
  processingError?: string | null;
  reindexStatus?: ReindexStatus | null;
  reindexError?: string | null;
  lastReindexedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  createdAt: string;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  content: string;
  chunks?: KnowledgeChunk[];
}

export interface DocumentIngestResponse {
  document: KnowledgeDocument;
  chunkCount: number;
  message?: string;
}

export interface ReindexDocumentResponse {
  document: KnowledgeDocument;
  chunkCount: number;
  message?: string;
}

export interface DocumentListQuery {
  category?: KnowledgeCategory;
  isActive?: boolean;
  status?: ProcessingStatus;
  page?: number;
  limit?: number;
  offset?: number;
}

export interface CreateDocumentInput {
  title: string;
  slug?: string;
  category: KnowledgeCategory;
  content: string;
  author?: string;
  license?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDocumentMetadataInput {
  title?: string;
  category?: KnowledgeCategory;
  author?: string;
  license?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadFileInput {
  file: File;
  title?: string;
  category?: KnowledgeCategory;
  slug?: string;
  author?: string;
  license?: string;
}

export interface KnowledgeSearchResultItem {
  id: string;
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  documentCategory: KnowledgeCategory;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  similarity?: number;
  textRank?: number;
  rrfScore?: number;
  denseRank?: number;
  textualRank?: number;
}

export interface GroundedCitation {
  documentSlug: string;
  documentTitle: string;
  category?: string;
  chunkIndex?: number;
  citation: string;
}

export interface RagContextItem {
  documentSlug: string;
  documentTitle: string;
  category: string;
  chunkIndex: number;
  content: string;
  citation: string;
  similarity: number;
  rrfScore: number;
}

export interface RagContextPreview {
  items: RagContextItem[];
  citations: GroundedCitation[];
  formattedPromptSection: string;
  totalTokens: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  chunks: KnowledgeSearchResultItem[];
  ragContext?: RagContextPreview;
}

export interface KnowledgeSearchQuery {
  query: string;
  category?: KnowledgeCategory;
  limit?: number;
  vectorWeight?: number;
  textWeight?: number;
  rrfK?: number;
  testRagContext?: boolean;
}

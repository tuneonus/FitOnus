import crypto from 'node:crypto';
import { AppError } from '../../../shared/errors/app-error.js';
import type { PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import { SemanticChunker } from '../domain/semantic-chunker.js';
import {
  RagContextBuilder,
  type RagContextBuilderOptions,
  type RagContextResult,
} from '../domain/rag-context-builder.js';
import type {
  HybridChunk,
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeRepository,
  ListDocumentsFilter,
  SaveChunkInput,
  SimilarChunk,
  TextChunk,
  UpdateDocumentMetadataInput,
} from '../domain/knowledge.types.js';

export interface IngestDocumentInput {
  slug: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  author?: string | undefined;
  license?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  version?: number | undefined;
}

export interface SearchSimilarOptions {
  limit?: number | undefined;
  minSimilarity?: number | undefined;
  category?: KnowledgeCategory | undefined;
  correlationId?: string | undefined;
}

export interface SearchHybridOptions {
  limit?: number | undefined;
  minSimilarity?: number | undefined;
  category?: KnowledgeCategory | undefined;
  rrfK?: number | undefined;
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
  correlationId?: string | undefined;
}

export interface SearchLexicalOptions {
  limit?: number | undefined;
  minRank?: number | undefined;
  category?: KnowledgeCategory | undefined;
}

export class KnowledgeService {
  private readonly chunker: SemanticChunker;

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly pythonAi: PythonAiClient,
    chunker?: SemanticChunker,
  ) {
    this.chunker = chunker ?? new SemanticChunker();
  }

  /**
   * Computes SHA-256 digest of document content.
   */
  computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Ingests a new knowledge document:
   * 1. Validates inputs and duplicate protection (slug & content hash) BEFORE embedding to save API quota.
   * 2. Chunks semantically.
   * 3. Generates 768-d vector embeddings via Python AI backend / Gemini embedding model.
   * 4. Persists document and chunks in PostgreSQL.
   */
  async ingestDocument(
    input: IngestDocumentInput,
    correlationId?: string,
  ): Promise<{ document: KnowledgeDocument; chunkCount: number }> {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,120}$/.test(slug)) {
      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        'Invalid document slug. Must be 3-120 lowercase alphanumeric, hyphen or underscore characters.',
      );
    }
    const title = input.title.trim();
    if (!title) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Document title cannot be empty.');
    }
    const content = input.content.trim();
    if (!content) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Document content cannot be empty.');
    }

    const contentHash = this.computeContentHash(content);

    // Pre-embedding duplicate checks to avoid unnecessary Gemini quota usage
    const existingBySlug = await this.repository.getDocumentBySlug(slug);
    if (existingBySlug) {
      throw new AppError(
        'conflict',
        'CONFLICT',
        `A document with slug "${slug}" already exists. To update its contents, trigger a reindex.`,
      );
    }

    const existingByHash = await this.repository.getDocumentByContentHash(contentHash);
    if (existingByHash) {
      throw new AppError(
        'conflict',
        'CONFLICT',
        `A document with identical content already exists: "${existingByHash.title}" (${existingByHash.slug}).`,
      );
    }

    // 1. Chunk document hierarchically
    const chunks = this.chunker.chunk(content, {
      slug,
      title,
      category: input.category,
    });

    if (chunks.length === 0) {
      throw new AppError('validation', 'VALIDATION_FAILED', 'Document content resulted in zero valid chunks.');
    }

    // 2. Generate 768-d embeddings for all chunks via Python AI backend
    const texts = chunks.map((c) => c.content);
    const embedResult = await this.pythonAi.embed({
      userId: 'system',
      requestId: `ingest-${slug}-${Date.now()}`,
      texts,
      taskType: 'RETRIEVAL_DOCUMENT',
      title,
      dimensions: 768,
      correlationId,
    });

    if (embedResult.embeddings.length !== chunks.length) {
      throw new AppError(
        'internal',
        'INTERNAL_ERROR',
        `Embedding count mismatch: expected ${chunks.length}, received ${embedResult.embeddings.length}`,
      );
    }

    // 3. Assemble chunks with vectors
    const saveChunks: SaveChunkInput[] = chunks.map((c, idx) => ({
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: embedResult.embeddings[idx]!,
      metadata: c.metadata,
    }));

    // 4. Save document and chunks atomically in PostgreSQL
    const document = await this.repository.saveDocument(
      {
        slug,
        title,
        category: input.category,
        content,
        author: input.author,
        license: input.license,
        metadata: input.metadata,
        version: input.version,
        isActive: true,
        contentHash,
        processingStatus: 'ready',
      },
      saveChunks,
    );

    return {
      document,
      chunkCount: saveChunks.length,
    };
  }

  /**
   * Explicitly reindexes an existing document:
   * Re-chunks and re-embeds the document. If embedding succeeds, replaces chunks atomically.
   * If embedding fails, records reindex_status = 'failed' but leaves document availability and existing chunks intact.
   * Prevents concurrent reindexing operations using an atomic state transition.
   */
  async reindexDocument(
    idOrSlug: string,
    correlationId?: string,
  ): Promise<{ document: KnowledgeDocument; chunkCount: number }> {
    // 1. Concurrency-safe atomic check & set: marks reindex_status = 'processing'
    // Throws 409 Conflict if already processing, or 404 Not Found if missing
    const doc = await this.repository.startDocumentReindex(idOrSlug);

    let chunks: ReturnType<SemanticChunker['chunk']>;
    try {
      chunks = this.chunker.chunk(doc.content, {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
      });

      if (chunks.length === 0) {
        throw new Error('Document content resulted in 0 valid chunks.');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.repository.failDocumentReindex(doc.id, errorMsg);
      throw new AppError('validation', 'VALIDATION_FAILED', `Reindexing failed during chunking: ${errorMsg}`);
    }

    let saveChunks: SaveChunkInput[];
    try {
      const texts = chunks.map((c) => c.content);
      const embedResult = await this.pythonAi.embed({
        userId: 'system',
        requestId: `reindex-${doc.slug}-${Date.now()}`,
        texts,
        taskType: 'RETRIEVAL_DOCUMENT',
        title: doc.title,
        dimensions: 768,
        correlationId,
      });

      if (embedResult.embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch: expected ${chunks.length}, received ${embedResult.embeddings.length}`);
      }

      saveChunks = chunks.map((c, idx) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embedResult.embeddings[idx]!,
        metadata: c.metadata,
      }));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Mark reindex failed, but document remains ACTIVE and READY with all original chunks intact!
      await this.repository.failDocumentReindex(doc.id, errorMsg);
      throw new AppError('internal', 'INTERNAL_ERROR', `Reindexing failed during embedding generation: ${errorMsg}`);
    }

    // Replace chunks atomically only after complete embedding success
    await this.repository.replaceDocumentChunks(doc.id, saveChunks);

    const updated = await this.getDocument(doc.id);
    return {
      document: updated ?? doc,
      chunkCount: saveChunks.length,
    };
  }

  /**
   * Toggles active status of a document (disables it from retrieval without data loss).
   */
  async updateDocumentStatus(idOrSlug: string, isActive: boolean): Promise<KnowledgeDocument> {
    const updated = await this.repository.updateDocumentStatus(idOrSlug, isActive);
    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', `Document '${idOrSlug}' not found.`);
    }
    return updated;
  }

  /**
   * Updates document metadata (title, category, author, license, metadata).
   */
  async updateDocumentMetadata(
    idOrSlug: string,
    updates: UpdateDocumentMetadataInput,
  ): Promise<KnowledgeDocument> {
    const updated = await this.repository.updateDocumentMetadata(idOrSlug, updates);
    if (!updated) {
      throw new AppError('not_found', 'NOT_FOUND', `Document '${idOrSlug}' not found.`);
    }
    return updated;
  }

  /**
   * Performs semantic vector search against active and ready 768-dimensional knowledge chunks
   * using cosine distance (`<=>`) via pgvector.
   */
  async searchSimilar(query: string, options: SearchSimilarOptions = {}): Promise<SimilarChunk[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // 1. Embed query with RETRIEVAL_QUERY task type
    const embedResult = await this.pythonAi.embed({
      userId: 'system',
      requestId: `query-${Date.now()}`,
      texts: [cleanQuery],
      taskType: 'RETRIEVAL_QUERY',
      dimensions: 768,
      correlationId: options.correlationId,
    });

    const queryEmbedding = embedResult.embeddings[0];
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to generate query embedding vector.');
    }

    // 2. Query repository via pgvector similarity search
    return this.repository.findSimilarChunks({
      embedding: queryEmbedding,
      limit: options.limit ?? 5,
      minSimilarity: options.minSimilarity ?? 0.0,
      category: options.category,
    });
  }

  /**
   * Performs lexical full-text search against active and ready knowledge chunks.
   */
  async searchLexical(query: string, options: SearchLexicalOptions = {}): Promise<TextChunk[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    return this.repository.findTextChunks({
      query: cleanQuery,
      limit: options.limit ?? 5,
      minRank: options.minRank ?? 0.0,
      category: options.category,
    });
  }

  /**
   * Performs hybrid search combining pgvector cosine similarity and PostgreSQL full-text search
   * using Reciprocal Rank Fusion (RRF). Only active and ready chunks are considered.
   */
  async searchHybrid(query: string, options: SearchHybridOptions = {}): Promise<HybridChunk[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // 1. Embed query with RETRIEVAL_QUERY task type via Python AI / Gemini
    const embedResult = await this.pythonAi.embed({
      userId: 'system',
      requestId: `hybrid-${Date.now()}`,
      texts: [cleanQuery],
      taskType: 'RETRIEVAL_QUERY',
      dimensions: 768,
      correlationId: options.correlationId,
    });

    const queryEmbedding = embedResult.embeddings[0];
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new AppError('internal', 'INTERNAL_ERROR', 'Failed to generate query embedding vector.');
    }

    // 2. Query repository with hybrid retrieval + RRF
    return this.repository.findHybridChunks({
      query: cleanQuery,
      embedding: queryEmbedding,
      limit: options.limit ?? 5,
      minSimilarity: options.minSimilarity ?? 0.0,
      category: options.category,
      rrfK: options.rrfK,
      vectorWeight: options.vectorWeight,
      textWeight: options.textWeight,
    });
  }

  /**
   * Builds grounded RAG context from retrieved chunks with token budgeting and untrusted content defense.
   */
  buildRagContext(
    chunks: readonly (HybridChunk | SimilarChunk)[],
    options?: RagContextBuilderOptions,
  ): RagContextResult {
    return RagContextBuilder.buildContext(chunks, options);
  }

  /** Deletes a document by slug or id, with automatic cascade to all vector chunks. */
  async deleteDocument(idOrSlug: string): Promise<boolean> {
    return this.repository.deleteDocument(idOrSlug);
  }

  /** Retrieves a document by id or slug. */
  async getDocument(idOrSlug: string): Promise<KnowledgeDocument | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    if (isUuid) {
      return this.repository.getDocumentById(idOrSlug);
    }
    return this.repository.getDocumentBySlug(idOrSlug);
  }

  /** Retrieves all chunks for a document by its ID. */
  async getDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    return this.repository.getChunksByDocumentId(documentId);
  }

  /** Lists documents with pagination and optional category / active filtering. */
  async listDocuments(
    filter?: ListDocumentsFilter,
  ): Promise<{ documents: KnowledgeDocument[]; total: number }> {
    return this.repository.listDocuments(filter);
  }
}

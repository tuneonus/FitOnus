import type { Database } from '../../../database/transaction.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type {
  FindHybridChunksParams,
  FindSimilarChunksParams,
  FindTextChunksParams,
  HybridChunk,
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeRepository,
  ListDocumentsFilter,
  ProcessingStatus,
  ReindexStatus,
  SaveChunkInput,
  SaveDocumentInput,
  SimilarChunk,
  TextChunk,
  UpdateDocumentMetadataInput,
} from '../domain/knowledge.types.js';
import { reciprocalRankFusion } from '../domain/reciprocal-rank-fusion.js';

interface DocumentRow {
  id: string;
  slug: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  author: string;
  license: string;
  metadata: Record<string, unknown>;
  version: number;
  is_active: boolean;
  content_hash: string | null;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  reindex_status: ReindexStatus | null;
  reindex_error: string | null;
  last_reindexed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

interface SimilarChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  document_slug: string;
  document_title: string;
  document_category: KnowledgeCategory;
  similarity: number;
}

interface TextChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  document_slug: string;
  document_title: string;
  document_category: KnowledgeCategory;
  text_rank: number;
}

/** Formats array of numbers into standard PostgreSQL pgvector text format: `[0.1,0.2,...]`. */
export function formatVector(embedding: readonly number[], expectedDimensions?: number): string {
  if (!Array.isArray(embedding)) {
    throw new AppError('internal', 'INTERNAL_ERROR', 'Vector embedding must be an array');
  }
  if (expectedDimensions !== undefined && embedding.length !== expectedDimensions) {
    throw new AppError(
      'internal',
      'INTERNAL_ERROR',
      `Vector dimension mismatch: expected ${expectedDimensions}, received ${embedding.length}`,
    );
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      throw new AppError('internal', 'INTERNAL_ERROR', `Vector contains non-finite number at index ${i}`);
    }
  }
  return `[${embedding.join(',')}]`;
}

/** Parses pgvector text representation `[0.1,0.2,...]` back into array of floats. */
export function parseVector(vectorStr: string): number[] {
  if (!vectorStr) return [];
  const clean = vectorStr.replace(/^\[|\]$/g, '').trim();
  if (!clean) return [];
  return clean.split(',').map(Number);
}

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export class PgKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly db: Database) {}

  async saveDocument(doc: SaveDocumentInput, chunks: SaveChunkInput[]): Promise<KnowledgeDocument> {
    return this.db.transaction(async () => {
      // 1. Strict duplicate check by slug: ordinary uploads must NEVER silently overwrite
      const existingSlug = await this.db.query<{ id: string; title: string }>(
        'SELECT id, title FROM knowledge_documents WHERE slug = $1',
        [doc.slug],
      );
      if (existingSlug.rows.length > 0) {
        throw new AppError(
          'conflict',
          'CONFLICT',
          `A document with slug "${doc.slug}" already exists. To update existing chunks, trigger a document reindex.`,
        );
      }

      // 2. Strict duplicate check by content hash
      if (doc.contentHash) {
        const existingHash = await this.db.query<{ id: string; slug: string; title: string }>(
          'SELECT id, slug, title FROM knowledge_documents WHERE content_hash = $1',
          [doc.contentHash],
        );
        if (existingHash.rows.length > 0) {
          const match = existingHash.rows[0]!;
          throw new AppError(
            'conflict',
            'CONFLICT',
            `A document with identical content already exists: "${match.title}" (${match.slug}).`,
          );
        }
      }

      // 3. Insert document with lifecycle fields
      let docRow: DocumentRow;
      try {
        const insertRes = await this.db.query<DocumentRow>(
          `INSERT INTO knowledge_documents (
             slug, title, category, content, author, license, metadata, version,
             is_active, content_hash, processing_status, processing_error,
             reindex_status, reindex_error, last_reindexed_at
           )
           VALUES (
             $1, $2, $3, $4,
             COALESCE($5, 'OnusFit Editorial'),
             COALESCE($6, 'Proprietary / Verified Public Domain'),
             $7,
             COALESCE($8, 1),
             COALESCE($9, true),
             $10,
             COALESCE($11, 'ready'),
             $12,
             $13,
             $14,
             $15
           )
           RETURNING id, slug, title, category, content, author, license, metadata, version,
                     is_active, content_hash, processing_status, processing_error,
                     reindex_status, reindex_error, last_reindexed_at, created_at, updated_at`,
          [
            doc.slug,
            doc.title,
            doc.category,
            doc.content,
            doc.author ?? null,
            doc.license ?? null,
            JSON.stringify(doc.metadata ?? {}),
            doc.version ?? 1,
            doc.isActive ?? true,
            doc.contentHash ?? null,
            doc.processingStatus ?? 'ready',
            doc.processingError ?? null,
            doc.reindexStatus ?? null,
            doc.reindexError ?? null,
            doc.lastReindexedAt ?? null,
          ],
        );
        docRow = insertRes.rows[0]!;
      } catch (err: unknown) {
        // Catch postgres 23505 unique constraint violation
        if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') {
          throw new AppError(
            'conflict',
            'CONFLICT',
            `Document conflict: A document with this slug or content hash already exists.`,
          );
        }
        throw err;
      }

      // 4. Insert chunks with 768-d vector embeddings
      for (const chunk of chunks) {
        await this.db.query(
          `INSERT INTO knowledge_chunks (document_id, chunk_index, content, token_count, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [
            docRow.id,
            chunk.chunkIndex,
            chunk.content,
            chunk.tokenCount,
            formatVector(chunk.embedding, 768),
            JSON.stringify(chunk.metadata ?? {}),
          ],
        );
      }

      return this.mapDocument(docRow);
    });
  }

  async replaceDocumentChunks(documentId: string, chunks: SaveChunkInput[]): Promise<void> {
    await this.db.transaction(async () => {
      // 1. Delete old chunks
      await this.db.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);

      // 2. Insert fresh chunks
      for (const chunk of chunks) {
        await this.db.query(
          `INSERT INTO knowledge_chunks (document_id, chunk_index, content, token_count, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [
            documentId,
            chunk.chunkIndex,
            chunk.content,
            chunk.tokenCount,
            formatVector(chunk.embedding, 768),
            JSON.stringify(chunk.metadata ?? {}),
          ],
        );
      }

      // 3. Increment document version, mark reindex completed, and ensure processing_status is ready
      // Notice: is_active is preserved as-is!
      await this.db.query(
        `UPDATE knowledge_documents
         SET version = version + 1,
             processing_status = 'ready',
             processing_error = NULL,
             reindex_status = 'completed',
             reindex_error = NULL,
             last_reindexed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [documentId],
      );
    });
  }

  async startDocumentReindex(idOrSlug: string): Promise<KnowledgeDocument> {
    const whereClause = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';

    // Atomic concurrency-safe transition: only transitions if not currently processing within last 5 minutes
    const res = await this.db.query<DocumentRow>(
      `UPDATE knowledge_documents
       SET reindex_status = 'processing',
           reindex_error = NULL,
           updated_at = now()
       WHERE ${whereClause}
         AND (reindex_status IS NULL OR reindex_status != 'processing' OR updated_at < now() - INTERVAL '5 minutes')
       RETURNING id, slug, title, category, content, author, license, metadata, version,
                 is_active, content_hash, processing_status, processing_error,
                 reindex_status, reindex_error, last_reindexed_at, created_at, updated_at`,
      [idOrSlug],
    );

    if (res.rows.length > 0) {
      return this.mapDocument(res.rows[0]!);
    }

    // Check if document exists at all
    const existing = await this.db.query<{ id: string; reindex_status: string | null }>(
      `SELECT id, reindex_status FROM knowledge_documents WHERE ${whereClause}`,
      [idOrSlug],
    );

    if (existing.rows.length === 0) {
      throw new AppError('not_found', 'NOT_FOUND', `Document '${idOrSlug}' not found.`);
    }

    throw new AppError(
      'conflict',
      'CONFLICT',
      `Document '${idOrSlug}' is already undergoing reindexing. Concurrent reindex operations are prevented.`,
    );
  }

  async failDocumentReindex(idOrSlug: string, error: string): Promise<KnowledgeDocument> {
    const whereClause = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';

    // Sets reindex_status = 'failed' and records error, but leaves processing_status and is_active untouched!
    // Original chunks remain completely available for AI Coach retrieval.
    const res = await this.db.query<DocumentRow>(
      `UPDATE knowledge_documents
       SET reindex_status = 'failed',
           reindex_error = $2,
           updated_at = now()
       WHERE ${whereClause}
       RETURNING id, slug, title, category, content, author, license, metadata, version,
                 is_active, content_hash, processing_status, processing_error,
                 reindex_status, reindex_error, last_reindexed_at, created_at, updated_at`,
      [idOrSlug, error],
    );

    if (res.rows.length === 0) {
      throw new AppError('not_found', 'NOT_FOUND', `Document '${idOrSlug}' not found.`);
    }

    return this.mapDocument(res.rows[0]!);
  }

  async updateDocumentStatus(idOrSlug: string, isActive: boolean): Promise<KnowledgeDocument | null> {
    const whereClause = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';
    const res = await this.db.query<DocumentRow>(
      `UPDATE knowledge_documents
       SET is_active = $2,
           updated_at = now()
       WHERE ${whereClause}
       RETURNING id, slug, title, category, content, author, license, metadata, version,
                 is_active, content_hash, processing_status, processing_error,
                 reindex_status, reindex_error, last_reindexed_at, created_at, updated_at`,
      [idOrSlug, isActive],
    );
    if (res.rows.length === 0) return null;
    return this.mapDocument(res.rows[0]!);
  }

  async updateDocumentProcessing(
    idOrSlug: string,
    status: ProcessingStatus,
    error?: string | null,
  ): Promise<KnowledgeDocument | null> {
    const whereClause = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';
    const res = await this.db.query<DocumentRow>(
      `UPDATE knowledge_documents
       SET processing_status = $2,
           processing_error = $3,
           updated_at = now()
       WHERE ${whereClause}
       RETURNING id, slug, title, category, content, author, license, metadata, version,
                 is_active, content_hash, processing_status, processing_error,
                 reindex_status, reindex_error, last_reindexed_at, created_at, updated_at`,
      [idOrSlug, status, error ?? null],
    );
    if (res.rows.length === 0) return null;
    return this.mapDocument(res.rows[0]!);
  }

  async updateDocumentMetadata(
    idOrSlug: string,
    updates: UpdateDocumentMetadataInput,
  ): Promise<KnowledgeDocument | null> {
    const whereClause = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';
    const res = await this.db.query<DocumentRow>(
      `UPDATE knowledge_documents
       SET title = COALESCE($2, title),
           category = COALESCE($3, category),
           author = COALESCE($4, author),
           license = COALESCE($5, license),
           metadata = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE metadata END,
           updated_at = now()
       WHERE ${whereClause}
       RETURNING id, slug, title, category, content, author, license, metadata, version,
                 is_active, content_hash, processing_status, processing_error,
                 reindex_status, reindex_error, last_reindexed_at, created_at, updated_at`,
      [
        idOrSlug,
        updates.title ?? null,
        updates.category ?? null,
        updates.author ?? null,
        updates.license ?? null,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
      ],
    );
    if (res.rows.length === 0) return null;
    return this.mapDocument(res.rows[0]!);
  }

  async getDocumentById(id: string): Promise<KnowledgeDocument | null> {
    const res = await this.db.query<DocumentRow>(
      `SELECT id, slug, title, category, content, author, license, metadata, version,
              is_active, content_hash, processing_status, processing_error,
              reindex_status, reindex_error, last_reindexed_at, created_at, updated_at
       FROM knowledge_documents
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapDocument(res.rows[0]!);
  }

  async getDocumentBySlug(slug: string): Promise<KnowledgeDocument | null> {
    const res = await this.db.query<DocumentRow>(
      `SELECT id, slug, title, category, content, author, license, metadata, version,
              is_active, content_hash, processing_status, processing_error,
              reindex_status, reindex_error, last_reindexed_at, created_at, updated_at
       FROM knowledge_documents
       WHERE slug = $1`,
      [slug],
    );
    if (res.rows.length === 0) return null;
    return this.mapDocument(res.rows[0]!);
  }

  async getDocumentByContentHash(hash: string): Promise<KnowledgeDocument | null> {
    const res = await this.db.query<DocumentRow>(
      `SELECT id, slug, title, category, content, author, license, metadata, version,
              is_active, content_hash, processing_status, processing_error,
              reindex_status, reindex_error, last_reindexed_at, created_at, updated_at
       FROM knowledge_documents
       WHERE content_hash = $1`,
      [hash],
    );
    if (res.rows.length === 0) return null;
    return this.mapDocument(res.rows[0]!);
  }

  async listDocuments(
    filter: ListDocumentsFilter = {},
  ): Promise<{ documents: KnowledgeDocument[]; total: number }> {
    const limit = Math.min(filter.limit ?? 20, 100);
    const offset = filter.offset ?? 0;

    const countRes = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM knowledge_documents
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::boolean IS NULL OR is_active = $2)
         AND ($3::text IS NULL OR processing_status = $3)`,
      [filter.category ?? null, filter.isActive ?? null, filter.status ?? null],
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const res = await this.db.query<DocumentRow>(
      `SELECT id, slug, title, category, content, author, license, metadata, version,
              is_active, content_hash, processing_status, processing_error,
              reindex_status, reindex_error, last_reindexed_at, created_at, updated_at
       FROM knowledge_documents
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::boolean IS NULL OR is_active = $2)
         AND ($3::text IS NULL OR processing_status = $3)
       ORDER BY updated_at DESC
       LIMIT $4 OFFSET $5`,
      [filter.category ?? null, filter.isActive ?? null, filter.status ?? null, limit, offset],
    );

    return {
      documents: res.rows.map((r) => this.mapDocument(r)),
      total,
    };
  }

  async deleteDocument(idOrSlug: string): Promise<boolean> {
    const whereClause = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';
    const res = await this.db.query<{ id: string }>(
      `DELETE FROM knowledge_documents
       WHERE ${whereClause}
       RETURNING id`,
      [idOrSlug],
    );
    return res.rows.length > 0;
  }

  async getChunksByDocumentId(documentId: string): Promise<KnowledgeChunk[]> {
    const res = await this.db.query<ChunkRow>(
      `SELECT id, document_id, chunk_index, content, token_count, embedding::text, metadata, created_at
       FROM knowledge_chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [documentId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      tokenCount: r.token_count,
      embedding: parseVector(r.embedding),
      metadata: r.metadata ?? {},
      createdAt: r.created_at,
    }));
  }

  async findSimilarChunks(params: FindSimilarChunksParams): Promise<SimilarChunk[]> {
    const limit = Math.min(params.limit ?? 5, 25);
    const minSimilarity = params.minSimilarity ?? 0.0;
    const vectorStr = formatVector(params.embedding, 768);

    // Enforce active and ready status
    const res = await this.db.query<SimilarChunkRow>(
      `SELECT
         c.id,
         c.document_id,
         c.chunk_index,
         c.content,
         c.token_count,
         c.metadata,
         c.created_at,
         d.slug AS document_slug,
         d.title AS document_title,
         d.category AS document_category,
         (1 - (c.embedding <=> $1::vector)) AS similarity
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE (d.is_active = true)
         AND (d.processing_status = 'ready')
         AND ($2::text IS NULL OR d.category = $2)
         AND (1 - (c.embedding <=> $1::vector)) >= $3
       ORDER BY c.embedding <=> $1::vector ASC
       LIMIT $4`,
      [vectorStr, params.category ?? null, minSimilarity, limit],
    );

    return res.rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      documentSlug: r.document_slug,
      documentTitle: r.document_title,
      documentCategory: r.document_category,
      chunkIndex: r.chunk_index,
      content: r.content,
      tokenCount: r.token_count,
      metadata: r.metadata ?? {},
      similarity: Number(r.similarity),
      createdAt: r.created_at,
    }));
  }

  async findTextChunks(params: FindTextChunksParams): Promise<TextChunk[]> {
    const cleanQuery = params.query.trim();
    if (!cleanQuery) return [];

    const limit = Math.min(params.limit ?? 5, 25);
    const minRank = params.minRank ?? 0.0;

    // Multilingual lexical search:
    // Uses both 'english' stemmer and 'simple' dictionary (for Tamil and non-English scripts),
    // plus substring ILIKE fallback.
    const res = await this.db.query<TextChunkRow>(
      `SELECT
         c.id,
         c.document_id,
         c.chunk_index,
         c.content,
         c.token_count,
         c.metadata,
         c.created_at,
         d.slug AS document_slug,
         d.title AS document_title,
         d.category AS document_category,
         GREATEST(
           ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', $1)),
           ts_rank_cd(to_tsvector('simple', c.content), plainto_tsquery('simple', $1)),
           CASE WHEN c.content ILIKE ('%' || $1 || '%') OR d.title ILIKE ('%' || $1 || '%') THEN 0.05 ELSE 0 END
         ) AS text_rank
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE (d.is_active = true)
         AND (d.processing_status = 'ready')
         AND ($2::text IS NULL OR d.category = $2)
         AND (
           to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
           OR to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $1)
           OR c.content ILIKE ('%' || $1 || '%')
           OR d.title ILIKE ('%' || $1 || '%')
         )
         AND GREATEST(
           ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', $1)),
           ts_rank_cd(to_tsvector('simple', c.content), plainto_tsquery('simple', $1)),
           CASE WHEN c.content ILIKE ('%' || $1 || '%') OR d.title ILIKE ('%' || $1 || '%') THEN 0.05 ELSE 0 END
         ) >= $3
       ORDER BY text_rank DESC, c.created_at DESC
       LIMIT $4`,
      [cleanQuery, params.category ?? null, minRank, limit],
    );

    return res.rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      documentSlug: r.document_slug,
      documentTitle: r.document_title,
      documentCategory: r.document_category,
      chunkIndex: r.chunk_index,
      content: r.content,
      tokenCount: r.token_count,
      metadata: r.metadata ?? {},
      rank: Number(r.text_rank || 0),
      createdAt: r.created_at,
    }));
  }

  async findHybridChunks(params: FindHybridChunksParams): Promise<HybridChunk[]> {
    const limit = Math.min(params.limit ?? 5, 25);
    const candidateLimit = Math.min(limit * 2, 30);

    const [denseResults, textResults] = await Promise.all([
      this.findSimilarChunks({
        embedding: params.embedding,
        limit: candidateLimit,
        minSimilarity: params.minSimilarity ?? 0.0,
        category: params.category,
      }),
      this.findTextChunks({
        query: params.query,
        limit: candidateLimit,
        category: params.category,
      }),
    ]);

    return reciprocalRankFusion(denseResults, textResults, {
      k: params.rrfK ?? 60,
      vectorWeight: params.vectorWeight ?? 1.0,
      textWeight: params.textWeight ?? 1.0,
      topK: limit,
      minSimilarity: params.minSimilarity ?? 0.0,
    });
  }

  private mapDocument(row: DocumentRow): KnowledgeDocument {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      content: row.content,
      author: row.author,
      license: row.license,
      metadata: row.metadata ?? {},
      version: row.version,
      isActive: row.is_active,
      contentHash: row.content_hash,
      processingStatus: row.processing_status,
      processingError: row.processing_error,
      reindexStatus: row.reindex_status,
      reindexError: row.reindex_error,
      lastReindexedAt: row.last_reindexed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../../src/database/transaction.js';
import {
  formatVector,
  parseVector,
  PgKnowledgeRepository,
} from '../../../src/modules/knowledge/infrastructure/pg-knowledge-repository.js';

describe('PgKnowledgeRepository', () => {
  describe('vector formatting and parsing helpers', () => {
    it('formats an array of numbers into standard pgvector string format', () => {
      expect(formatVector([0.1, 0.25, -0.3])).toBe('[0.1,0.25,-0.3]');
      expect(formatVector([])).toBe('[]');
    });

    it('parses a pgvector string representation back to an array of floats', () => {
      expect(parseVector('[0.1,0.25,-0.3]')).toEqual([0.1, 0.25, -0.3]);
      expect(parseVector('[]')).toEqual([]);
      expect(parseVector('')).toEqual([]);
    });

    it('rejects vector dimension mismatch when expected dimensions are specified', () => {
      expect(() => formatVector([0.1, 0.2], 768)).toThrowError(/Vector dimension mismatch/);
    });

    it('rejects vectors with NaN or non-finite values', () => {
      expect(() => formatVector([0.1, NaN, 0.3])).toThrowError(/non-finite number/);
      expect(() => formatVector([0.1, Infinity, 0.3])).toThrowError(/non-finite number/);
    });
  });

  describe('saveDocument', () => {
    it('inserts a new document and chunks with lifecycle fields inside a database transaction', async () => {
      const mockQuery = vi.fn();
      const mockDb = {
        query: mockQuery,
        transaction: vi.fn(async (cb: () => Promise<unknown>) => cb()),
      } as unknown as Database;

      const repo = new PgKnowledgeRepository(mockDb);

      // 1. Slug check returns empty (new doc)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // 2. Content hash check returns empty (new content)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // 3. Insert document query returns new document row
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-uuid-1',
            slug: 'bench-press',
            title: 'Bench Press Technique',
            category: 'fitness',
            content: 'Full bench content',
            author: 'OnusFit Editorial',
            license: 'Public Domain',
            metadata: {},
            version: 1,
            is_active: true,
            content_hash: 'hash-123',
            processing_status: 'ready',
            processing_error: null,
            created_at: new Date('2026-11-20T10:00:00Z'),
            updated_at: new Date('2026-11-20T10:00:00Z'),
          },
        ],
      });

      // 4. Insert chunk query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const fakeEmbedding = new Array(768).fill(0.05);
      const res = await repo.saveDocument(
        {
          slug: 'bench-press',
          title: 'Bench Press Technique',
          category: 'fitness',
          content: 'Full bench content',
          contentHash: 'hash-123',
        },
        [
          {
            chunkIndex: 0,
            content: 'Chunk 0 content',
            tokenCount: 4,
            embedding: fakeEmbedding,
            metadata: { sectionHeader: 'Setup' },
          },
        ],
      );

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(res.id).toBe('doc-uuid-1');
      expect(res.slug).toBe('bench-press');
      expect(res.version).toBe(1);
      expect(res.isActive).toBe(true);
      expect(res.contentHash).toBe('hash-123');
      expect(res.processingStatus).toBe('ready');

      // Verify chunk insertion was called with vector format
      const chunkInsertCall = mockQuery.mock.calls[3]!;
      expect(chunkInsertCall[0]).toContain('$5::vector');
      expect(chunkInsertCall[1][0]).toBe('doc-uuid-1');
      expect(chunkInsertCall[1][1]).toBe(0);
      expect(chunkInsertCall[1][4]).toBe(formatVector(fakeEmbedding));
    });

    it('throws 409 Conflict when a document with identical slug already exists', async () => {
      const mockQuery = vi.fn();
      const mockDb = {
        query: mockQuery,
        transaction: vi.fn(async (cb: () => Promise<unknown>) => cb()),
      } as unknown as Database;

      const repo = new PgKnowledgeRepository(mockDb);

      // Slug check returns existing record
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'doc-existing-id', title: 'Existing Doc' }] });

      await expect(
        repo.saveDocument(
          {
            slug: 'bench-press',
            title: 'Bench Press',
            category: 'fitness',
            content: 'Content',
          },
          [],
        ),
      ).rejects.toThrow(/already exists/);
    });

    it('throws 409 Conflict when a document with identical content hash already exists', async () => {
      const mockQuery = vi.fn();
      const mockDb = {
        query: mockQuery,
        transaction: vi.fn(async (cb: () => Promise<unknown>) => cb()),
      } as unknown as Database;

      const repo = new PgKnowledgeRepository(mockDb);

      // Slug check returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Content hash check returns existing record
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'doc-existing-id', slug: 'old-slug', title: 'Existing Doc' }],
      });

      await expect(
        repo.saveDocument(
          {
            slug: 'new-slug',
            title: 'New Title',
            category: 'fitness',
            content: 'Identical content',
            contentHash: 'hash-duplicate',
          },
          [],
        ),
      ).rejects.toThrow(/identical content already exists/);
    });
  });

  describe('replaceDocumentChunks', () => {
    it('deletes old chunks, inserts new chunks, and increments version inside transaction', async () => {
      const mockQuery = vi.fn();
      const mockDb = {
        query: mockQuery,
        transaction: vi.fn(async (cb: () => Promise<unknown>) => cb()),
      } as unknown as Database;

      const repo = new PgKnowledgeRepository(mockDb);

      // 1. DELETE old chunks
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 2. INSERT new chunk
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 3. UPDATE document version
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.replaceDocumentChunks('doc-uuid-1', [
        {
          chunkIndex: 0,
          content: 'Reindexed chunk',
          tokenCount: 5,
          embedding: new Array(768).fill(0.02),
        },
      ]);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockQuery.mock.calls[0]![0]).toContain('DELETE FROM knowledge_chunks WHERE document_id = $1');
      expect(mockQuery.mock.calls[0]![1]).toEqual(['doc-uuid-1']);
      expect(mockQuery.mock.calls[2]![0]).toContain('UPDATE knowledge_documents');
      expect(mockQuery.mock.calls[2]![0]).toContain("processing_status = 'ready'");
      expect(mockQuery.mock.calls[2]![0]).toContain("reindex_status = 'completed'");
      expect(mockQuery.mock.calls[2]![0]).toContain('last_reindexed_at = now()');
    });
  });

  describe('startDocumentReindex & failDocumentReindex', () => {
    it('atomically transitions reindex_status to processing when idle', async () => {
      const mockQuery = vi.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            slug: 'squat-depth',
            title: 'Squat Depth',
            category: 'fitness',
            content: 'Squat text',
            author: 'ACSM',
            license: 'Public Domain',
            metadata: {},
            version: 1,
            is_active: true,
            content_hash: 'hash-squat',
            processing_status: 'ready',
            processing_error: null,
            reindex_status: 'processing',
            reindex_error: null,
            last_reindexed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const doc = await repo.startDocumentReindex('squat-depth');
      expect(doc.reindexStatus).toBe('processing');
      expect(doc.processingStatus).toBe('ready');
      expect(doc.isActive).toBe(true);
      expect(mockQuery.mock.calls[0]![0]).toContain("reindex_status = 'processing'");
      expect(mockQuery.mock.calls[0]![0]).toContain("reindex_status != 'processing'");
    });

    it('rejects concurrent reindex with 409 Conflict if already processing', async () => {
      const mockQuery = vi
        .fn()
        // 1. UPDATE matches 0 rows because reindex_status is already 'processing'
        .mockResolvedValueOnce({ rows: [] })
        // 2. SELECT finds document exists with reindex_status = 'processing'
        .mockResolvedValueOnce({ rows: [{ id: 'doc-1', reindex_status: 'processing' }] });

      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      await expect(repo.startDocumentReindex('squat-depth')).rejects.toThrow(/already undergoing reindexing/);
    });

    it('throws 404 Not Found when document does not exist for startDocumentReindex', async () => {
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      await expect(repo.startDocumentReindex('non-existent-doc')).rejects.toThrow(/not found/);
    });

    it('records failure in reindex_status and reindex_error without altering processing_status or is_active', async () => {
      const mockQuery = vi.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            slug: 'squat-depth',
            title: 'Squat Depth',
            category: 'fitness',
            content: 'Squat text',
            author: 'ACSM',
            license: 'Public Domain',
            metadata: {},
            version: 1,
            is_active: true,
            content_hash: 'hash-squat',
            processing_status: 'ready',
            processing_error: null,
            reindex_status: 'failed',
            reindex_error: 'Embedding quota exceeded',
            last_reindexed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const doc = await repo.failDocumentReindex('squat-depth', 'Embedding quota exceeded');
      expect(doc.reindexStatus).toBe('failed');
      expect(doc.reindexError).toBe('Embedding quota exceeded');
      expect(doc.processingStatus).toBe('ready'); // Unchanged!
      expect(doc.isActive).toBe(true); // Unchanged!

      const call = mockQuery.mock.calls[0]!;
      expect(call[0]).toContain("reindex_status = 'failed'");
      expect(call[0]).not.toContain('processing_status =');
    });
  });

  describe('updateDocumentStatus & updateDocumentMetadata', () => {
    it('updates is_active flag', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'doc-1',
            slug: 'bench-press',
            title: 'Bench Press',
            category: 'fitness',
            content: 'Content',
            author: 'Author',
            license: 'License',
            metadata: {},
            version: 1,
            is_active: false,
            content_hash: 'hash-1',
            processing_status: 'ready',
            processing_error: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const res = await repo.updateDocumentStatus('bench-press', false);
      expect(res?.isActive).toBe(false);
      expect(mockQuery.mock.calls[0]![0]).toContain('SET is_active = $2');
      expect(mockQuery.mock.calls[0]![1]).toEqual(['bench-press', false]);
    });

    it('updates metadata fields', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'doc-1',
            slug: 'bench-press',
            title: 'New Title',
            category: 'fitness',
            content: 'Content',
            author: 'New Author',
            license: 'License',
            metadata: {},
            version: 1,
            is_active: true,
            content_hash: 'hash-1',
            processing_status: 'ready',
            processing_error: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const res = await repo.updateDocumentMetadata('bench-press', {
        title: 'New Title',
        author: 'New Author',
      });
      expect(res?.title).toBe('New Title');
      expect(res?.author).toBe('New Author');
    });
  });

  describe('findSimilarChunks', () => {
    it('queries using pgvector cosine distance and filters for active and ready documents', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'chunk-1',
            document_id: 'doc-1',
            chunk_index: 0,
            content: 'Barbell bench press elbow angle 45-75 degrees.',
            token_count: 8,
            metadata: { sectionHeader: 'Elbows' },
            created_at: new Date('2026-11-20T10:00:00Z'),
            document_slug: 'bench-press',
            document_title: 'Bench Press Technique',
            document_category: 'fitness',
            similarity: '0.885',
          },
        ],
      });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const fakeQueryVector = new Array(768).fill(0.02);
      const results = await repo.findSimilarChunks({
        embedding: fakeQueryVector,
        limit: 5,
        minSimilarity: 0.75,
        category: 'fitness',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.documentSlug).toBe('bench-press');
      expect(results[0]!.similarity).toBe(0.885);

      // Verify SQL contains cosine distance <=> and active/ready filter
      const queryCall = mockQuery.mock.calls[0]!;
      expect(queryCall[0]).toContain('(d.is_active = true)');
      expect(queryCall[0]).toContain("(d.processing_status = 'ready')");
      expect(queryCall[0]).toContain('c.embedding <=> $1::vector');
      expect(queryCall[1][0]).toBe(formatVector(fakeQueryVector));
    });
  });

  describe('findTextChunks', () => {
    it('queries using multilingual simple and english dictionaries with active filtering', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'chunk-1',
            document_id: 'doc-1',
            chunk_index: 0,
            content: 'உடற்பயிற்சி மற்றும் உணவு முறை',
            token_count: 8,
            metadata: {},
            created_at: new Date('2026-11-20T10:00:00Z'),
            document_slug: 'tamil-guide',
            document_title: 'Tamil Fitness Guide',
            document_category: 'fitness',
            text_rank: '0.85',
          },
        ],
      });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const results = await repo.findTextChunks({
        query: 'உடற்பயிற்சி',
        limit: 5,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.documentSlug).toBe('tamil-guide');

      const queryCall = mockQuery.mock.calls[0]!;
      expect(queryCall[0]).toContain('(d.is_active = true)');
      expect(queryCall[0]).toContain("(d.processing_status = 'ready')");
      expect(queryCall[0]).toContain("to_tsvector('simple', c.content)");
      expect(queryCall[0]).toContain("to_tsvector('english', c.content)");
    });
  });

  describe('deleteDocument', () => {
    it('deletes by id or slug and returns true when a record was removed', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: 'doc-1' }] });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const deleted = await repo.deleteDocument('acsm-bench-press');
      expect(deleted).toBe(true);
      expect(mockQuery.mock.calls[0]![0]).toContain('DELETE FROM knowledge_documents');
    });

    it('returns false when no record matches', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const mockDb = { query: mockQuery } as unknown as Database;
      const repo = new PgKnowledgeRepository(mockDb);

      const deleted = await repo.deleteDocument('unknown-slug');
      expect(deleted).toBe(false);
    });
  });
});

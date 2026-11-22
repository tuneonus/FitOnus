import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeService } from '../../../src/modules/knowledge/application/knowledge-service.js';
import type { KnowledgeDocument } from '../../../src/modules/knowledge/domain/knowledge.types.js';
import {
  createKnowledgeAdminController,
  slugify,
} from '../../../src/modules/knowledge/interface/knowledge-admin.controller.js';

describe('knowledge-admin.controller', () => {
  let mockKnowledgeService: KnowledgeService;

  const sampleDoc: KnowledgeDocument = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'bench-press-technique',
    title: 'Bench Press Technique & Mechanics',
    category: 'fitness',
    content: 'Full chest touch and scapular retraction are key cues for horizontal pressing.',
    author: 'Coach Mark',
    license: 'CC-BY-4.0',
    metadata: { source: 'admin' },
    version: 1,
    isActive: true,
    contentHash: 'hash-sample-123',
    processingStatus: 'ready',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    mockKnowledgeService = {
      ingestDocument: vi.fn().mockResolvedValue({
        document: sampleDoc,
        chunkCount: 3,
      }),
      reindexDocument: vi.fn().mockResolvedValue({
        document: { ...sampleDoc, version: 2 },
        chunkCount: 3,
      }),
      updateDocumentStatus: vi.fn().mockResolvedValue({
        ...sampleDoc,
        isActive: false,
      }),
      updateDocumentMetadata: vi.fn().mockResolvedValue({
        ...sampleDoc,
        title: 'Updated Bench Title',
      }),
      listDocuments: vi.fn().mockResolvedValue({
        documents: [sampleDoc],
        total: 1,
      }),
      getDocument: vi.fn().mockResolvedValue(sampleDoc),
      getDocumentChunks: vi.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          documentId: sampleDoc.id,
          chunkIndex: 0,
          content: 'Scapular retraction is essential.',
          tokenCount: 6,
          embedding: [0.1, 0.2],
          metadata: {},
          createdAt: new Date(),
        },
      ]),
      deleteDocument: vi.fn().mockResolvedValue(true),
      searchHybrid: vi.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          documentId: sampleDoc.id,
          documentSlug: sampleDoc.slug,
          documentTitle: sampleDoc.title,
          documentCategory: sampleDoc.category,
          chunkIndex: 0,
          content: 'Scapular retraction is essential.',
          tokenCount: 6,
          metadata: {},
          similarity: 0.88,
          textRank: 0.75,
          rrfScore: 0.032,
          denseRank: 1,
          textualRank: 1,
          createdAt: new Date(),
        },
      ]),
      buildRagContext: vi.fn().mockReturnValue({
        items: [
          {
            documentSlug: sampleDoc.slug,
            documentTitle: sampleDoc.title,
            category: sampleDoc.category,
            chunkIndex: 0,
            content: 'Scapular retraction is essential.',
            citation: '[bench-press-technique:0]',
            similarity: 0.88,
            rrfScore: 0.032,
          },
        ],
        citations: [
          {
            documentSlug: sampleDoc.slug,
            documentTitle: sampleDoc.title,
            category: sampleDoc.category,
            chunkIndex: 0,
            citation: '[bench-press-technique:0]',
          },
        ],
        formattedPromptSection: '<retrieved_knowledge>...</retrieved_knowledge>',
        totalTokens: 15,
      }),
    } as unknown as KnowledgeService;
  });

  describe('slugify', () => {
    it('creates lowercase hyphenated slug', () => {
      expect(slugify('Hypertrophy & Strength Principles!')).toBe('hypertrophy-strength-principles');
    });

    it('handles unicode accents and punctuation', () => {
      expect(slugify('Café & Protéine Étude 2026')).toBe('cafe-proteine-etude-2026');
    });

    it('falls back to random suffix for very short names', () => {
      const slug = slugify('a');
      expect(slug.length).toBeGreaterThanOrEqual(3);
      expect(slug).toMatch(/^a-[a-z0-9]+$/);
    });
  });

  describe('uploadDocument', () => {
    it('ingests file via JSON upload with content string and sanitizes filename', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        get: (h: string) => {
          if (h === 'content-type') return 'application/json';
          if (h === 'x-file-name') return '../../etc/passwd.txt';
          return undefined;
        },
        body: {
          title: 'Hydration Guidelines',
          category: 'fitness',
          content: 'Water and electrolyte balance are vital for athletes during long training sessions.',
        },
        query: {},
      } as unknown as Request;

      const result = await controller.uploadDocument(req);
      expect(result.status).toBe(201);
      expect(result.data.chunkCount).toBe(3);
      expect(mockKnowledgeService.ingestDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Hydration Guidelines',
          category: 'fitness',
          content: expect.stringContaining('Water and electrolyte balance'),
          metadata: expect.objectContaining({
            sourceFileName: 'etcpasswd.txt',
          }),
        }),
        undefined,
      );
    });

    it('rejects upload with invalid category', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        get: (h: string) => (h === 'content-type' ? 'application/json' : undefined),
        body: {
          title: 'Invalid',
          category: 'invalid_category',
          content: 'Some sufficient length content for testing validation failure.',
        },
        query: {},
      } as unknown as Request;

      await expect(controller.uploadDocument(req)).rejects.toThrow(/Invalid category/);
    });
  });

  describe('reindexDocument', () => {
    it('calls service.reindexDocument and returns updated document', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: 'bench-press-technique' },
        },
      } as unknown as Request;

      const result = await controller.reindexDocument(req);
      expect(result.status).toBe(200);
      expect(result.data.document.version).toBe(2);
      expect(mockKnowledgeService.reindexDocument).toHaveBeenCalledWith('bench-press-technique', undefined);
    });
  });

  describe('updateDocumentStatus', () => {
    it('calls service.updateDocumentStatus and returns updated document', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: 'bench-press-technique' },
          body: { isActive: false },
        },
      } as unknown as Request;

      const result = await controller.updateDocumentStatus(req);
      expect(result.status).toBe(200);
      expect(result.data.isActive).toBe(false);
      expect(mockKnowledgeService.updateDocumentStatus).toHaveBeenCalledWith('bench-press-technique', false);
    });
  });

  describe('updateDocumentMetadata', () => {
    it('calls service.updateDocumentMetadata and returns updated document', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: 'bench-press-technique' },
          body: { title: 'Updated Bench Title' },
        },
      } as unknown as Request;

      const result = await controller.updateDocumentMetadata(req);
      expect(result.status).toBe(200);
      expect(result.data.title).toBe('Updated Bench Title');
      expect(mockKnowledgeService.updateDocumentMetadata).toHaveBeenCalledWith('bench-press-technique', {
        title: 'Updated Bench Title',
      });
    });
  });

  describe('createDocument', () => {
    it('creates document via JSON validation', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        body: {
          title: 'Deadlift Setup',
          category: 'fitness',
          content: 'Brace your core, hinge at hips, and engage lats before pulling.',
        },
        validated: {
          body: {
            title: 'Deadlift Setup',
            category: 'fitness',
            content: 'Brace your core, hinge at hips, and engage lats before pulling.',
          },
        },
      } as unknown as Request;

      const result = await controller.createDocument(req);
      expect(result.status).toBe(201);
      expect(result.data.document.id).toBe(sampleDoc.id);
      expect(mockKnowledgeService.ingestDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'deadlift-setup',
          title: 'Deadlift Setup',
          category: 'fitness',
        }),
        undefined,
      );
    });
  });

  describe('listDocuments', () => {
    it('returns paginated document list with filters', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          query: { limit: 10, offset: 0, page: 1, isActive: true },
        },
      } as unknown as Request;

      const result = await controller.listDocuments(req);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(mockKnowledgeService.listDocuments).toHaveBeenCalledWith({
        category: undefined,
        isActive: true,
        status: undefined,
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getDocument', () => {
    it('retrieves document without chunks by default', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: sampleDoc.slug },
          query: { includeChunks: false },
        },
      } as unknown as Request;

      const result = await controller.getDocument(req);
      expect(result.data.slug).toBe(sampleDoc.slug);
      expect(result.data.chunks).toBeUndefined();
    });

    it('retrieves document with vector chunks when requested', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: sampleDoc.id },
          query: { includeChunks: true },
        },
      } as unknown as Request;

      const result = await controller.getDocument(req);
      expect(result.data.chunks).toHaveLength(1);
      expect(result.data.chunks![0]!.content).toBe('Scapular retraction is essential.');
    });

    it('throws 404 when document not found', async () => {
      vi.mocked(mockKnowledgeService.getDocument).mockResolvedValueOnce(null);
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: 'non-existent' },
          query: {},
        },
      } as unknown as Request;

      await expect(controller.getDocument(req)).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteDocument', () => {
    it('deletes document successfully', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: sampleDoc.slug },
        },
      } as unknown as Request;

      const result = await controller.deleteDocument(req);
      expect(result.data.deleted).toBe(true);
      expect(mockKnowledgeService.deleteDocument).toHaveBeenCalledWith(sampleDoc.slug);
    });

    it('throws 404 if document does not exist to delete', async () => {
      vi.mocked(mockKnowledgeService.deleteDocument).mockResolvedValueOnce(false);
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          params: { idOrSlug: 'missing-slug' },
        },
      } as unknown as Request;

      await expect(controller.deleteDocument(req)).rejects.toThrow(/not found/i);
    });
  });

  describe('searchKnowledge', () => {
    it('runs hybrid search and builds RAG context preview', async () => {
      const controller = createKnowledgeAdminController(mockKnowledgeService);
      const req = {
        validated: {
          body: {
            query: 'bench press scapular retraction',
            limit: 5,
            testRagContext: true,
          },
        },
      } as unknown as Request;

      const result = await controller.searchKnowledge(req);
      expect(result.data.query).toBe('bench press scapular retraction');
      expect(result.data.chunks).toHaveLength(1);
      expect(result.data.ragContext).toBeDefined();
      expect(result.data.ragContext?.citations).toHaveLength(1);
    });
  });
});

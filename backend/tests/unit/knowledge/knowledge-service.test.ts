import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/shared/errors/app-error.js';
import type { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { KnowledgeService } from '../../../src/modules/knowledge/application/knowledge-service.js';
import type {
  KnowledgeDocument,
  KnowledgeRepository,
} from '../../../src/modules/knowledge/domain/knowledge.types.js';

describe('KnowledgeService', () => {
  const fake768Vector = new Array(768).fill(0.01);

  const sampleDoc: KnowledgeDocument = {
    id: 'doc-123',
    slug: 'acsm-squat',
    title: 'Squat Biomechanics',
    category: 'fitness',
    content: 'Squat depth should reach parallel with hips below patella.',
    author: 'ACSM',
    license: 'Public Domain',
    metadata: {},
    version: 1,
    isActive: true,
    contentHash: 'hash-squat-123',
    processingStatus: 'ready',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPythonAi = {
    embed: vi.fn().mockResolvedValue({
      outcome: 'ok',
      embeddings: [fake768Vector],
      dimensions: 768,
      count: 1,
      usage: {
        model: 'gemini-embedding-001',
        isFallback: false,
        inputTokens: 20,
        outputTokens: 0,
        cachedTokens: 0,
        thinkingTokens: 0,
        totalTokens: 20,
        durationMs: 40,
      },
      traceId: 'trace-embed-1',
    }),
  } as unknown as PythonAiClient;

  const mockRepo = {
    saveDocument: vi.fn().mockResolvedValue(sampleDoc),
    replaceDocumentChunks: vi.fn().mockResolvedValue(undefined),
    updateDocumentStatus: vi.fn().mockResolvedValue({ ...sampleDoc, isActive: false }),
    updateDocumentProcessing: vi.fn().mockResolvedValue(sampleDoc),
    updateDocumentMetadata: vi.fn().mockResolvedValue({ ...sampleDoc, title: 'Updated Squat' }),
    findSimilarChunks: vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        documentId: 'doc-123',
        documentSlug: 'acsm-squat',
        documentTitle: 'Squat Biomechanics',
        documentCategory: 'fitness',
        chunkIndex: 0,
        content: 'Squat depth should reach parallel.',
        tokenCount: 6,
        metadata: {},
        similarity: 0.89,
        createdAt: new Date(),
      },
    ]),
    deleteDocument: vi.fn().mockResolvedValue(true),
    getDocumentById: vi.fn().mockResolvedValue(sampleDoc),
    getDocumentBySlug: vi.fn().mockResolvedValue(null),
    getDocumentByContentHash: vi.fn().mockResolvedValue(null),
    listDocuments: vi.fn().mockResolvedValue({ documents: [sampleDoc], total: 1 }),
    getChunksByDocumentId: vi.fn(),
  } as unknown as KnowledgeRepository;

  const service = new KnowledgeService(mockRepo, mockPythonAi);

  describe('ingestDocument', () => {
    it('validates document slug format and content', async () => {
      await expect(
        service.ingestDocument({
          slug: 'INVALID SLUG WITH SPACES',
          title: 'Title',
          category: 'fitness',
          content: 'Some text',
        }),
      ).rejects.toThrow(AppError);

      await expect(
        service.ingestDocument({
          slug: 'valid-slug',
          title: '',
          category: 'fitness',
          content: 'Some text',
        }),
      ).rejects.toThrow(AppError);
    });

    it('rejects duplicate slug BEFORE calling embedding API', async () => {
      const duplicateSlugRepo = {
        getDocumentBySlug: vi.fn().mockResolvedValue(sampleDoc),
        getDocumentByContentHash: vi.fn().mockResolvedValue(null),
        saveDocument: vi.fn(),
      } as unknown as KnowledgeRepository;
      const embedSpyAi = {
        embed: vi.fn(),
      } as unknown as PythonAiClient;

      const dupService = new KnowledgeService(duplicateSlugRepo, embedSpyAi);

      await expect(
        dupService.ingestDocument({
          slug: 'acsm-squat',
          title: 'New Squat Doc',
          category: 'fitness',
          content: 'Some fresh text here.',
        }),
      ).rejects.toThrow(/already exists/);

      expect(embedSpyAi.embed).not.toHaveBeenCalled();
      expect(duplicateSlugRepo.saveDocument).not.toHaveBeenCalled();
    });

    it('rejects duplicate content hash BEFORE calling embedding API', async () => {
      const duplicateHashRepo = {
        getDocumentBySlug: vi.fn().mockResolvedValue(null),
        getDocumentByContentHash: vi.fn().mockResolvedValue(sampleDoc),
        saveDocument: vi.fn(),
      } as unknown as KnowledgeRepository;
      const embedSpyAi = {
        embed: vi.fn(),
      } as unknown as PythonAiClient;

      const dupService = new KnowledgeService(duplicateHashRepo, embedSpyAi);

      await expect(
        dupService.ingestDocument({
          slug: 'different-slug',
          title: 'Copied Content',
          category: 'fitness',
          content: 'Squat depth should reach parallel with hips below patella.',
        }),
      ).rejects.toThrow(/identical content already exists/);

      expect(embedSpyAi.embed).not.toHaveBeenCalled();
      expect(duplicateHashRepo.saveDocument).not.toHaveBeenCalled();
    });

    it('chunks, generates 768-d embeddings via PythonAiClient, and persists to repository with hash', async () => {
      const result = await service.ingestDocument({
        slug: 'acsm-squat',
        title: 'Squat Biomechanics',
        category: 'fitness',
        content: 'Squat depth should reach parallel with hips below patella.',
      });

      expect(result.document.id).toBe('doc-123');
      expect(result.chunkCount).toBe(1);

      // Verify PythonAiClient was called with RETRIEVAL_DOCUMENT and 768 dimensions
      expect(mockPythonAi.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'RETRIEVAL_DOCUMENT',
          dimensions: 768,
          title: 'Squat Biomechanics',
          texts: expect.arrayContaining([expect.stringContaining('Squat depth')]),
        }),
      );

      // Verify repository was called with contentHash and lifecycle
      expect(mockRepo.saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'acsm-squat',
          isActive: true,
          processingStatus: 'ready',
          contentHash: expect.any(String),
        }),
        expect.arrayContaining([
          expect.objectContaining({
            chunkIndex: 0,
            embedding: fake768Vector,
          }),
        ]),
      );
    });

    it('aborts and does not call repository.saveDocument when embedding call fails', async () => {
      const failingPythonAi = {
        embed: vi.fn().mockRejectedValue(new Error('AI backend timeout or rate limit')),
      } as unknown as PythonAiClient;
      const isolatedRepo = {
        getDocumentBySlug: vi.fn().mockResolvedValue(null),
        getDocumentByContentHash: vi.fn().mockResolvedValue(null),
        saveDocument: vi.fn(),
      } as unknown as KnowledgeRepository;

      const failingService = new KnowledgeService(isolatedRepo, failingPythonAi);

      await expect(
        failingService.ingestDocument({
          slug: 'bench-fail',
          title: 'Bench Fail',
          category: 'fitness',
          content: 'Bench press content to embed.',
        }),
      ).rejects.toThrowError(/AI backend timeout or rate limit/);

      expect(isolatedRepo.saveDocument).not.toHaveBeenCalled();
    });
  });

  describe('reindexDocument', () => {
    it('successfully reindexes, re-embeds and replaces chunks', async () => {
      const reindexRepo = {
        startDocumentReindex: vi.fn().mockResolvedValue(sampleDoc),
        failDocumentReindex: vi.fn(),
        replaceDocumentChunks: vi.fn().mockResolvedValue(undefined),
        getDocumentById: vi.fn().mockResolvedValue({ ...sampleDoc, version: 2, reindexStatus: 'completed' }),
        getDocumentBySlug: vi
          .fn()
          .mockResolvedValue({ ...sampleDoc, version: 2, reindexStatus: 'completed' }),
      } as unknown as KnowledgeRepository;

      const reindexService = new KnowledgeService(reindexRepo, mockPythonAi);

      const result = await reindexService.reindexDocument('acsm-squat');
      expect(result.chunkCount).toBe(1);
      expect(reindexRepo.startDocumentReindex).toHaveBeenCalledWith('acsm-squat');
      expect(mockPythonAi.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'RETRIEVAL_DOCUMENT',
          dimensions: 768,
          title: 'Squat Biomechanics',
        }),
      );
      expect(reindexRepo.replaceDocumentChunks).toHaveBeenCalledWith('doc-123', expect.any(Array));
      expect(reindexRepo.failDocumentReindex).not.toHaveBeenCalled();
    });

    it('marks reindex_status = failed and DOES NOT replace chunks if embedding fails during reindexing', async () => {
      const failingPythonAi = {
        embed: vi.fn().mockRejectedValue(new Error('Quota exceeded')),
      } as unknown as PythonAiClient;
      const reindexRepo = {
        startDocumentReindex: vi.fn().mockResolvedValue(sampleDoc),
        failDocumentReindex: vi
          .fn()
          .mockResolvedValue({ ...sampleDoc, reindexStatus: 'failed', reindexError: 'Quota exceeded' }),
        replaceDocumentChunks: vi.fn(),
      } as unknown as KnowledgeRepository;

      const reindexService = new KnowledgeService(reindexRepo, failingPythonAi);

      await expect(reindexService.reindexDocument('acsm-squat')).rejects.toThrow(/Quota exceeded/);

      // 1. Verify startDocumentReindex was called
      expect(reindexRepo.startDocumentReindex).toHaveBeenCalledWith('acsm-squat');

      // 2. Verify failDocumentReindex was called with error details
      expect(reindexRepo.failDocumentReindex).toHaveBeenCalledWith(
        'doc-123',
        expect.stringContaining('Quota exceeded'),
      );

      // 3. Verify existing chunks were preserved: replaceDocumentChunks was NOT called!
      expect(reindexRepo.replaceDocumentChunks).not.toHaveBeenCalled();
    });

    it('marks reindex_status = failed if chunking produces 0 chunks and does not call embed', async () => {
      const emptyDoc = { ...sampleDoc, content: '   ' };
      const embedSpyAi = {
        embed: vi.fn(),
      } as unknown as PythonAiClient;
      const reindexRepo = {
        startDocumentReindex: vi.fn().mockResolvedValue(emptyDoc),
        failDocumentReindex: vi.fn(),
        replaceDocumentChunks: vi.fn(),
      } as unknown as KnowledgeRepository;

      const reindexService = new KnowledgeService(reindexRepo, embedSpyAi);

      await expect(reindexService.reindexDocument('acsm-squat')).rejects.toThrow(/0 valid chunks/);
      expect(reindexRepo.failDocumentReindex).toHaveBeenCalledWith(
        'doc-123',
        expect.stringContaining('0 valid chunks'),
      );
      expect(embedSpyAi.embed).not.toHaveBeenCalled();
      expect(reindexRepo.replaceDocumentChunks).not.toHaveBeenCalled();
    });

    it('preserves disabled status (isActive: false) across reindexing', async () => {
      const disabledDoc = { ...sampleDoc, isActive: false };
      const reindexRepo = {
        startDocumentReindex: vi.fn().mockResolvedValue(disabledDoc),
        failDocumentReindex: vi.fn(),
        replaceDocumentChunks: vi.fn().mockResolvedValue(undefined),
        getDocumentById: vi
          .fn()
          .mockResolvedValue({ ...disabledDoc, version: 2, reindexStatus: 'completed' }),
        getDocumentBySlug: vi
          .fn()
          .mockResolvedValue({ ...disabledDoc, version: 2, reindexStatus: 'completed' }),
      } as unknown as KnowledgeRepository;

      const reindexService = new KnowledgeService(reindexRepo, mockPythonAi);

      const result = await reindexService.reindexDocument('acsm-squat');
      expect(result.document.isActive).toBe(false);
      expect(reindexRepo.replaceDocumentChunks).toHaveBeenCalledWith('doc-123', expect.any(Array));
    });

    it('rejects concurrent reindex with 409 Conflict without triggering embedding', async () => {
      const embedSpyAi = {
        embed: vi.fn(),
      } as unknown as PythonAiClient;
      const busyRepo = {
        startDocumentReindex: vi
          .fn()
          .mockRejectedValue(
            new AppError('conflict', 'CONFLICT', "Document 'acsm-squat' is already undergoing reindexing."),
          ),
        failDocumentReindex: vi.fn(),
        replaceDocumentChunks: vi.fn(),
      } as unknown as KnowledgeRepository;

      const reindexService = new KnowledgeService(busyRepo, embedSpyAi);

      await expect(reindexService.reindexDocument('acsm-squat')).rejects.toThrow(
        /already undergoing reindexing/,
      );
      expect(embedSpyAi.embed).not.toHaveBeenCalled();
      expect(busyRepo.failDocumentReindex).not.toHaveBeenCalled();
      expect(busyRepo.replaceDocumentChunks).not.toHaveBeenCalled();
    });

    it('ensures existing chunks remain searchable during reindex and after reindex failure', async () => {
      // Step A: Search returns existing chunk when document is ready
      const initialResults = await service.searchSimilar('squat technique');
      expect(initialResults).toHaveLength(1);
      expect(initialResults[0]!.documentSlug).toBe('acsm-squat');

      // Step B: Reindex fails
      const failingAi = {
        embed: vi.fn().mockRejectedValueOnce(new Error('Temporary Gemini timeout')),
      } as unknown as PythonAiClient;
      const resilientRepo = {
        ...mockRepo,
        startDocumentReindex: vi.fn().mockResolvedValue(sampleDoc),
        failDocumentReindex: vi.fn().mockResolvedValue({
          ...sampleDoc,
          reindexStatus: 'failed',
          reindexError: 'Temporary Gemini timeout',
        }),
      } as unknown as KnowledgeRepository;

      const testService = new KnowledgeService(resilientRepo, failingAi);

      await expect(testService.reindexDocument('acsm-squat')).rejects.toThrow(/Temporary Gemini timeout/);

      // Step C: Subsequent search query STILL finds the chunk because processing_status is 'ready'
      const postFailureResults = await service.searchSimilar('squat technique');
      expect(postFailureResults).toHaveLength(1);
      expect(postFailureResults[0]!.documentSlug).toBe('acsm-squat');
    });
  });

  describe('updateDocumentStatus & updateDocumentMetadata', () => {
    it('toggles document status via repository', async () => {
      const result = await service.updateDocumentStatus('acsm-squat', false);
      expect(result.isActive).toBe(false);
      expect(mockRepo.updateDocumentStatus).toHaveBeenCalledWith('acsm-squat', false);
    });

    it('updates document metadata via repository', async () => {
      const result = await service.updateDocumentMetadata('acsm-squat', { title: 'Updated Squat' });
      expect(result.title).toBe('Updated Squat');
      expect(mockRepo.updateDocumentMetadata).toHaveBeenCalledWith('acsm-squat', { title: 'Updated Squat' });
    });
  });

  describe('searchSimilar', () => {
    it('generates query vector with RETRIEVAL_QUERY task type and queries repository', async () => {
      const results = await service.searchSimilar('how deep should I squat?', {
        limit: 3,
        minSimilarity: 0.7,
        category: 'fitness',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.documentSlug).toBe('acsm-squat');
      expect(results[0]!.similarity).toBe(0.89);

      // Verify PythonAiClient was called with RETRIEVAL_QUERY and 768 dimensions
      expect(mockPythonAi.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'RETRIEVAL_QUERY',
          dimensions: 768,
          texts: ['how deep should I squat?'],
        }),
      );

      // Verify repository was queried with the vector
      expect(mockRepo.findSimilarChunks).toHaveBeenCalledWith({
        embedding: fake768Vector,
        limit: 3,
        minSimilarity: 0.7,
        category: 'fitness',
      });
    });

    it('returns empty array when query is empty', async () => {
      const results = await service.searchSimilar('   ');
      expect(results).toEqual([]);
    });
  });

  describe('deleteDocument', () => {
    it('delegates deletion to repository', async () => {
      const deleted = await service.deleteDocument('acsm-squat');
      expect(deleted).toBe(true);
      expect(mockRepo.deleteDocument).toHaveBeenCalledWith('acsm-squat');
    });
  });
});

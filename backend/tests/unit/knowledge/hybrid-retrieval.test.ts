import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { KnowledgeService } from '../../../src/modules/knowledge/application/knowledge-service.js';
import type {
  HybridChunk,
  KnowledgeRepository,
  TextChunk,
} from '../../../src/modules/knowledge/domain/knowledge.types.js';

describe('KnowledgeService Hybrid Retrieval & Lexical Search', () => {
  let mockRepo: KnowledgeRepository;
  let mockPythonAi: PythonAiClient;
  let service: KnowledgeService;

  const mockDate = new Date('2026-11-20T10:00:00Z');

  const mockHybridChunk: HybridChunk = {
    id: 'chunk-1',
    documentId: 'doc-1',
    documentSlug: 'issn-protein-intake',
    documentTitle: 'ISSN Position Stand: Protein and Exercise',
    documentCategory: 'nutrition',
    chunkIndex: 0,
    content: 'An intake of 1.4 to 2.0 g/kg/day is recommended for active individuals.',
    tokenCount: 42,
    metadata: {},
    similarity: 0.89,
    textRank: 0.65,
    rrfScore: 0.032,
    createdAt: mockDate,
  };

  const mockTextChunk: TextChunk = {
    id: 'chunk-2',
    documentId: 'doc-2',
    documentSlug: 'acsm-progressive-overload',
    documentTitle: 'ACSM Progressive Overload Guidelines',
    documentCategory: 'fitness',
    chunkIndex: 0,
    content: 'Progressive overload involves systematically increasing exercise stimulus.',
    tokenCount: 38,
    metadata: {},
    rank: 0.72,
    createdAt: mockDate,
  };

  beforeEach(() => {
    mockRepo = {
      saveDocument: vi.fn(),
      getDocumentById: vi.fn(),
      getDocumentBySlug: vi.fn(),
      getDocumentByContentHash: vi.fn(),
      listDocuments: vi.fn(),
      deleteDocument: vi.fn(),
      startDocumentReindex: vi.fn(),
      failDocumentReindex: vi.fn(),
      replaceDocumentChunks: vi.fn(),
      updateDocumentStatus: vi.fn(),
      updateDocumentProcessing: vi.fn(),
      updateDocumentMetadata: vi.fn(),
      getChunksByDocumentId: vi.fn(),
      findSimilarChunks: vi.fn(),
      findTextChunks: vi.fn().mockResolvedValue([mockTextChunk]),
      findHybridChunks: vi.fn().mockResolvedValue([mockHybridChunk]),
    };

    mockPythonAi = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [new Array(768).fill(0.01)],
        usage: { totalTokens: 8 },
      }),
    } as unknown as PythonAiClient;

    service = new KnowledgeService(mockRepo, mockPythonAi);
  });

  describe('searchHybrid', () => {
    it('returns empty array immediately when query is whitespace', async () => {
      const results = await service.searchHybrid('   ');
      expect(results).toEqual([]);
      expect(mockPythonAi.embed).not.toHaveBeenCalled();
      expect(mockRepo.findHybridChunks).not.toHaveBeenCalled();
    });

    it('embeds query and executes hybrid search with RRF', async () => {
      const results = await service.searchHybrid('optimal daily protein intake', {
        limit: 5,
        minSimilarity: 0.4,
        category: 'nutrition',
        rrfK: 60,
      });

      // 1. Verifies embedding generation
      expect(mockPythonAi.embed).toHaveBeenCalledWith(
        expect.objectContaining({
          texts: ['optimal daily protein intake'],
          taskType: 'RETRIEVAL_QUERY',
          dimensions: 768,
        }),
      );

      // 2. Verifies repository query with dense vector and text
      expect(mockRepo.findHybridChunks).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'optimal daily protein intake',
          limit: 5,
          minSimilarity: 0.4,
          category: 'nutrition',
          rrfK: 60,
        }),
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.documentSlug).toBe('issn-protein-intake');
      expect(results[0]!.rrfScore).toBeCloseTo(0.032, 3);
    });
  });

  describe('searchLexical', () => {
    it('returns empty array when query is empty', async () => {
      const results = await service.searchLexical('');
      expect(results).toEqual([]);
      expect(mockRepo.findTextChunks).not.toHaveBeenCalled();
    });

    it('queries repository for text matches without calling embedding service', async () => {
      const results = await service.searchLexical('progressive overload', {
        limit: 3,
        minRank: 0.1,
        category: 'fitness',
      });

      expect(mockPythonAi.embed).not.toHaveBeenCalled();
      expect(mockRepo.findTextChunks).toHaveBeenCalledWith({
        query: 'progressive overload',
        limit: 3,
        minRank: 0.1,
        category: 'fitness',
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.documentSlug).toBe('acsm-progressive-overload');
    });
  });
});


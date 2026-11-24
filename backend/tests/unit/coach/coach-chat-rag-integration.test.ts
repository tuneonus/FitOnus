import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../src/shared/logging/logger.js';
import type { AiUsageGate } from '../../../src/shared/ai/ai-usage.js';
import type { GeminiService, UserContextRepository } from '../../../src/modules/coach/application/ports.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import type { KnowledgeService } from '../../../src/modules/knowledge/application/knowledge-service.js';
import type { HybridChunk } from '../../../src/modules/knowledge/domain/knowledge.types.js';

describe('AI Coach Chat RAG Grounding & Hybrid Retrieval Integration', () => {
  const USER_ID = 'test-user-123';

  const mockContext: UserFitnessContext = {
    profile: {
      displayName: 'Karthik',
      sex: 'male',
      age: 28,
      heightCm: 175,
      currentWeightKg: 75,
      targetWeightKg: 72,
      primaryGoal: 'Muscle Hypertrophy',
      experienceLevel: 'Intermediate',
      preferredWorkoutPlace: 'Gym',
      workoutDaysPerWeek: 4,
      dietType: 'Non-Vegetarian',
      dailyCalorieTarget: 2500,
      dailyProteinGrams: 150,
    },
    todayNutrition: {
      caloriesConsumed: 1800,
      proteinGrams: 110,
      carbsGrams: 200,
      fatGrams: 55,
      waterIntakeMl: 2500,
      calorieTarget: 2500,
      proteinTarget: 150,
    },
    recentWorkouts: [],
    todayPlannedWorkout: null,
    activeGoals: [],
    latestWeightKg: 75,
  };

  const mockHybridChunk: HybridChunk = {
    id: 'chunk-bench-01',
    documentId: 'doc-acsm-bench',
    documentSlug: 'acsm-bench-press-technique',
    documentTitle: 'ACSM Bench Press Technique & Shoulder Safety',
    documentCategory: 'fitness',
    chunkIndex: 0,
    content: 'Maintain five points of contact and moderate thoracic extension during bench press.',
    tokenCount: 45,
    metadata: { author: 'ACSM' },
    similarity: 0.88,
    textRank: 0.42,
    rrfScore: 0.032,
    createdAt: new Date('2026-11-20T10:00:00Z'),
  };

  let mockUserContextRepo: UserContextRepository;
  let mockGeminiService: GeminiService;
  let mockUsageGate: AiUsageGate;
  let mockKnowledgeService: KnowledgeService;
  let mockWarnLogger: Pick<Logger, 'info' | 'warn'>;

  beforeEach(() => {
    mockUserContextRepo = {
      getUserFitnessContext: vi.fn().mockResolvedValue(mockContext),
    };

    mockGeminiService = {
      generateCoachResponse: vi.fn().mockResolvedValue({
        text: 'Keep your shoulder blades retracted and maintain moderate thoracic arch.',
        followUps: ['Want to check grip width?'],
        sources: ['ACSM Bench Press Technique & Shoulder Safety', 'Profile'],
        citations: [
          {
            documentSlug: 'acsm-bench-press-technique',
            documentTitle: 'ACSM Bench Press Technique & Shoulder Safety',
            category: 'fitness',
            chunkIndex: 0,
            citation: 'ACSM Bench Press Technique & Shoulder Safety (acsm-bench-press-technique, Chunk 0)',
          },
        ],
      }),
      generateInsights: vi.fn(),
    };

    mockUsageGate = {
      run: vi.fn().mockImplementation((_opts, work) => work()),
      check: vi.fn().mockResolvedValue({ allowed: true }),
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as AiUsageGate;

    mockKnowledgeService = {
      searchHybrid: vi.fn().mockResolvedValue([mockHybridChunk]),
      buildRagContext: vi.fn().mockReturnValue({
        items: [
          {
            documentSlug: mockHybridChunk.documentSlug,
            documentTitle: mockHybridChunk.documentTitle,
            category: mockHybridChunk.documentCategory,
            chunkIndex: mockHybridChunk.chunkIndex,
            content: mockHybridChunk.content,
            citation: 'ACSM Bench Press Technique & Shoulder Safety',
            similarity: mockHybridChunk.similarity,
            rrfScore: mockHybridChunk.rrfScore,
          },
        ],
        citations: [
          {
            documentSlug: mockHybridChunk.documentSlug,
            documentTitle: mockHybridChunk.documentTitle,
            category: mockHybridChunk.documentCategory,
            chunkIndex: mockHybridChunk.chunkIndex,
            citation: 'ACSM Bench Press Technique & Shoulder Safety',
          },
        ],
        formattedPromptSection: '<retrieved_knowledge>...</retrieved_knowledge>',
        totalTokens: 45,
      }),
    } as unknown as KnowledgeService;

    mockWarnLogger = {
      info: vi.fn() as unknown as Logger['info'],
      warn: vi.fn() as unknown as Logger['warn'],
    };
  });

  it('retrieves relevant knowledge and passes grounded context to Gemini', async () => {
    const useCase = new ChatWithCoachUseCase(
      mockUserContextRepo,
      mockGeminiService,
      mockUsageGate,
      undefined,
      undefined,
      mockKnowledgeService,
      mockWarnLogger,
    );

    const result = await useCase.execute({
      userId: USER_ID,
      message: 'How should I arch my back during bench press?',
    });

    // 1. Verifies searchHybrid was called with user inquiry
    expect(mockKnowledgeService.searchHybrid).toHaveBeenCalledWith(
      'How should I arch my back during bench press?',
      expect.objectContaining({ limit: 3, minSimilarity: 0.35 }),
    );

    // 2. Verifies GeminiService received knowledge context
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'How should I arch my back during bench press?',
      mockContext,
      undefined,
      undefined,
      [
        expect.objectContaining({
          documentSlug: 'acsm-bench-press-technique',
          documentTitle: 'ACSM Bench Press Technique & Shoulder Safety',
        }),
      ],
    );

    // 3. Verifies output contains text, sources and citations
    expect(result.text).toContain('shoulder blades retracted');
    expect(result.sources).toContain('ACSM Bench Press Technique & Shoulder Safety');
    expect(result.citations).toHaveLength(1);
    expect(result.citations![0]!.documentSlug).toBe('acsm-bench-press-technique');
  });

  it('proceeds normally when knowledge base returns zero matches (empty DB fallback)', async () => {
    vi.mocked(mockKnowledgeService.searchHybrid).mockResolvedValueOnce([]);

    const useCase = new ChatWithCoachUseCase(
      mockUserContextRepo,
      mockGeminiService,
      mockUsageGate,
      undefined,
      undefined,
      mockKnowledgeService,
      mockWarnLogger,
    );

    const result = await useCase.execute({
      userId: USER_ID,
      message: 'What is the best way to warm up?',
    });

    expect(mockKnowledgeService.searchHybrid).toHaveBeenCalled();
    // When no chunks match, knowledge items are empty so standard 3 arguments are passed
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'What is the best way to warm up?',
      mockContext,
      undefined,
    );
    expect(result.text).toBeDefined();
    expect(mockWarnLogger.warn).not.toHaveBeenCalled();
  });

  it('safely falls back to ungrounded coach chat when knowledge retrieval throws an error', async () => {
    vi.mocked(mockKnowledgeService.searchHybrid).mockRejectedValueOnce(
      new Error('Embedding service network timeout'),
    );

    const useCase = new ChatWithCoachUseCase(
      mockUserContextRepo,
      mockGeminiService,
      mockUsageGate,
      undefined,
      undefined,
      mockKnowledgeService,
      mockWarnLogger,
    );

    // Must NOT throw
    const result = await useCase.execute({
      userId: USER_ID,
      message: 'What is the optimal rest time between sets?',
    });

    // Verifies warning was logged without sensitive user PII leaking
    expect(mockWarnLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[CoachRAG] Knowledge retrieval failed; falling back to ungrounded coach chat.'),
    );

    // Verifies GeminiService was still called smoothly with standard arguments
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'What is the optimal rest time between sets?',
      mockContext,
      undefined,
    );
    expect(result.text).toBeDefined();
  });
});

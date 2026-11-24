import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeService } from '../../../src/modules/knowledge/application/knowledge-service.js';
import type {
  ConversationRepository,
  MemoryRepository,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import { CoachContextAssembler } from '../../../src/modules/coach/application/services/context-assembler.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';

describe('CoachContextAssembler', () => {
  const USER_ID = 'test-user-context';

  const mockContext: UserFitnessContext = {
    profile: {
      displayName: 'Karthik',
      sex: 'male',
      age: 28,
      heightCm: 175,
      currentWeightKg: 75,
      targetWeightKg: 70,
      primaryGoal: 'Muscle Hypertrophy',
      experienceLevel: 'intermediate',
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

  let mockUserContextRepo: UserContextRepository;
  let mockConversationRepo: ConversationRepository;
  let mockMemoryRepo: MemoryRepository;
  let mockKnowledgeService: KnowledgeService;

  beforeEach(() => {
    mockUserContextRepo = {
      getUserFitnessContext: vi.fn().mockResolvedValue(mockContext),
    };

    mockConversationRepo = {
      createConversation: vi.fn(),
      getConversation: vi.fn(),
      listConversations: vi.fn(),
      deleteConversation: vi.fn(),
      getMessages: vi.fn().mockResolvedValue([]),
      addMessage: vi.fn(),
      updateConversation: vi.fn(),
      setMessageFeedback: vi.fn(),
    };

    mockMemoryRepo = {
      listMemories: vi.fn(),
      getMemory: vi.fn(),
      createMemory: vi.fn(),
      updateMemory: vi.fn(),
      deleteMemory: vi.fn(),
      updateMemoryStatus: vi.fn(),
      dismissSuggestion: vi.fn(),
      clearAll: vi.fn(),
      isMemoryEnabled: vi.fn().mockResolvedValue(true),
      setMemoryEnabled: vi.fn(),
      getActiveMemoriesForContext: vi.fn().mockResolvedValue(['[INJURIES]: Left shoulder impingement']),
      getDismissedTexts: vi.fn().mockResolvedValue([]),
    };

    mockKnowledgeService = {
      searchHybrid: vi.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          documentSlug: 'bench-press-safety',
          documentTitle: 'Bench Press Safety',
          documentCategory: 'fitness',
          chunkIndex: 0,
          content: 'Keep shoulder blades retracted throughout the movement.',
          tokenCount: 40,
          metadata: {},
          similarity: 0.85,
          textRank: 0.5,
          rrfScore: 0.03,
          createdAt: new Date(),
        },
      ]),
      buildRagContext: vi.fn().mockReturnValue({
        items: [
          {
            documentSlug: 'bench-press-safety',
            documentTitle: 'Bench Press Safety',
            category: 'fitness',
            chunkIndex: 0,
            content: 'Keep shoulder blades retracted throughout the movement.',
            citation: 'Bench Press Safety (Chunk 0)',
            similarity: 0.85,
            rrfScore: 0.03,
          },
        ],
        citations: [],
        formattedPromptSection: '',
        totalTokens: 40,
      }),
    } as unknown as KnowledgeService;
  });

  it('assembles full context for an exercise query', async () => {
    const assembler = new CoachContextAssembler({
      userContextRepo: mockUserContextRepo,
      conversationRepo: mockConversationRepo,
      memoryRepo: mockMemoryRepo,
      knowledgeService: mockKnowledgeService,
    });

    const assembled = await assembler.assemble({
      userId: USER_ID,
      message: 'Can I do bench press with shoulder impingement?',
    });

    expect(assembled.intent).toBe('exercise_coaching');
    expect(assembled.memories).toHaveLength(1);
    expect(assembled.knowledge).toHaveLength(1);
    expect(mockKnowledgeService.searchHybrid).toHaveBeenCalled();
    expect(assembled.tokenStats.totalPromptTokens).toBeGreaterThan(0);
  });

  it('skips RAG and memories for a greeting query to conserve tokens and I/O', async () => {
    const assembler = new CoachContextAssembler({
      userContextRepo: mockUserContextRepo,
      conversationRepo: mockConversationRepo,
      memoryRepo: mockMemoryRepo,
      knowledgeService: mockKnowledgeService,
    });

    const assembled = await assembler.assemble({
      userId: USER_ID,
      message: 'Hi coach, good morning!',
    });

    expect(assembled.intent).toBe('greeting');
    expect(assembled.knowledge).toHaveLength(0);
    expect(assembled.memories).toHaveLength(0);
    expect(mockKnowledgeService.searchHybrid).not.toHaveBeenCalled();
    expect(mockMemoryRepo.getActiveMemoriesForContext).not.toHaveBeenCalled();
  });

  it('budgets client-provided history when supplied', async () => {
    const assembler = new CoachContextAssembler({
      userContextRepo: mockUserContextRepo,
      conversationRepo: mockConversationRepo,
      memoryRepo: mockMemoryRepo,
    });

    const clientHistory = [
      { role: 'user' as const, text: 'Old question' },
      { role: 'assistant' as const, text: 'Old answer' },
      { role: 'user' as const, text: 'Recent question' },
      { role: 'assistant' as const, text: 'Recent answer' },
    ];

    const assembled = await assembler.assemble({
      userId: USER_ID,
      message: 'What next?',
      clientHistory,
    });

    expect(assembled.history.length).toBeGreaterThan(0);
    expect(mockConversationRepo.getMessages).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageMemoriesUseCase } from '../../../src/modules/coach/application/use-cases/manage-memories.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type {
  ConversationRepository,
  GeminiService,
  MemoryRepository,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import type { MemoryItem } from '../../../src/modules/coach/domain/coach-memory.types.js';
import { allowAllAiUsageGate } from '../../helpers/ai-usage-gate.js';

describe('AI Coach Memory Use Case', () => {
  let mockMemoryRepo: MemoryRepository;
  let useCase: ManageMemoriesUseCase;

  const sampleMemory: MemoryItem = {
    id: 'mem-1',
    category: 'food',
    text: 'Eggetarian — eats eggs and dairy, no meat or fish.',
    source: 'Onboarding',
    sensitive: false,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleSuggestion: MemoryItem = {
    id: 'sug-1',
    category: 'workout',
    text: 'Prefers barbell compounds over machines.',
    source: 'Chat · Yesterday',
    sensitive: false,
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockMemoryRepo = {
      listMemories: vi.fn().mockResolvedValue({
        enabled: true,
        items: [sampleMemory],
        suggestions: [sampleSuggestion],
      }),
      getMemory: vi.fn().mockResolvedValue(sampleMemory),
      createMemory: vi.fn().mockResolvedValue(sampleMemory),
      updateMemory: vi.fn().mockResolvedValue({ ...sampleMemory, text: 'Updated memory text' }),
      deleteMemory: vi.fn().mockResolvedValue(true),
      updateMemoryStatus: vi.fn().mockResolvedValue({ ...sampleSuggestion, status: 'active' }),
      clearAll: vi.fn().mockResolvedValue(undefined),
      isMemoryEnabled: vi.fn().mockResolvedValue(true),
      setMemoryEnabled: vi.fn().mockResolvedValue(undefined),
      getActiveMemoriesForContext: vi.fn().mockResolvedValue([
        '[FOOD]: Eggetarian — eats eggs and dairy, no meat or fish.',
      ]),
    };
    useCase = new ManageMemoriesUseCase(mockMemoryRepo);
  });

  it('lists approved memories and pending suggestions', async () => {
    const res = await useCase.list('user-1');
    expect(res.enabled).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.suggestions).toHaveLength(1);
  });

  it('creates an approved memory item', async () => {
    const created = await useCase.create('user-1', {
      category: 'workout',
      text: 'Works out in the early morning at 6 AM',
      source: 'Chat',
    });
    expect(created.id).toBe('mem-1');
    expect(mockMemoryRepo.createMemory).toHaveBeenCalledWith('user-1', {
      category: 'workout',
      text: 'Works out in the early morning at 6 AM',
      source: 'Chat',
    });
  });

  it('updates memory text', async () => {
    const updated = await useCase.update('user-1', 'mem-1', 'Updated memory text');
    expect(updated.text).toBe('Updated memory text');
    expect(mockMemoryRepo.updateMemory).toHaveBeenCalledWith('user-1', 'mem-1', 'Updated memory text');
  });

  it('deletes a memory item', async () => {
    await useCase.delete('user-1', 'mem-1');
    expect(mockMemoryRepo.deleteMemory).toHaveBeenCalledWith('user-1', 'mem-1');
  });

  it('approves a pending suggestion', async () => {
    const approved = await useCase.approveSuggestion('user-1', 'sug-1');
    expect(approved.status).toBe('active');
    expect(mockMemoryRepo.updateMemoryStatus).toHaveBeenCalledWith('user-1', 'sug-1', 'active');
  });

  it('dismisses a suggestion', async () => {
    await useCase.dismissSuggestion('user-1', 'sug-1');
    expect(mockMemoryRepo.deleteMemory).toHaveBeenCalledWith('user-1', 'sug-1');
  });

  it('clears all user memories', async () => {
    await useCase.clearAll('user-1');
    expect(mockMemoryRepo.clearAll).toHaveBeenCalledWith('user-1');
  });

  it('toggles memory enabled/disabled', async () => {
    const result = await useCase.setMemoryEnabled('user-1', false);
    expect(result.enabled).toBe(false);
    expect(mockMemoryRepo.setMemoryEnabled).toHaveBeenCalledWith('user-1', false);
  });

  it('injects active memories into coach prompt when memory is enabled', async () => {
    const mockUserContextRepo: UserContextRepository = {
      getUserFitnessContext: vi.fn().mockResolvedValue({
        profile: { displayName: 'John' },
        todayNutrition: { caloriesConsumed: 2000, proteinGrams: 150 },
        recentWorkouts: [],
        todayPlannedWorkout: null,
        activeGoals: [],
        latestWeightKg: 75,
      } as unknown as UserFitnessContext),
    };

    const mockGeminiService: GeminiService = {
      generateCoachResponse: vi.fn().mockResolvedValue({
        text: 'Since you are eggetarian, here are some high-protein egg recipes.',
        sources: ['Profile', 'AI Memory'],
      }),
      generateInsights: vi.fn(),
    };

    const mockConvoRepo: ConversationRepository = {
      createConversation: vi.fn().mockResolvedValue({
        id: 'c-1',
        title: 'Dinner ideas',
        preview: 'Eggs',
        createdAt: '',
        updatedAt: '',
      }),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      addMessage: vi.fn(),
      getMessages: vi.fn().mockResolvedValue([]),
    };

    const chatUseCase = new ChatWithCoachUseCase(
      mockUserContextRepo,
      mockGeminiService,
      allowAllAiUsageGate(),
      mockConvoRepo,
      mockMemoryRepo,
    );

    const response = await chatUseCase.execute({
      userId: 'user-1',
      message: 'What should I eat for dinner?',
    });

    expect(mockMemoryRepo.getActiveMemoriesForContext).toHaveBeenCalledWith('user-1');
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'What should I eat for dinner?',
      expect.anything(),
      undefined,
      ['[FOOD]: Eggetarian — eats eggs and dairy, no meat or fish.'],
    );
    expect(response.sources).toContain('AI Memory');
  });
});

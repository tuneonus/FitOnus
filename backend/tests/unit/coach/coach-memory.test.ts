import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageMemoriesUseCase } from '../../../src/modules/coach/application/use-cases/manage-memories.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import { PgMemoryRepository } from '../../../src/modules/coach/infrastructure/pg-memory-repository.js';
import type { Database } from '../../../src/database/transaction.js';
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
      dismissSuggestion: vi.fn().mockResolvedValue(true),
      clearAll: vi.fn().mockResolvedValue(undefined),
      isMemoryEnabled: vi.fn().mockResolvedValue(true),
      setMemoryEnabled: vi.fn().mockResolvedValue(undefined),
      getActiveMemoriesForContext: vi
        .fn()
        .mockResolvedValue(['[FOOD]: Eggetarian — eats eggs and dairy, no meat or fish.']),
      getDismissedTexts: vi.fn().mockResolvedValue([]),
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

  it('dismisses a suggestion by updating status to dismissed', async () => {
    await useCase.dismissSuggestion('user-1', 'sug-1');
    expect(mockMemoryRepo.dismissSuggestion).toHaveBeenCalledWith('user-1', 'sug-1');
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
      setMessageFeedback: vi.fn().mockResolvedValue(true),
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

    expect(mockMemoryRepo.getActiveMemoriesForContext).toHaveBeenCalledWith(
      'user-1',
      'What should I eat for dinner?',
    );
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'What should I eat for dinner?',
      expect.anything(),
      undefined,
      ['[FOOD]: Eggetarian — eats eggs and dairy, no meat or fish.'],
    );
    expect(response.sources).toContain('AI Memory');
  });

  it('PgMemoryRepository enforces strict opt-in consent logic', async () => {
    const mockQuery = vi.fn();
    const mockDb = { query: mockQuery } as unknown as Database;
    const repo = new PgMemoryRepository(mockDb);

    // 1. Missing settings row -> false
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repo.isMemoryEnabled('user-no-settings')).toBe(false);

    // 2. ai_memory_enabled is true but ai_memory_consented_at is null -> false (silent consent denied)
    mockQuery.mockResolvedValueOnce({ rows: [{ ai_memory_enabled: true, ai_memory_consented_at: null }] });
    expect(await repo.isMemoryEnabled('user-unconsented')).toBe(false);

    // 3. ai_memory_enabled is false -> false
    mockQuery.mockResolvedValueOnce({
      rows: [{ ai_memory_enabled: false, ai_memory_consented_at: new Date() }],
    });
    expect(await repo.isMemoryEnabled('user-disabled')).toBe(false);

    // 4. ai_memory_enabled is true AND consented_at is present -> true
    mockQuery.mockResolvedValueOnce({
      rows: [{ ai_memory_enabled: true, ai_memory_consented_at: new Date() }],
    });
    expect(await repo.isMemoryEnabled('user-opted-in')).toBe(true);
  });

  it('PgMemoryRepository creates sensitive injury memory with pending_approval safety default', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'mem-injury',
          category: 'injuries',
          text: 'Left shoulder impingement',
          source: 'Chat',
          sensitive: true,
          status: 'pending_approval',
          confidence: '0.95',
          source_message_id: null,
          source_conversation_id: null,
          expires_at: null,
          superseded_by_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const mockDb = { query: mockQuery } as unknown as Database;
    const repo = new PgMemoryRepository(mockDb);

    const memory = await repo.createMemory('user-1', {
      category: 'injuries',
      text: 'Left shoulder impingement',
      source: 'Chat',
    });

    expect(memory.sensitive).toBe(true);
    expect(memory.status).toBe('pending_approval');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO coach_memories');
  });

  it('getActiveMemoriesForContext returns empty array if memory is disabled', async () => {
    const mockQuery = vi.fn();
    const mockDb = { query: mockQuery } as unknown as Database;
    const repo = new PgMemoryRepository(mockDb);

    // user_settings says false
    mockQuery.mockResolvedValueOnce({
      rows: [{ ai_memory_enabled: false, ai_memory_consented_at: new Date() }],
    });

    const result = await repo.getActiveMemoriesForContext('user-1', 'What should I eat?');
    expect(result).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('getActiveMemoriesForContext prioritizes injuries on workout query, strips newlines, and caps at max 5 items', async () => {
    const mockQuery = vi.fn();
    const mockDb = { query: mockQuery } as unknown as Database;
    const repo = new PgMemoryRepository(mockDb);

    // 1. Consent query -> true
    mockQuery.mockResolvedValueOnce({
      rows: [{ ai_memory_enabled: true, ai_memory_consented_at: new Date() }],
    });

    // 2. Active memories query -> 7 rows
    mockQuery.mockResolvedValueOnce({
      rows: [
        { category: 'workout', text: 'Prefers dumbbells\nover barbells', updated_at: new Date() },
        { category: 'injuries', text: 'Torn left rotator cuff', updated_at: new Date() },
        { category: 'food', text: 'Vegetarian\r\nno eggs', updated_at: new Date() },
        { category: 'goals', text: 'Bench press 100kg', updated_at: new Date() },
        { category: 'supplements', text: '5g creatine', updated_at: new Date() },
        { category: 'workout', text: 'Cardio on Sundays', updated_at: new Date() },
        { category: 'conversations', text: 'Keep replies brief', updated_at: new Date() },
      ],
    });

    const result = await repo.getActiveMemoriesForContext(
      'user-1',
      'Can I do heavy bench press with my shoulder pain?',
    );

    // Should prioritize injury first (score +10 + keyword overlap)
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result[0]).toContain('[INJURIES]: Torn left rotator cuff');
    // Check that newlines were stripped
    const dumbbellMem = result.find((m) => m.includes('dumbbells'));
    if (dumbbellMem) {
      expect(dumbbellMem).not.toContain('\n');
      expect(dumbbellMem).toContain('Prefers dumbbells over barbells');
    }
  });
});

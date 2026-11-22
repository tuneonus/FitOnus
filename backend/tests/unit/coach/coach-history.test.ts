import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageConversationsUseCase } from '../../../src/modules/coach/application/use-cases/manage-conversations.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import { PgConversationRepository } from '../../../src/modules/coach/infrastructure/pg-conversation-repository.js';
import type { Database } from '../../../src/database/transaction.js';
import type { ConversationRepository, GeminiService, UserContextRepository } from '../../../src/modules/coach/application/ports.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { allowAllAiUsageGate } from '../../helpers/ai-usage-gate.js';

describe('AI Coach Conversation History Use Case', () => {
  let mockConvoRepo: ConversationRepository;
  let useCase: ManageConversationsUseCase;

  const sampleSummary = {
    id: 'convo-1',
    title: 'Morning workout review',
    preview: 'Great job completing your morning session!',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockConvoRepo = {
      createConversation: vi.fn().mockResolvedValue(sampleSummary),
      listConversations: vi.fn().mockResolvedValue({
        conversations: [sampleSummary],
        total: 1,
      }),
      getConversation: vi.fn().mockResolvedValue({
        ...sampleSummary,
        messages: [
          {
            id: 'msg-1',
            conversationId: 'convo-1',
            role: 'user',
            text: 'How was my workout?',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'msg-2',
            conversationId: 'convo-1',
            role: 'assistant',
            text: 'Great job completing your morning session!',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
      updateConversation: vi.fn().mockResolvedValue({
        ...sampleSummary,
        title: 'Updated title',
      }),
      deleteConversation: vi.fn().mockResolvedValue(true),
      addMessage: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue([]),
      setMessageFeedback: vi.fn().mockResolvedValue(true),
    };
    useCase = new ManageConversationsUseCase(mockConvoRepo);
  });

  it('lists previous conversations with pagination', async () => {
    const result = await useCase.list('user-1', 1, 20);
    expect(result.conversations).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(mockConvoRepo.listConversations).toHaveBeenCalledWith('user-1', 20, 0);
  });

  it('retrieves an existing conversation with its messages', async () => {
    const convo = await useCase.get('user-1', 'convo-1');
    expect(convo.id).toBe('convo-1');
    expect(convo.messages).toHaveLength(2);
    expect(convo.messages[0]!.role).toBe('user');
  });

  it('throws 404 when conversation not found or belongs to another user', async () => {
    vi.mocked(mockConvoRepo.getConversation).mockResolvedValueOnce(null);
    await expect(useCase.get('user-2', 'convo-1')).rejects.toThrow('Conversation not found');
  });

  it('renames a conversation successfully', async () => {
    const renamed = await useCase.rename('user-1', 'convo-1', 'Updated title');
    expect(renamed.title).toBe('Updated title');
    expect(mockConvoRepo.updateConversation).toHaveBeenCalledWith('user-1', 'convo-1', {
      title: 'Updated title',
    });
  });

  it('deletes a conversation successfully', async () => {
    await useCase.delete('user-1', 'convo-1');
    expect(mockConvoRepo.deleteConversation).toHaveBeenCalledWith('user-1', 'convo-1');
  });

  it('persists user message and assistant reply during chat session', async () => {
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
        text: 'Drink some water and rest well.',
        sources: ['Profile'],
        followUps: ['Need a recovery plan?'],
      }),
      generateInsights: vi.fn(),
    };

    const chatUseCase = new ChatWithCoachUseCase(
      mockUserContextRepo,
      mockGeminiService,
      allowAllAiUsageGate(),
      mockConvoRepo,
    );

    const response = await chatUseCase.execute({
      userId: 'user-1',
      message: 'I finished my workout',
      conversationId: 'convo-1',
      clientMessageId: 'client-msg-1',
    });

    expect(response.text).toBe('Drink some water and rest well.');
    expect(response.conversationId).toBe('convo-1');

    // Verify user message persisted
    expect(mockConvoRepo.addMessage).toHaveBeenCalledWith(
      'user-1',
      'convo-1',
      expect.objectContaining({
        id: 'client-msg-1',
        role: 'user',
        text: 'I finished my workout',
      }),
    );

    // Verify assistant reply persisted
    expect(mockConvoRepo.addMessage).toHaveBeenCalledWith(
      'user-1',
      'convo-1',
      expect.objectContaining({
        role: 'assistant',
        text: 'Drink some water and rest well.',
      }),
    );
  });

  it('PgConversationRepository executes CTE query fetching newest messages with deterministic tie-breaking', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'msg-10',
          conversation_id: 'convo-1',
          role: 'user',
          text: 'Recent question',
          blocks: [],
          sources: [],
          follow_ups: [],
          feedback: null,
          created_at: new Date('2026-11-22T10:00:00Z'),
        },
        {
          id: 'msg-11',
          conversation_id: 'convo-1',
          role: 'assistant',
          text: 'Recent answer',
          blocks: [],
          sources: [],
          follow_ups: [],
          feedback: null,
          created_at: new Date('2026-11-22T10:01:00Z'),
        },
      ],
      rowCount: 2,
    });
    const mockDb = { query: mockQuery } as unknown as Database;
    const repo = new PgConversationRepository(mockDb);

    const messages = await repo.getMessages('user-1', 'convo-1', 8);

    expect(messages).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    const params = mockQuery.mock.calls[0]![1] as unknown[];

    // Must use CTE subquery with ORDER BY created_at DESC, id DESC LIMIT $3
    expect(sql).toContain('WITH recent_messages AS');
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(sql).toContain('LIMIT $3');
    // Must re-order outer query by created_at ASC, id ASC for chronological dialogue delivery
    expect(sql).toContain('ORDER BY created_at ASC, id ASC');
    expect(params).toEqual(['convo-1', 'user-1', 8]);
  });

  it('resolves conversation history using newest messages within token budget', async () => {
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
        text: 'Drink water!',
        sources: ['Profile'],
        followUps: [],
      }),
      generateInsights: vi.fn(),
    };

    // Return 12 messages in chronological order (m1 to m12)
    const mockMessages = Array.from({ length: 12 }, (_, i) => ({
      id: `msg-${i + 1}`,
      conversationId: 'convo-1',
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `Message turn ${i + 1} with context`,
      blocks: [],
      sources: [],
      followUps: [],
      createdAt: new Date(Date.now() + i * 1000).toISOString(),
    }));

    vi.mocked(mockConvoRepo.getMessages).mockResolvedValueOnce(mockMessages);

    const chatUseCase = new ChatWithCoachUseCase(
      mockUserContextRepo,
      mockGeminiService,
      allowAllAiUsageGate(),
      mockConvoRepo,
    );

    await chatUseCase.execute({
      userId: 'user-1',
      message: 'What should I do next?',
      conversationId: 'convo-1',
      clientMessageId: 'new-client-msg',
    });

    expect(mockConvoRepo.getMessages).toHaveBeenCalledWith('user-1', 'convo-1', 15);
    // Gemini should be invoked with the newest eligible turns
    expect(mockGeminiService.generateCoachResponse).toHaveBeenCalledWith(
      'What should I do next?',
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Message turn 12 with context' }),
      ]),
    );
  });
});


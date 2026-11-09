import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageConversationsUseCase } from '../../../src/modules/coach/application/use-cases/manage-conversations.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { ConversationRepository, GeminiService, UserContextRepository } from '../../../src/modules/coach/application/ports.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';

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
});


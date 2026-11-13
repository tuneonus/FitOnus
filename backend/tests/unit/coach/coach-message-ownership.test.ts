import { describe, expect, it, vi } from 'vitest';
import type {
  ConversationRepository,
  GeminiService,
  UserContextRepository,
} from '../../../src/modules/coach/application/ports.js';
import { ChatWithCoachUseCase } from '../../../src/modules/coach/application/use-cases/chat-with-coach.js';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import type { StoredChatMessage } from '../../../src/modules/coach/domain/coach-history.types.js';
import { conflict, notFound } from '../../../src/shared/errors/app-error.js';
import { allowAllAiUsageGate } from '../../helpers/ai-usage-gate.js';

/**
 * Use-case policy around message-ID collisions. The SQL guarantee itself (never overwrite another
 * user's row) is proven against real PostgreSQL in tests/integration/repositories/coach-messages.test.ts.
 */
describe('ChatWithCoachUseCase message ID handling', () => {
  const summary = {
    id: 'convo-1',
    title: 't',
    preview: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function setup(addMessage: ConversationRepository['addMessage']) {
    const repo: ConversationRepository = {
      createConversation: vi.fn().mockResolvedValue(summary),
      listConversations: vi.fn(),
      getConversation: vi.fn().mockResolvedValue({ ...summary, messages: [] }),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      addMessage,
      getMessages: vi.fn().mockResolvedValue([]),
    };
    const gemini: GeminiService = {
      generateCoachResponse: vi.fn().mockResolvedValue({ text: 'answer' }),
      generateInsights: vi.fn(),
    };
    const context: UserContextRepository = {
      getUserFitnessContext: vi.fn().mockResolvedValue({} as UserFitnessContext),
    };
    return {
      repo,
      gemini,
      useCase: new ChatWithCoachUseCase(context, gemini, allowAllAiUsageGate(), repo),
    };
  }

  it('stores the user message under the client ID when it is free', async () => {
    const stored: StoredChatMessage[] = [];
    const { useCase } = setup(async (_u, _c, m) => void stored.push(m));

    await useCase.execute({ userId: 'u1', message: 'hi', conversationId: 'convo-1', clientMessageId: 'client-1' });

    expect(stored.filter((m) => m.role === 'user').map((m) => m.id)).toEqual(['client-1']);
  });

  it('falls back to a server-generated ID when the client ID belongs to someone else, and still answers', async () => {
    const stored: StoredChatMessage[] = [];
    const { useCase, gemini } = setup(async (_u, _c, m) => {
      if (m.id === 'taken') throw conflict('CONFLICT', 'This message ID is already in use.');
      stored.push(m);
    });

    const result = await useCase.execute({
      userId: 'u1',
      message: 'hi',
      conversationId: 'convo-1',
      clientMessageId: 'taken',
    });

    expect(result).toMatchObject({ text: 'answer', conversationId: 'convo-1' });
    expect(gemini.generateCoachResponse).toHaveBeenCalledTimes(1);
    const user = stored.find((m) => m.role === 'user')!;
    expect(user.id).toMatch(/^msg-[0-9a-f-]{36}$/);
    expect(user.id).not.toBe('taken');
    expect(user.text).toBe('hi');
  });

  it('does not swallow other persistence failures (the request fails, nothing is retried under a new ID)', async () => {
    const addMessage = vi.fn().mockRejectedValue(notFound('NOT_FOUND', 'Conversation not found.'));
    const { useCase, gemini } = setup(addMessage);

    await expect(
      useCase.execute({ userId: 'u1', message: 'hi', conversationId: 'convo-1', clientMessageId: 'x' }),
    ).rejects.toMatchObject({ kind: 'not_found' });

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(gemini.generateCoachResponse).not.toHaveBeenCalled();

    const failing = setup(vi.fn().mockRejectedValue(new Error('connection reset')));
    await expect(
      failing.useCase.execute({ userId: 'u1', message: 'hi', clientMessageId: 'x' }),
    ).rejects.toThrow('connection reset');
  });

  it('gives up cleanly if even the fallback ID is refused (no loop)', async () => {
    const addMessage = vi.fn().mockRejectedValue(conflict('CONFLICT', 'This message ID is already in use.'));
    const { useCase } = setup(addMessage);

    await expect(useCase.execute({ userId: 'u1', message: 'hi', clientMessageId: 'x' })).rejects.toMatchObject({
      kind: 'conflict',
    });
    expect(addMessage).toHaveBeenCalledTimes(2);
  });

  it('generates collision-free server IDs even when the clock returns the same millisecond', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    try {
      const ids: string[] = [];
      const { useCase } = setup(async (_u, _c, m) => void ids.push(m.id));

      await useCase.execute({ userId: 'u1', message: 'one' });
      await useCase.execute({ userId: 'u2', message: 'two' });

      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      expect(ids.every((id) => id.startsWith('msg-'))).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('does not feed the just-stored user message back to the model as history, even under a fallback ID', async () => {
    const stored: StoredChatMessage[] = [];
    const { useCase, repo, gemini } = setup(async (_u, _c, m) => {
      if (m.id === 'taken') throw conflict('CONFLICT', 'This message ID is already in use.');
      stored.push(m);
    });
    vi.mocked(repo.getMessages).mockImplementation(async () => [
      { id: 'old', conversationId: 'convo-1', role: 'assistant', text: 'earlier', createdAt: '' },
      ...stored.map((m) => ({ ...m, createdAt: '' })),
    ]);

    await useCase.execute({ userId: 'u1', message: 'hi', conversationId: 'convo-1', clientMessageId: 'taken' });

    expect(vi.mocked(gemini.generateCoachResponse).mock.calls[0]![2]).toEqual([
      { role: 'assistant', text: 'earlier' },
    ]);
  });
});

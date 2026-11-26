import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryExtractionWorker } from '../../../src/modules/coach/application/services/memory-extraction-worker.js';
import type {
  ConversationRepository,
  MemoryExtractionJobQueue,
  MemoryExtractor,
  MemoryRepository,
} from '../../../src/modules/coach/application/ports.js';
import type { MemoryExtractionJob } from '../../../src/modules/coach/domain/extraction-job.types.js';

describe('MemoryExtractionWorker', () => {
  let mockQueue: MemoryExtractionJobQueue;
  let mockMemoryRepo: MemoryRepository;
  let mockConvoRepo: ConversationRepository;
  let mockExtractor: MemoryExtractor;
  let worker: MemoryExtractionWorker;

  const sampleJob: MemoryExtractionJob = {
    id: 'job-123',
    userId: 'user-1',
    conversationId: 'convo-1',
    messageId: 'msg-1',
    status: 'processing',
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockQueue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      claimDue: vi.fn().mockResolvedValue([sampleJob]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      cancelForUser: vi.fn().mockResolvedValue(undefined),
      isJobCancelled: vi.fn().mockResolvedValue(false),
      pruneOldJobs: vi.fn().mockResolvedValue(0),
    };

    mockMemoryRepo = {
      listMemories: vi.fn(),
      getMemory: vi.fn(),
      createMemory: vi.fn().mockResolvedValue({ id: 'mem-created' }),
      updateMemory: vi.fn(),
      deleteMemory: vi.fn(),
      updateMemoryStatus: vi.fn(),
      dismissSuggestion: vi.fn(),
      clearAll: vi.fn(),
      isMemoryEnabled: vi.fn().mockResolvedValue(true),
      setMemoryEnabled: vi.fn(),
      getActiveMemoriesForContext: vi.fn().mockResolvedValue(['[FOOD]: Likes oats']),
      getDismissedTexts: vi.fn().mockResolvedValue(['Hates broccoli']),
    };

    mockConvoRepo = {
      createConversation: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      addMessage: vi.fn(),
      getMessages: vi
        .fn()
        .mockResolvedValue([
          { id: 'msg-1', role: 'user', text: 'I am allergic to peanuts and want to bench 100kg.' },
        ]),
      setMessageFeedback: vi.fn(),
    };

    mockExtractor = {
      extract: vi.fn().mockResolvedValue([
        {
          category: 'food',
          text: 'Allergic to peanuts',
          confidence: 0.95,
          sensitive: true,
          sourceQuote: 'I am allergic to peanuts',
        },
        {
          category: 'goals',
          text: 'Goal is to bench press 100kg',
          confidence: 0.9,
          sensitive: false,
          sourceQuote: 'want to bench 100kg',
        },
      ]),
    };

    worker = new MemoryExtractionWorker({
      queue: mockQueue,
      memoryRepo: mockMemoryRepo,
      conversationRepo: mockConvoRepo,
      extractor: mockExtractor,
    });
  });

  it('processes due jobs and creates pending suggestions', async () => {
    const processed = await worker.processBatch(5, 60);

    expect(processed).toBe(1);
    expect(mockQueue.claimDue).toHaveBeenCalledWith(5, 60);
    expect(mockExtractor.extract).toHaveBeenCalledWith(
      'user-1',
      [{ role: 'user', text: 'I am allergic to peanuts and want to bench 100kg.' }],
      ['[FOOD]: Likes oats', 'Hates broccoli'],
    );

    // Rejects sensitive candidates before persistence and creates valid preferences strictly as pending_approval
    expect(mockMemoryRepo.createMemory).toHaveBeenCalledTimes(1);
    expect(mockMemoryRepo.createMemory).toHaveBeenCalledWith('user-1', {
      category: 'goals',
      text: 'Goal is to bench press 100kg',
      source: 'Conversation',
      sensitive: false,
      status: 'pending_approval',
      confidence: 0.9,
      sourceMessageId: 'msg-1',
      sourceConversationId: 'convo-1',
    });

    expect(mockQueue.complete).toHaveBeenCalledWith('job-123');
  });

  it('skips job if user revoked memory consent prior to extraction', async () => {
    vi.mocked(mockMemoryRepo.isMemoryEnabled).mockResolvedValueOnce(false);

    const processed = await worker.processBatch();

    expect(processed).toBe(1);
    expect(mockExtractor.extract).not.toHaveBeenCalled();
    expect(mockMemoryRepo.createMemory).not.toHaveBeenCalled();
    expect(mockQueue.complete).toHaveBeenCalledWith('job-123');
  });

  it('drops candidate if user revoked memory consent while extraction was running', async () => {
    // 1st check: true, 2nd check (after extract): false
    vi.mocked(mockMemoryRepo.isMemoryEnabled).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const processed = await worker.processBatch();

    expect(processed).toBe(1);
    expect(mockExtractor.extract).toHaveBeenCalled();
    expect(mockMemoryRepo.createMemory).not.toHaveBeenCalled();
    expect(mockQueue.complete).toHaveBeenCalledWith('job-123');
  });

  it('deduplicates candidate against existing active or dismissed memories', async () => {
    vi.mocked(mockExtractor.extract).mockResolvedValueOnce([
      {
        category: 'food',
        text: 'Likes oats for breakfast', // Overlaps with '[FOOD]: Likes oats'
        confidence: 0.9,
        sensitive: false,
        sourceQuote: 'I like oats',
      },
    ]);

    await worker.processBatch();

    // Duplicate candidate must not be created
    expect(mockMemoryRepo.createMemory).not.toHaveBeenCalled();
    expect(mockQueue.complete).toHaveBeenCalledWith('job-123');
  });

  it('marks job as failed and increments attempts when extractor throws', async () => {
    vi.mocked(mockExtractor.extract).mockRejectedValueOnce(new Error('FastAPI connection timeout'));

    const processed = await worker.processBatch();

    expect(processed).toBe(0);
    expect(mockQueue.fail).toHaveBeenCalledWith('job-123', 'FastAPI connection timeout');
    expect(mockQueue.complete).not.toHaveBeenCalled();
  });
});

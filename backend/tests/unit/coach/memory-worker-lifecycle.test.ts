import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryExtractionWorker } from '../../../src/modules/coach/application/services/memory-extraction-worker.js';
import type {
  ConversationRepository,
  MemoryExtractionJobQueue,
  MemoryExtractor,
  MemoryRepository,
} from '../../../src/modules/coach/application/ports.js';
import type { MemoryExtractionJob } from '../../../src/modules/coach/domain/extraction-job.types.js';

describe('MemoryExtractionWorker Lifecycle & Background Execution', () => {
  let mockQueue: MemoryExtractionJobQueue;
  let mockMemoryRepo: MemoryRepository;
  let mockConvoRepo: ConversationRepository;
  let mockExtractor: MemoryExtractor;

  beforeEach(() => {
    vi.useFakeTimers();

    mockQueue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      claimDue: vi.fn().mockResolvedValue([]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
      cancelForUser: vi.fn().mockResolvedValue(undefined),
      isJobCancelled: vi.fn().mockResolvedValue(false),
      pruneOldJobs: vi.fn().mockResolvedValue(0),
    };

    mockMemoryRepo = {
      listMemories: vi.fn(),
      getMemory: vi.fn(),
      createMemory: vi.fn().mockResolvedValue({ id: 'mem-1' }),
      updateMemory: vi.fn(),
      deleteMemory: vi.fn(),
      updateMemoryStatus: vi.fn(),
      dismissSuggestion: vi.fn(),
      clearAll: vi.fn(),
      isMemoryEnabled: vi.fn().mockResolvedValue(true),
      setMemoryEnabled: vi.fn(),
      getActiveMemoriesForContext: vi.fn().mockResolvedValue([]),
      getDismissedTexts: vi.fn().mockResolvedValue([]),
    };

    mockConvoRepo = {
      createConversation: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      addMessage: vi.fn(),
      getMessages: vi.fn().mockResolvedValue([
        { id: 'msg-1', role: 'user', text: 'I prefer morning workouts.' },
      ]),
      setMessageFeedback: vi.fn(),
    };

    mockExtractor = {
      extract: vi.fn().mockResolvedValue([
        {
          category: 'workout',
          text: 'Prefers morning workouts',
          confidence: 0.95,
          sensitive: false,
          sourceQuote: 'morning workouts',
        },
      ]),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Worker Startup, Scheduling & Graceful Shutdown', () => {
    it('starts periodic polling on start() and executes kick() on interval', async () => {
      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
        intervalMs: 10_000,
      });

      const drainSpy = vi.spyOn(worker, 'drain');

      worker.start();
      expect(drainSpy).toHaveBeenCalledTimes(1);

      // Advance by 1 interval (10s)
      await vi.advanceTimersByTimeAsync(10_000);
      expect(drainSpy).toHaveBeenCalledTimes(2);

      // Advance by another interval (10s)
      await vi.advanceTimersByTimeAsync(10_000);
      expect(drainSpy).toHaveBeenCalledTimes(3);

      await worker.stop();

      // Advancing timer after stop should not trigger drain
      await vi.advanceTimersByTimeAsync(20_000);
      expect(drainSpy).toHaveBeenCalledTimes(3);
    });

    it('calling start() multiple times is safe and maintains single timer', async () => {
      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
        intervalMs: 10_000,
      });

      const drainSpy = vi.spyOn(worker, 'drain');

      worker.start();
      worker.start();
      worker.start();

      expect(drainSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(drainSpy).toHaveBeenCalledTimes(2);

      await worker.stop();
    });

    it('gracefully awaits in-flight drain when stop() is called', async () => {
      let resolveExtraction: (val: any) => void = () => {};
      const extractionPromise = new Promise((res) => {
        resolveExtraction = res;
      });

      vi.mocked(mockExtractor.extract).mockReturnValueOnce(extractionPromise as any);

      const sampleJob: MemoryExtractionJob = {
        id: 'job-inflight-1',
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

      vi.mocked(mockQueue.claimDue).mockResolvedValueOnce([sampleJob]);

      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
      });

      // Kick off processing
      const drainPromise = worker.drain();

      // While in-flight, initiate stop()
      let stopResolved = false;
      const stopPromise = worker.stop().then(() => {
        stopResolved = true;
      });

      expect(stopResolved).toBe(false);

      // Complete extraction
      resolveExtraction([
        {
          category: 'workout',
          text: 'Prefers morning workouts',
          confidence: 0.95,
          sensitive: false,
          sourceQuote: 'morning workouts',
        },
      ]);

      await drainPromise;
      await stopPromise;

      expect(stopResolved).toBe(true);
      expect(mockQueue.complete).toHaveBeenCalledWith('job-inflight-1');
    });
  });

  describe('Concurrency & Re-entrancy Serialization', () => {
    it('serializes concurrent kick() requests with rerun flag', async () => {
      let finishFirstBatch: () => void = () => {};
      const firstBatchPromise = new Promise<void>((res) => {
        finishFirstBatch = res;
      });

      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
      });

      const processBatchSpy = vi.spyOn(worker, 'processBatch').mockImplementation(async () => {
        await firstBatchPromise;
        return 0;
      });

      // Kick 1
      worker.kick();
      // Kick 2 while Kick 1 is in-flight
      worker.kick();

      expect(processBatchSpy).toHaveBeenCalledTimes(1);

      // Resolve first batch
      finishFirstBatch();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1);

      // Rerun kicked the second pass
      expect(processBatchSpy).toHaveBeenCalledTimes(2);

      await worker.stop();
    });
  });

  describe('In-Flight Cancellation Safety (Clear All & Revocation)', () => {
    it('discards extracted candidates when job is marked cancelled in-flight', async () => {
      const sampleJob: MemoryExtractionJob = {
        id: 'job-cancelled-1',
        userId: 'user-cancel-1',
        conversationId: 'convo-cancel-1',
        messageId: 'msg-cancel-1',
        status: 'processing',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(),
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockQueue.claimDue).mockResolvedValueOnce([sampleJob]);

      // Job is cancelled in database during extraction (e.g. by Clear All or Revocation)
      vi.mocked(mockQueue.isJobCancelled).mockResolvedValueOnce(true);

      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
      });

      const processed = await worker.processBatch(1, 60);

      expect(processed).toBe(1);
      // Extraction ran
      expect(mockExtractor.extract).toHaveBeenCalled();
      // BUT results were discarded because job was cancelled!
      expect(mockMemoryRepo.createMemory).not.toHaveBeenCalled();
      // Job completed without resurrecting deleted memories
      expect(mockQueue.complete).toHaveBeenCalledWith('job-cancelled-1');
    });
  });

  describe('Error Sanitization and Safe Failure Handling', () => {
    it('sanitizes sensitive or private user text before calling queue.fail()', async () => {
      const sampleJob: MemoryExtractionJob = {
        id: 'job-err-1',
        userId: 'user-err-1',
        conversationId: 'convo-err-1',
        messageId: 'msg-err-1',
        status: 'processing',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(),
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockQueue.claimDue).mockResolvedValueOnce([sampleJob]);

      // Extractor throws an error containing raw user text and special characters
      const rawError = new Error(
        'Gemini error: user message contains private content <script>alert(1)</script> and "I take 50mg sertraline" at line 42',
      );
      vi.mocked(mockExtractor.extract).mockRejectedValueOnce(rawError);

      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
      });

      const processed = await worker.processBatch(1, 60);

      expect(processed).toBe(0);
      expect(mockQueue.fail).toHaveBeenCalledTimes(1);

      const failCallArgs = vi.mocked(mockQueue.fail).mock.calls[0];
      expect(failCallArgs).toBeDefined();
      expect(failCallArgs![0]).toBe('job-err-1');

      const loggedError = failCallArgs![1];
      // Sanitized: must NOT contain quotes or html angle brackets
      expect(loggedError).not.toContain('<script>');
      expect(loggedError).not.toContain('"');
      expect(loggedError).toBeDefined();
    });
  });
});

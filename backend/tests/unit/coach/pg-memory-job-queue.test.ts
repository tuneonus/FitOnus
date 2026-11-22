import { describe, it, expect, vi } from 'vitest';
import { PgMemoryExtractionJobQueue } from '../../../src/modules/coach/infrastructure/pg-memory-job-queue.js';
import type { Database } from '../../../src/database/transaction.js';

describe('PgMemoryExtractionJobQueue', () => {
  it('enqueues extraction job idempotently with ON CONFLICT DO NOTHING', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockDb = { query: mockQuery } as unknown as Database;
    const queue = new PgMemoryExtractionJobQueue(mockDb);

    await queue.enqueue('user-1', 'convo-1', 'msg-1');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    const params = mockQuery.mock.calls[0]![1] as unknown[];

    expect(sql).toContain('INSERT INTO ai_memory_extraction_jobs');
    expect(sql).toContain('ON CONFLICT (conversation_id, message_id) DO NOTHING');
    expect(params).toEqual(['user-1', 'convo-1', 'msg-1']);
  });

  it('claims due jobs using lease-based FOR UPDATE SKIP LOCKED query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'job-1',
          user_id: 'user-1',
          conversation_id: 'convo-1',
          message_id: 'msg-1',
          status: 'processing',
          attempts: 0,
          max_attempts: 3,
          next_attempt_at: new Date('2026-11-22T12:01:00Z'),
          last_error: null,
          created_at: new Date('2026-11-22T12:00:00Z'),
          updated_at: new Date('2026-11-22T12:00:00Z'),
        },
      ],
      rowCount: 1,
    });
    const mockDb = { query: mockQuery } as unknown as Database;
    const queue = new PgMemoryExtractionJobQueue(mockDb);

    const claimed = await queue.claimDue(5, 60);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.id).toBe('job-1');
    expect(claimed[0]!.status).toBe('processing');

    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('WITH due AS');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("SET status = 'processing'");
  });

  it('completes job by setting status to completed', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockDb = { query: mockQuery } as unknown as Database;
    const queue = new PgMemoryExtractionJobQueue(mockDb);

    await queue.complete('job-1');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("SET status = 'completed'");
    expect(mockQuery.mock.calls[0]![1]).toEqual(['job-1']);
  });

  it('fails job with exponential backoff and sets failed when attempts exceed max', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockDb = { query: mockQuery } as unknown as Database;
    const queue = new PgMemoryExtractionJobQueue(mockDb);

    await queue.fail('job-1', 'LLM unavailable');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('SET attempts = attempts + 1');
    expect(sql).toContain("status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END");
    expect(mockQuery.mock.calls[0]![1]).toEqual(['job-1', 'LLM unavailable']);
  });

  it('cancels all pending/processing/failed jobs for a user upon consent revocation', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 3 });
    const mockDb = { query: mockQuery } as unknown as Database;
    const queue = new PgMemoryExtractionJobQueue(mockDb);

    await queue.cancelForUser('user-1');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("SET status = 'cancelled'");
    expect(mockQuery.mock.calls[0]![1]).toEqual(['user-1']);
  });

  it('prunes completed and cancelled jobs older than specified retention days', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 15 });
    const mockDb = { query: mockQuery } as unknown as Database;
    const queue = new PgMemoryExtractionJobQueue(mockDb);

    const deleted = await queue.pruneOldJobs(7);

    expect(deleted).toBe(15);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("WHERE status IN ('completed', 'cancelled')");
    expect(mockQuery.mock.calls[0]![1]).toEqual([7]);
  });
});

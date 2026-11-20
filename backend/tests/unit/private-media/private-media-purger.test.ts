import { describe, expect, it, vi } from 'vitest';
import type { PrivateMediaDeletionQueue } from '../../../src/shared/private-media/deletion-queue.js';
import { PrivateMediaPurger } from '../../../src/shared/private-media/private-media-purger.js';
import { FakePrivateObjectStore } from '../../helpers/fake-private-store.js';

const OWNER = '3f2b8c1e-7d4a-4b6e-9a10-5c2d8e7f6a01';
const key = (n: number, thumb = false) =>
  `members/${OWNER}/progress/${n.toString(16).padStart(32, '0')}${thumb ? '.thumb' : ''}.webp`;

/** A queue held in memory, with the same contract as the PostgreSQL one (leases and failures). */
class MemoryQueue implements PrivateMediaDeletionQueue {
  readonly rows = new Map<string, { attempts: number; lastError: string | null; hidden: boolean }>();
  async enqueue(keys: readonly string[]) {
    for (const k of keys)
      if (!this.rows.has(k)) this.rows.set(k, { attempts: 0, lastError: null, hidden: false });
  }
  async claimDue(limit: number) {
    const due = [...this.rows.entries()].filter(([, r]) => !r.hidden).slice(0, limit);
    for (const [, row] of due) row.hidden = true; // leased
    return due.map(([k]) => k);
  }
  async complete(k: string) {
    this.rows.delete(k);
  }
  async fail(k: string, reason: string) {
    const row = this.rows.get(k)!;
    row.attempts += 1;
    row.lastError = reason;
    row.hidden = true; // backed off: not due again in this test's time frame
  }
  async pendingCount() {
    return this.rows.size;
  }
  /** Time passes: everything backed off becomes due again. */
  makeDue() {
    for (const row of this.rows.values()) row.hidden = false;
  }
}

function setup() {
  const store = new FakePrivateObjectStore();
  const queue = new MemoryQueue();
  const warn = vi.fn();
  const purger = new PrivateMediaPurger({ queue, store, logger: { warn }, batchSize: 3 });
  return { store, queue, purger, warn };
}

const seed = async (store: FakePrivateObjectStore, keys: string[]) => {
  for (const k of keys) await store.put({ key: k, body: new Uint8Array([1]), contentType: 'image/webp' });
};

describe('PrivateMediaPurger', () => {
  it('deletes queued objects from the private store and empties the queue', async () => {
    const { store, queue, purger } = setup();
    await seed(store, [key(1), key(1, true), key(2)]);
    await queue.enqueue([key(1), key(1, true), key(2)]);

    const result = await purger.drain();

    expect(result).toEqual({ deleted: 3, failed: 0, rejected: 0 });
    expect(store.keys).toEqual([]);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('works through more than one batch in a single drain', async () => {
    const { store, queue, purger } = setup();
    const keys = Array.from({ length: 8 }, (_, i) => key(i + 1));
    await seed(store, keys);
    await queue.enqueue(keys);
    expect((await purger.drain()).deleted).toBe(8);
    expect(store.keys).toEqual([]);
  });

  it('keeps a failed object queued, counts the attempt, and succeeds on a later pass', async () => {
    const { store, queue, purger, warn } = setup();
    await seed(store, [key(1), key(2)]);
    await queue.enqueue([key(1), key(2)]);
    store.failNext('delete', 1, (k) => k === key(1)); // storage outage for one object

    const first = await purger.drain();
    expect(first).toEqual({ deleted: 1, failed: 1, rejected: 0 });
    expect(store.keys).toEqual([key(1)]); // not lost: still stored, still queued
    expect(queue.rows.get(key(1))).toMatchObject({ attempts: 1, lastError: expect.stringContaining('503') });
    expect(warn).toHaveBeenCalled();

    queue.makeDue(); // backoff elapsed
    expect(await purger.drain()).toEqual({ deleted: 1, failed: 0, rejected: 0 });
    expect(store.keys).toEqual([]);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('records only a coarse reason: no URL, header or secret', async () => {
    const { store, queue, purger } = setup();
    await seed(store, [key(1)]);
    await queue.enqueue([key(1)]);
    store.failNext('delete');
    await purger.drain();
    const reason = queue.rows.get(key(1))!.lastError!;
    expect(reason).toBe('Private storage delete failed (http HTTP 503)');
  });

  it('treats an object that is already gone as done (a retry after a crash is harmless)', async () => {
    const { queue, purger } = setup();
    await queue.enqueue([key(9)]); // never stored
    expect(await purger.drain()).toEqual({ deleted: 1, failed: 0, rejected: 0 });
    expect(await queue.pendingCount()).toBe(0);
  });

  it('drops a row whose key is not a private key and never hands it to storage', async () => {
    const { store, queue, purger } = setup();
    queue.rows.set('onusfit/exercises/0123456789abcdef0123456789abcdef.webp', {
      attempts: 0,
      lastError: null,
      hidden: false,
    });
    const result = await purger.drain();
    expect(result).toEqual({ deleted: 0, failed: 0, rejected: 1 });
    expect(store.calls).toEqual([]); // nothing reached storage
    expect(await queue.pendingCount()).toBe(0);
  });

  it('can never delete public media: it only holds the private store, which refuses public keys', async () => {
    const { store } = setup();
    await expect(store.delete('onusfit/exercises/0123456789abcdef0123456789abcdef.webp')).rejects.toThrow(
      /private member-photo key/,
    );
  });

  it('runs one drain at a time and picks up objects queued meanwhile', async () => {
    const { store, queue, purger } = setup();
    await seed(store, [key(1)]);
    await queue.enqueue([key(1)]);
    const a = purger.drain();
    const b = purger.drain(); // while the first is in flight: shares it
    expect(b).toBe(a);
    await a;
    await seed(store, [key(2)]);
    await queue.enqueue([key(2)]);
    await purger.drain();
    expect(store.keys).toEqual([]);
  });

  it('kick() returns at once, never throws, and eventually deletes', async () => {
    const { store, queue, purger } = setup();
    await seed(store, [key(1)]);
    await queue.enqueue([key(1)]);
    expect(() => purger.kick()).not.toThrow();
    await vi.waitFor(() => expect(store.keys).toEqual([]));
  });

  it('kick() swallows and logs a queue failure instead of crashing the process', async () => {
    const { queue, store, warn } = setup();
    queue.claimDue = async () => {
      throw new Error('database down');
    };
    const purger = new PrivateMediaPurger({ queue, store, logger: { warn } });
    purger.kick();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it('start() drains on a timer and stop() waits for the pass in progress', async () => {
    vi.useFakeTimers();
    try {
      const { store, queue } = setup();
      const purger = new PrivateMediaPurger({ queue, store, intervalMs: 1_000 });
      await seed(store, [key(1)]);
      await queue.enqueue([key(1)]);
      purger.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(store.keys).toEqual([]);
      await seed(store, [key(2)]);
      await queue.enqueue([key(2)]);
      await vi.advanceTimersByTimeAsync(1_100);
      expect(store.keys).toEqual([]);
      await purger.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

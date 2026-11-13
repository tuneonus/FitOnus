import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_TIMEOUT_MESSAGE,
  AiTimeoutError,
  isAiTimeoutError,
  runWithAiTimeout,
} from '../../../src/shared/ai/ai-timeout.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runWithAiTimeout', () => {
  it('resolves with the work result and leaves no timer behind', async () => {
    vi.useFakeTimers();

    const result = await runWithAiTimeout(1_000, async () => 'done');

    expect(result).toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the safe timeout error and aborts the signal when the deadline passes', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = runWithAiTimeout(500, (s) => {
      signal = s;
      return new Promise<string>(() => undefined); // never settles
    });
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(499);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const error = await settled;

    expect(error).toBeInstanceOf(AiTimeoutError);
    expect(isAiTimeoutError(error)).toBe(true);
    expect(error).toMatchObject({ kind: 'unavailable', code: 'SERVICE_UNAVAILABLE', message: AI_TIMEOUT_MESSAGE });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a timeout even when the work only rejects because it was aborted (race order)', async () => {
    vi.useFakeTimers();
    const pending = runWithAiTimeout(
      100,
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
        }),
    );
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(101);

    expect(await settled).toBeInstanceOf(AiTimeoutError); // not the raw AbortError
  });

  it('stops waiting even if the work ignores the abort signal', async () => {
    vi.useFakeTimers();
    const pending = runWithAiTimeout(100, () => new Promise<string>(() => undefined));
    const settled = pending.then(
      () => 'resolved',
      () => 'rejected',
    );

    await vi.advanceTimersByTimeAsync(101);

    expect(await settled).toBe('rejected');
  });

  it('propagates the work’s own error unchanged and clears the timer', async () => {
    vi.useFakeTimers();
    const failure = new Error('provider exploded');

    await expect(runWithAiTimeout(1_000, async () => Promise.reject(failure))).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns a synchronous throw inside the work into a rejection', async () => {
    vi.useFakeTimers();

    await expect(
      runWithAiTimeout(1_000, () => {
        throw new Error('sync failure');
      }),
    ).rejects.toThrow('sync failure');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invokes the work exactly once, and a late rejection after the timeout is not an unhandled rejection', async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const work = vi.fn(
        (signal: AbortSignal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => setTimeout(() => reject(new Error('late abort error')), 10));
          }),
      );
      const settled = runWithAiTimeout(100, work).then(
        () => null,
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(200);
      await settled;
      vi.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));

      expect(work).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../src/shared/idempotency/fingerprint.js';
import { IdempotencyService } from '../../../src/shared/idempotency/idempotency.js';
import { FakeKeyedHasher, InMemoryIdempotencyStore } from '../../helpers/fakes.js';

const ref = { scope: 'actor-1', operation: 'things.create', key: 'retry-attempt-one' };

const setup = () => {
  const store = new InMemoryIdempotencyStore();
  const service = new IdempotencyService(store, new FakeKeyedHasher(), {
    ttlSeconds: 3600,
    leaseSeconds: 30,
  });
  return { store, service };
};

describe('canonicalJson', () => {
  it('ignores key order and undefined fields', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: undefined } })).toBe(
      canonicalJson({ a: { d: [2, 1] }, b: 1 }),
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('rejects values that cannot be represented as JSON', () => {
    expect(() => canonicalJson({ fn: () => 1 })).toThrow(TypeError);
  });
});

describe('IdempotencyService', () => {
  it('runs the work once and replays the stored result', async () => {
    const { service } = setup();
    let runs = 0;
    const work = async (complete: (value: { id: number }) => Promise<void>) => {
      runs += 1;
      const value = { id: runs };
      await complete(value);
      return value;
    };

    const first = await service.execute(ref, { name: 'x' }, work);
    const second = await service.execute(ref, { name: 'x' }, work);
    expect(first).toEqual({ value: { id: 1 }, replayed: false });
    expect(second).toEqual({ value: { id: 1 }, replayed: true });
    expect(runs).toBe(1);
  });

  it('rejects the same key with a different payload', async () => {
    const { service } = setup();
    await service.execute(ref, { name: 'x' }, async (complete) => {
      await complete('ok');
      return 'ok';
    });
    await expect(service.execute(ref, { name: 'y' }, () => Promise.resolve('never'))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('releases the key when the work fails so a retry can run', async () => {
    const { service, store } = setup();
    await expect(service.execute(ref, {}, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(store.records.size).toBe(0);

    const retry = await service.execute(ref, {}, async (complete) => {
      await complete('second');
      return 'second';
    });
    expect(retry).toEqual({ value: 'second', replayed: false });
  });

  it('reports an in-progress duplicate instead of running it twice', async () => {
    const { service } = setup();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const first = service.execute(ref, {}, async (complete) => {
      await blocked;
      await complete('done');
      return 'done';
    });
    await expect(service.execute(ref, {}, () => Promise.resolve('dup'))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    });
    release();
    await expect(first).resolves.toEqual({ value: 'done', replayed: false });
  });

  it('treats forgetting to call complete() as a programming error', async () => {
    const { service } = setup();
    await expect(service.execute(ref, {}, () => Promise.resolve('x'))).rejects.toThrow(
      /did not call complete/,
    );
  });
});

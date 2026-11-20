import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BoundedBody, parseContentLength, readBodyUpTo } from '../../../src/shared/http/read-upload-body.js';

const chunks = (...sizes: number[]): Buffer[] => sizes.map((size, index) => Buffer.alloc(size, index + 1));

describe('parseContentLength', () => {
  it.each([
    ['0', 0],
    ['1048576', 1_048_576],
    ['007', 7],
  ])('reads %j as %i', (header, expected) => {
    expect(parseContentLength(header)).toBe(expected);
  });

  it.each([undefined, '', '-1', '1.5', '1e6', ' 12', '12 ', 'abc', '0x10', '9'.repeat(16)])(
    'ignores the unusable header %j',
    (header) => {
      expect(parseContentLength(header)).toBeNull();
    },
  );
});

describe('readBodyUpTo', () => {
  it('joins the chunks of a body within the limit', async () => {
    const result = await readBodyUpTo(Readable.from(chunks(10, 20, 30)), 100);
    expect(result.length).toBe(60);
    expect(result.subarray(0, 10).every((byte) => byte === 1)).toBe(true);
    expect(result.subarray(30).every((byte) => byte === 3)).toBe(true);
  });

  it('accepts a body of exactly the limit', async () => {
    const result = await readBodyUpTo(Readable.from(chunks(50, 50)), 100);
    expect(result.length).toBe(100);
  });

  it('accepts an empty body (the caller decides what that means)', async () => {
    await expect(readBodyUpTo(Readable.from([]), 100)).resolves.toHaveLength(0);
  });

  it('refuses a body one byte over the limit', async () => {
    await expect(readBodyUpTo(Readable.from(chunks(50, 51)), 100)).rejects.toMatchObject({
      kind: 'payload_too_large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('reads the rest of an oversized body instead of abandoning it, so the connection is not reset', async () => {
    let produced = 0;
    const total = 20;
    const stream = new Readable({
      read() {
        produced += 1;
        this.push(produced <= total ? Buffer.alloc(100) : null);
      },
    });
    await expect(readBodyUpTo(stream, 250)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    // Every chunk was consumed (and discarded) before the refusal.
    expect(produced).toBe(total + 1);
  });

  it('refuses a body many times the limit, without ever completing in memory', async () => {
    const big = Readable.from(Array.from({ length: 5 }, () => Buffer.alloc(1024 * 1024)));
    await expect(readBodyUpTo(big, 1024)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('reports a client that disconnects mid-upload as a bad request, not a server error', async () => {
    const stream = new Readable({ read() {} });
    stream.push(Buffer.alloc(10));
    const pending = readBodyUpTo(stream, 100);
    setImmediate(() => stream.destroy());
    await expect(pending).rejects.toMatchObject({ kind: 'bad_request', code: 'BAD_REQUEST' });
  });

  it('reports a stream error as a bad request without leaking its message', async () => {
    const stream = new Readable({ read() {} });
    const pending = readBodyUpTo(stream, 100);
    setImmediate(() => stream.destroy(new Error('ECONNRESET secret-internal-detail')));
    const error = await pending.catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'bad_request' });
    expect((error as Error).message).not.toContain('secret-internal-detail');
  });
});

describe('BoundedBody: the memory a client can make the server use', () => {
  it('holds what it is given while within the limit', () => {
    const body = new BoundedBody(100);
    body.add(Buffer.alloc(40));
    body.add(Buffer.alloc(60));
    expect(body.heldBytes).toBe(100);
    expect(body.exceeded).toBe(false);
    expect(body.toBuffer()).toHaveLength(100);
  });

  it('lets go of everything the moment the limit is crossed, and holds nothing after', () => {
    const body = new BoundedBody(100);
    body.add(Buffer.alloc(80));
    expect(body.heldBytes).toBe(80);
    body.add(Buffer.alloc(30)); // 110 > 100
    expect(body.exceeded).toBe(true);
    expect(body.heldBytes).toBe(0);
    body.add(Buffer.alloc(1_000_000));
    expect(body.heldBytes).toBe(0);
  });

  it('never holds more than the limit, whatever the chunk sizes', () => {
    const body = new BoundedBody(1_000);
    for (const size of [300, 500, 700, 1_000_000, 5, 5_000_000]) {
      body.add(Buffer.alloc(size));
      expect(body.heldBytes).toBeLessThanOrEqual(1_000);
    }
    expect(body.exceeded).toBe(true);
  });

  it('a single chunk larger than the limit is never held', () => {
    const body = new BoundedBody(10);
    body.add(Buffer.alloc(11));
    expect(body.heldBytes).toBe(0);
  });
});

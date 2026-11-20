import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PrivateStorageError } from '../../../src/shared/storage/private-object-store.js';
import { R2PrivateObjectStore } from '../../../src/shared/storage/r2-private-object-store.js';

// Obviously fake: these exist only to prove they never leak. Nothing here can authenticate anywhere.
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const ACCESS_KEY_ID = 'PRIVATETESTKEYID0000';
const SECRET = 'PRIVATE-TEST-SECRET-THAT-MUST-NEVER-LEAK';
const BUCKET = 'tuneonus-private';
const OWNER = '3f2b8c1e-7d4a-4b6e-9a10-5c2d8e7f6a01';
const KEY = `members/${OWNER}/avatar/0123456789abcdef0123456789abcdef.webp`;
const NOW = new Date('2026-11-20T12:00:00Z');
const body = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);

function make(fetchImpl: typeof fetch = vi.fn() as unknown as typeof fetch) {
  return new R2PrivateObjectStore({
    accountId: ACCOUNT,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET,
    bucket: BUCKET,
    timeoutMs: 5_000,
    fetch: fetchImpl,
    now: () => NOW,
  });
}
const respond = (status: number) =>
  vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const lastCall = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.at(-1) as unknown as [string, RequestInit];

describe('R2PrivateObjectStore', () => {
  it('writes one object to the PRIVATE bucket with a signed, correctly typed request', async () => {
    const fetchMock = respond(200);
    await make(fetchMock).put({
      key: KEY,
      body,
      contentType: 'image/webp',
      cacheControl: 'private, max-age=31536000, immutable',
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${KEY}`);
    expect(init.method).toBe('PUT');
    expect(init.redirect).toBe('error');
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('image/webp');
    expect(headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(body).digest('hex'));
    expect(headers.Authorization).toContain(`Credential=${ACCESS_KEY_ID}/20261120/auto/s3/aws4_request`);
  });

  it('deletes with a signed DELETE, and treats "already gone" as success so a retry never sticks', async () => {
    for (const status of [200, 204, 404]) {
      const fetchMock = respond(status);
      await expect(make(fetchMock).delete(KEY)).resolves.toBeUndefined();
      const [url, init] = lastCall(fetchMock);
      expect(init.method).toBe('DELETE');
      expect(url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${KEY}`);
    }
    for (const status of [403, 500, 503]) {
      await expect(make(respond(status)).delete(KEY)).rejects.toMatchObject({
        name: 'PrivateStorageError',
        operation: 'delete',
        status,
      });
    }
  });

  it('answers exists with a HEAD: true for 200, false for 404, an error for anything else', async () => {
    expect(await make(respond(200)).exists(KEY)).toBe(true);
    expect(await make(respond(404)).exists(KEY)).toBe(false);
    await expect(make(respond(500)).exists(KEY)).rejects.toBeInstanceOf(PrivateStorageError);
  });

  it('reports a timeout or a network failure without the URL, headers or secret', async () => {
    const timeout = vi.fn(async () => {
      throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    const error = await make(timeout)
      .put({ key: KEY, body, contentType: 'image/webp' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrivateStorageError);
    expect(error).toMatchObject({ operation: 'put', reason: 'timeout', status: null });
    const text = JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack });
    for (const secret of [SECRET, ACCESS_KEY_ID, 'r2.cloudflarestorage.com', KEY])
      expect(text).not.toContain(secret);
  });

  it('refuses any key that is not a private member-photo key, before building a request', async () => {
    const fetchMock = respond(200);
    const store = make(fetchMock);
    const bad = [
      'onusfit/exercises/0123456789abcdef0123456789abcdef.webp', // a PUBLIC key
      `members/${OWNER}/avatar/../../x.webp`,
      `members/${OWNER}/avatar/0123456789abcdef0123456789abcdef.png`,
      'a/b.webp',
      '',
    ];
    for (const key of bad) {
      await expect(store.put({ key, body, contentType: 'image/webp' })).rejects.toThrow(
        /private member-photo key/,
      );
      await expect(store.delete(key)).rejects.toThrow();
      await expect(store.exists(key)).rejects.toThrow();
      expect(() => store.presignGet(key, { expiresInSeconds: 900 })).toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('presignGet', () => {
    it('makes a GET-only URL on the account endpoint that expires, and returns its expiry', () => {
      const { url, expiresAt } = make().presignGet(KEY, { expiresInSeconds: 900 });
      const parsed = new URL(url);
      expect(parsed.origin).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
      expect(parsed.pathname).toBe(`/${BUCKET}/${KEY}`);
      expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(parsed.searchParams.get('X-Amz-Date')).toBe('20261120T120000Z');
      expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
      expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.searchParams.get('X-Amz-Credential')).toBe(
        `${ACCESS_KEY_ID}/20261120/auto/s3/aws4_request`,
      );
      expect(expiresAt.toISOString()).toBe('2026-11-20T12:15:00.000Z');
    });

    it('makes no network call and never contains the secret', () => {
      const fetchMock = respond(200);
      const { url } = make(fetchMock).presignGet(KEY, { expiresInSeconds: 900 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(url).not.toContain(SECRET);
    });

    it('differs per object and per lifetime, so one URL opens exactly one object', () => {
      const store = make();
      const other = `members/${OWNER}/avatar/ffffffffffffffffffffffffffffffff.webp`;
      const signature = (u: string) => new URL(u).searchParams.get('X-Amz-Signature');
      const a = store.presignGet(KEY, { expiresInSeconds: 900 }).url;
      expect(signature(store.presignGet(other, { expiresInSeconds: 900 }).url)).not.toBe(signature(a));
      expect(signature(store.presignGet(KEY, { expiresInSeconds: 901 }).url)).not.toBe(signature(a));
    });
  });
});

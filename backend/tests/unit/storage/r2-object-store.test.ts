import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { R2ObjectStore, R2StorageError } from '../../../src/shared/storage/r2-object-store.js';

// Obviously fake: these exist only to prove they never leak. Nothing here can authenticate anywhere.
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const ACCESS_KEY_ID = 'TESTACCESSKEYID000000';
const SECRET = 'TEST-SECRET-ACCESS-KEY-THAT-MUST-NEVER-LEAK';
const KEY = 'notifications/0123456789abcdef0123456789abcdef.png';

const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function make(fetchImpl: typeof fetch) {
  return new R2ObjectStore({
    accountId: ACCOUNT,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET,
    bucket: 'fitonus-media',
    timeoutMs: 5_000,
    fetch: fetchImpl,
    now: () => new Date('2026-11-19T12:00:00Z'),
  });
}

const ok = (status = 200) => new Response(null, { status });

describe('R2ObjectStore.put', () => {
  it('writes one object to the S3 endpoint with a signed, correctly typed request', async () => {
    const fetchMock = vi.fn(async () => ok());
    await make(fetchMock as unknown as typeof fetch).put({
      key: KEY,
      body,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/fitonus-media/${KEY}`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(body);
    expect(init.redirect).toBe('error');

    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('image/png');
    expect(headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headers['x-amz-date']).toBe('20261119T120000Z');
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(body).digest('hex'));
    expect(headers.Authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/20261119/auto/s3/aws4_request, `),
    );
    expect(headers.Authorization).toContain(
      'SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date',
    );
  });

  it('never sends the secret anywhere: not in the URL, the headers or the body', async () => {
    const fetchMock = vi.fn(async () => ok());
    await make(fetchMock as unknown as typeof fetch).put({ key: KEY, body, contentType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(SECRET);
    expect(JSON.stringify(init.headers)).not.toContain(SECRET);
  });

  it('uses a timeout signal so a hung provider cannot hold a request open', async () => {
    const fetchMock = vi.fn(async () => ok());
    await make(fetchMock as unknown as typeof fetch).put({ key: KEY, body, contentType: 'image/png' });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a refusal as an error carrying only the operation and status, never the response text', async () => {
    const leaky = new Response(`<Error><Message>${SECRET} ${KEY} denied</Message></Error>`, { status: 403 });
    const error = await make((async () => leaky) as unknown as typeof fetch)
      .put({ key: KEY, body, contentType: 'image/png' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(R2StorageError);
    expect(error).toMatchObject({ operation: 'put', reason: 'http', status: 403 });
    const text = `${(error as Error).message}${JSON.stringify(error)}`;
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(ACCOUNT);
  });

  it('turns a network failure into a storage error without echoing the underlying message', async () => {
    const failing = (async () => {
      throw new TypeError(`fetch failed for https://${ACCOUNT}.r2.cloudflarestorage.com with ${SECRET}`);
    }) as unknown as typeof fetch;
    const error = await make(failing)
      .put({ key: KEY, body, contentType: 'image/png' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ operation: 'put', reason: 'network', status: null });
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).not.toContain(ACCOUNT);
  });

  it('classifies a timeout separately from other network failures', async () => {
    const timeout = (async () => {
      throw new DOMException('The operation timed out', 'TimeoutError');
    }) as unknown as typeof fetch;
    const error = await make(timeout)
      .put({ key: KEY, body, contentType: 'image/png' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: 'timeout' });
  });

  it.each([
    ['a path traversal', 'notifications/../secret.png'],
    ['an absolute path', '/notifications/x.png'],
    ['a doubled slash', 'notifications//x.png'],
    ['a space', 'notifications/a b.png'],
    ['a query string', 'notifications/x.png?acl'],
    ['an empty key', ''],
    ['a newline', 'notifications/x.png\n'],
  ])('refuses %s before any request is made', async (_name, key) => {
    const fetchMock = vi.fn(async () => ok());
    await expect(
      make(fetchMock as unknown as typeof fetch).put({ key, body, contentType: 'image/png' }),
    ).rejects.toThrow('unsafe object key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('R2ObjectStore.exists', () => {
  it('is true for 200 and sends a signed HEAD with no body', async () => {
    const fetchMock = vi.fn(async () => ok(200));
    await expect(make(fetchMock as unknown as typeof fetch).exists(KEY)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/fitonus-media/${KEY}`);
    expect(init.method).toBe('HEAD');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toContain('AWS4-HMAC-SHA256');
  });

  it('is false for 404', async () => {
    await expect(make((async () => ok(404)) as unknown as typeof fetch).exists(KEY)).resolves.toBe(false);
  });

  it.each([403, 500, 503])('throws for %i rather than guessing', async (status) => {
    const error = await make((async () => ok(status)) as unknown as typeof fetch)
      .exists(KEY)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ operation: 'head', status });
  });
});

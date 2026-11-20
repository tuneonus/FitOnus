import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUploadUrl,
  createAuthorizedUploadTransport,
  type AuthorizedUploadDeps,
  type SendFileArgs,
} from '../src/shared/media/authorized-upload';
import { UploadImageError, type UploadRequest } from '../src/shared/media/upload-image';

const request = (overrides: Partial<UploadRequest> = {}): UploadRequest => ({
  method: 'POST',
  path: '/progress/photos',
  query: { takenOn: '2026-11-20', tag: 'front' },
  uri: 'file:///cache/ImagePicker/a.jpg',
  contentType: 'image/jpeg',
  ...overrides,
});

const answer = (status: number, body = '{}') => ({ status, body });

function setup(options: {
  responses?: { status: number; body: string }[];
  token?: string | null;
  refresh?: () => Promise<string>;
  session?: () => void;
  sendFile?: AuthorizedUploadDeps['sendFile'];
  timeoutMs?: number;
} = {}) {
  const sent: SendFileArgs[] = [];
  const queue = [...(options.responses ?? [answer(200)])];
  let refreshed = 0;
  const deps: AuthorizedUploadDeps = {
    baseUrl: () => 'https://api.example.test/api/v1/',
    getAccessToken: async () => (options.token === undefined ? 'access-1' : options.token),
    refreshAccessToken:
      options.refresh ??
      (async () => {
        refreshed += 1;
        return 'access-2';
      }),
    captureSession: () => ({ assertCurrent: options.session ?? (() => undefined) }),
    sendFile:
      options.sendFile ??
      (async (args) => {
        sent.push(args);
        args.onProgress?.(0.5);
        return queue.shift() ?? answer(200);
      }),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  };
  return { transport: createAuthorizedUploadTransport(deps), sent, refreshes: () => refreshed };
}

describe('buildUploadUrl', () => {
  it('joins the base, the path and an encoded query without doubled slashes', () => {
    assert.equal(
      buildUploadUrl('https://h/api/v1/', '/progress/photos', { takenOn: '2026-11-20', tag: 'front' }),
      'https://h/api/v1/progress/photos?takenOn=2026-11-20&tag=front',
    );
    assert.equal(buildUploadUrl('https://h/api/v1', 'profile/avatar'), 'https://h/api/v1/profile/avatar');
    assert.equal(buildUploadUrl('https://h/api/v1', '/p', { a: 'x y&z=1' }), 'https://h/api/v1/p?a=x%20y%26z%3D1');
    assert.equal(buildUploadUrl('https://h/api/v1///', '/p', {}), 'https://h/api/v1/p');
  });
});

describe('createAuthorizedUploadTransport', () => {
  it('sends the file under its type with the member\'s token, to the API, and reports progress', async () => {
    const { transport, sent } = setup();
    const progress: number[] = [];
    const response = await transport(request({ onProgress: (f) => progress.push(f) }));

    assert.deepEqual(response, answer(200));
    assert.equal(sent.length, 1);
    const call = sent[0]!;
    assert.equal(call.url, 'https://api.example.test/api/v1/progress/photos?takenOn=2026-11-20&tag=front');
    assert.equal(call.method, 'POST');
    assert.equal(call.uri, 'file:///cache/ImagePicker/a.jpg');
    assert.deepEqual(call.headers, { 'Content-Type': 'image/jpeg', Authorization: 'Bearer access-1' });
    assert.deepEqual(progress, [0.5]);
    assert.equal(call.signal.aborted, false);
  });

  it('sends no Authorization header when there is no token (the server answers 401)', async () => {
    const { transport, sent } = setup({ token: null, responses: [answer(200)] });
    await transport(request());
    assert.equal('Authorization' in sent[0]!.headers, false);
  });

  it('answers an expired token with one refresh and one more attempt under the new token', async () => {
    const { transport, sent, refreshes } = setup({ responses: [answer(401), answer(201, '{"ok":1}')] });
    const response = await transport(request());
    assert.deepEqual(response, answer(201, '{"ok":1}'));
    assert.equal(refreshes(), 1);
    assert.equal(sent.length, 2);
    assert.equal(sent[0]!.headers.Authorization, 'Bearer access-1');
    assert.equal(sent[1]!.headers.Authorization, 'Bearer access-2');
  });

  it('gives up after that one retry: a second 401 is the answer, never a loop', async () => {
    const { transport, sent, refreshes } = setup({ responses: [answer(401), answer(401), answer(401)] });
    assert.equal((await transport(request())).status, 401);
    assert.equal(sent.length, 2);
    assert.equal(refreshes(), 1);
  });

  it('does not refresh for any other answer, successful or not', async () => {
    for (const status of [200, 201, 403, 409, 413, 415, 422, 429, 500, 503]) {
      const { transport, sent, refreshes } = setup({ responses: [answer(status)] });
      assert.equal((await transport(request())).status, status);
      assert.equal(sent.length, 1, String(status));
      assert.equal(refreshes(), 0, String(status));
    }
  });

  it('passes a failed refresh on (the session cannot continue) without a second upload', async () => {
    const expired = Object.assign(new Error('Your session has expired. Please sign in again.'), { name: 'SessionExpiredError' });
    const { transport, sent } = setup({
      responses: [answer(401)],
      refresh: async () => {
        throw expired;
      },
    });
    await assert.rejects(transport(request()), (e: unknown) => e === expired);
    assert.equal(sent.length, 1);
  });

  it('refuses to send when the signed-in member changed, before the first attempt and before the retry', async () => {
    const changed = Object.assign(new Error('Your session changed. Please try again.'), { name: 'SessionChangedError' });

    const first = setup({
      session: () => {
        throw changed;
      },
    });
    await assert.rejects(first.transport(request()), (e: unknown) => e === changed);
    assert.equal(first.sent.length, 0);

    // The account is switched while the token is being refreshed: the retry must not go out under the new account.
    let calls = 0;
    const second = setup({
      responses: [answer(401)],
      session: () => {
        calls += 1;
        if (calls > 1) throw changed;
      },
    });
    await assert.rejects(second.transport(request()), (e: unknown) => e === changed);
    assert.equal(second.sent.length, 1);
  });

  it('reports a stalled upload as a timeout, and stops the native task', async () => {
    let seen: AbortSignal | undefined;
    const { transport } = setup({
      timeoutMs: 20,
      sendFile: (args) =>
        new Promise((_resolve, reject) => {
          seen = args.signal;
          args.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    });
    await assert.rejects(transport(request()), (e: unknown) => e instanceof UploadImageError && e.code === 'TIMEOUT');
    assert.equal(seen?.aborted, true);
  });

  it('passes the member\'s cancel to the native task, and is not mistaken for a timeout', async () => {
    const cancel = new AbortController();
    let seen: AbortSignal | undefined;
    const { transport } = setup({
      sendFile: (args) =>
        new Promise((_resolve, reject) => {
          seen = args.signal;
          args.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          setTimeout(() => cancel.abort(), 5);
        }),
    });
    await assert.rejects(
      transport(request({ signal: cancel.signal })),
      (e: unknown) => (e as { name?: string }).name === 'AbortError',
    );
    assert.equal(seen?.aborted, true);
  });

  it('hands over an already-cancelled signal as cancelled', async () => {
    const cancel = new AbortController();
    cancel.abort();
    let seen: AbortSignal | undefined;
    const { transport } = setup({
      sendFile: async (args) => {
        seen = args.signal;
        return answer(200);
      },
    });
    await transport(request({ signal: cancel.signal }));
    assert.equal(seen?.aborted, true);
  });

  it('leaves no timer behind after a normal upload', async () => {
    const { transport } = setup({ timeoutMs: 60_000 });
    await transport(request());
    // If the timer were still pending, this test file would not exit until it fired: reaching here and finishing is the check.
    assert.ok(true);
  });
});

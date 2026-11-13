import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ResendAuthError,
  ResendDeliveryError,
  ResendNetworkError,
  ResendPasswordResetNotifier,
  ResendRateLimitedError,
  ResendRejectedError,
  ResendServerError,
  ResendTimeoutError,
} from '../../../src/modules/auth/infrastructure/resend-password-reset-notifier.js';

// Obviously fake: nothing here can authenticate against anything.
const API_KEY = 're_unit_test_not_a_real_key_0000';
const FROM = 'OnusFit <noreply@tuneonus.com>';
const NOW = new Date('2026-03-10T10:00:00.000Z');
const IN_5_MINUTES = new Date(NOW.getTime() + 5 * 60_000);

interface Call {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
  body: Record<string, unknown>;
}

/** Records every request; `respond` decides the answer (default: Resend's 200 {"id": ...}). */
function fakeFetch(respond: (call: Call) => Response | Promise<Response> = () => ok()) {
  const calls: Call[] = [];
  const fn = ((input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: input instanceof Request ? input.url : String(input),
      init: init as Call['init'],
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    };
    calls.push(call);
    return Promise.resolve(respond(call));
  }) as typeof fetch;
  return { fn, calls };
}

const ok = () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });

const build = (fetchImpl: typeof fetch, overrides: { timeoutMs?: number } = {}) =>
  new ResendPasswordResetNotifier({
    apiKey: API_KEY,
    from: FROM,
    timeoutMs: overrides.timeoutMs ?? 5_000,
    fetch: fetchImpl,
    now: () => NOW,
  });

const message = (email = 'alice@example.org') => ({
  email,
  otp: '482913',
  expiresAt: IN_5_MINUTES,
});

/** Everything an operator could ever see about a failure: message, name, stack, JSON and inspect output. */
const everythingPrintable = (error: unknown): string =>
  [
    error instanceof Error ? error.message : '',
    error instanceof Error ? error.name : '',
    error instanceof Error ? error.stack : '',
    JSON.stringify(error),
    inspect(error, { depth: 6, showHidden: true }),
  ].join('\n');

afterEach(() => vi.unstubAllGlobals());

describe('ResendPasswordResetNotifier: request', () => {
  it('posts one JSON message to the Resend emails endpoint with bearer auth', async () => {
    const { fn, calls } = fakeFetch();
    const msg = message();
    await build(fn).send(msg);

    expect(calls).toHaveLength(1);
    const [call] = calls as [Call];
    expect(call.url).toBe('https://api.resend.com/emails');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    });
    expect(Object.keys(call.body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
    expect(call.body.from).toBe(FROM);
    expect(call.body.to).toEqual(['alice@example.org']);
  });

  it('puts the OTP in the body only, never in the URL, headers or subject', async () => {
    const { fn, calls } = fakeFetch();
    const msg = message();
    await build(fn).send(msg);

    const [call] = calls as [Call];
    expect(String(call.body.text)).toContain(msg.otp);
    expect(String(call.body.html)).toContain(msg.otp);
    expect(call.url).not.toContain(msg.otp);
    expect(call.body.subject).not.toContain(msg.otp);
    expect(JSON.stringify(call.init.headers)).not.toContain(msg.otp);
  });

  it('is bounded by an abort signal and refuses redirects', async () => {
    const { fn, calls } = fakeFetch();
    await build(fn).send(message());
    const [call] = calls as [Call];
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(call.init.redirect).toBe('error');
  });

  it('derives the validity wording from the token expiry', async () => {
    const { fn, calls } = fakeFetch();
    const notifier = build(fn);
    await notifier.send({ ...message(), expiresAt: IN_5_MINUTES });
    await notifier.send({ ...message(), expiresAt: new Date(NOW.getTime() + 20_000) }); // rounds up to 1
    await notifier.send({ ...message(), expiresAt: new Date(NOW.getTime() - 60_000) }); // already past: never 0

    expect(calls.map((call) => /expires in (\d+ minutes?)/.exec(String(call.body.text))?.[1])).toEqual([
      '5 minutes',
      '1 minute',
      '1 minute',
    ]);
  });

  it('resolves for any 2xx answer', async () => {
    for (const status of [200, 201, 202]) {
      const { fn } = fakeFetch(() => new Response('{}', { status }));
      await expect(build(fn).send(message())).resolves.toBeUndefined();
    }
  });

  it('uses the global fetch resolved at call time when none is injected', async () => {
    const notifier = new ResendPasswordResetNotifier({ apiKey: API_KEY, from: FROM, timeoutMs: 1_000 });
    const { fn, calls } = fakeFetch();
    vi.stubGlobal('fetch', fn);
    await notifier.send(message('bob@example.org'));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.to).toEqual(['bob@example.org']);
  });
});

describe('ResendPasswordResetNotifier: failures are categorised and sanitised', () => {
  const cases: Array<[number, new (...args: never[]) => ResendDeliveryError, string]> = [
    [401, ResendAuthError, 'ResendAuthError'],
    [403, ResendAuthError, 'ResendAuthError'],
    [429, ResendRateLimitedError, 'ResendRateLimitedError'],
    [400, ResendRejectedError, 'ResendRejectedError'],
    [422, ResendRejectedError, 'ResendRejectedError'],
    [500, ResendServerError, 'ResendServerError'],
    [503, ResendServerError, 'ResendServerError'],
    [302, ResendServerError, 'ResendServerError'],
  ];

  it.each(cases)('HTTP %i becomes %s', async (status, errorClass, name) => {
    const { fn } = fakeFetch(() => new Response('{}', { status }));
    const error = await build(fn)
      .send(message())
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(errorClass);
    expect(error).toBeInstanceOf(ResendDeliveryError);
    expect((error as ResendDeliveryError).name).toBe(name); // what the use case reports as `errorName`
    expect((error as ResendDeliveryError).status).toBe(status);
  });

  it('never leaks the token, address or API key, even when Resend echoes them back', async () => {
    const msg = message('carol@example.org');
    const { fn } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            name: 'validation_error',
            message: `Invalid to ${msg.email} / token ${msg.otp} / key ${API_KEY}`,
          }),
          { status: 422 },
        ),
    );
    const error = await build(fn)
      .send(msg)
      .catch((e: unknown) => e);

    const printable = everythingPrintable(error);
    for (const secret of [msg.otp, msg.email, API_KEY, 'Bearer']) expect(printable).not.toContain(secret);
    expect((error as Error).cause).toBeUndefined();
  });

  it('turns a transport failure into a fixed-message network error and drops the original', async () => {
    const msg = message();
    const transport = new TypeError(`fetch failed (connect ECONNREFUSED) Bearer ${API_KEY} for ${msg.otp}`);
    const error = await build((() => Promise.reject(transport)) as typeof fetch)
      .send(msg)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ResendNetworkError);
    expect((error as Error).message).toBe('Could not reach Resend');
    expect((error as Error).cause).toBeUndefined();
    const printable = everythingPrintable(error);
    for (const secret of [msg.otp, API_KEY]) expect(printable).not.toContain(secret);
  });

  it('gives up after the configured timeout instead of hanging', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      })) as unknown as typeof fetch;

    const started = performance.now();
    const error = await build(hanging, { timeoutMs: 30 })
      .send(message())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ResendTimeoutError);
    expect((error as Error).message).toBe('Resend did not answer within 30 ms');
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe('ResendPasswordResetNotifier: secrets handling and construction', () => {
  it('keeps the API key out of JSON and inspect output', () => {
    const notifier = build(fakeFetch().fn);
    expect(JSON.stringify(notifier)).not.toContain(API_KEY);
    expect(inspect(notifier, { depth: 6, showHidden: true })).not.toContain(API_KEY);
  });

  it('rejects unusable settings at construction time', () => {
    const base = { apiKey: API_KEY, from: FROM, timeoutMs: 1_000 };
    expect(() => new ResendPasswordResetNotifier({ ...base, apiKey: '  ' })).toThrow(/apiKey/);
    expect(() => new ResendPasswordResetNotifier({ ...base, from: '' })).toThrow(/from/);
    expect(() => new ResendPasswordResetNotifier({ ...base, timeoutMs: 0 })).toThrow(/timeoutMs/);
    expect(() => new ResendPasswordResetNotifier({ ...base, timeoutMs: 1.5 })).toThrow(/timeoutMs/);
  });

  it('trims the key and the sender it is given', async () => {
    const { fn, calls } = fakeFetch();
    await new ResendPasswordResetNotifier({
      apiKey: `  ${API_KEY}\n`,
      from: `  ${FROM} `,
      timeoutMs: 1_000,
      fetch: fn,
    }).send(message());
    expect(calls[0]!.init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(calls[0]!.body.from).toBe(FROM);
  });
});

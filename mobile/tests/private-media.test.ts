import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_REFRESH_DELAY_MS,
  REFRESH_LEAD_MS,
  earliestExpiry,
  isUrlStale,
  privateImageCacheKey,
  refreshDelayMs,
  shouldClearPrivateImages,
  type SessionSnapshot,
} from '../src/shared/media/private-image';
import {
  MAX_UPLOAD_BYTES,
  UploadHttpError,
  UploadImageError,
  describeUploadError,
  resolveImageType,
  uploadImage,
  type UploadRequest,
  type UploadTransport,
} from '../src/shared/media/upload-image';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

describe('private image cache keys', () => {
  it('change when a picture is replaced (new version), even though the id stays the same', () => {
    const before = privateImageCacheKey('avatar', 'user-1', 'a'.repeat(32), 'full');
    const after = privateImageCacheKey('avatar', 'user-1', 'b'.repeat(32), 'full');
    assert.notEqual(before, after);
  });

  it('stay the same when only the signed URL changes (so a refresh does not re-download)', () => {
    // The key is built from id and version only: there is no URL input at all.
    assert.equal(
      privateImageCacheKey('progress', 'photo-1', 'c'.repeat(32), 'thumb'),
      privateImageCacheKey('progress', 'photo-1', 'c'.repeat(32), 'thumb'),
    );
  });

  it('keep kinds, owners and sizes apart', () => {
    const keys = new Set([
      privateImageCacheKey('avatar', 'x', 'v', 'full'),
      privateImageCacheKey('avatar', 'x', 'v', 'thumb'),
      privateImageCacheKey('progress', 'x', 'v', 'full'),
      privateImageCacheKey('avatar', 'y', 'v', 'full'),
    ]);
    assert.equal(keys.size, 4);
  });
});

describe('signed URL freshness', () => {
  it('is fresh until a minute before expiry, stale from then on', () => {
    assert.equal(isUrlStale(inMs(15 * 60_000), NOW), false);
    assert.equal(isUrlStale(inMs(REFRESH_LEAD_MS + 1), NOW), false);
    assert.equal(isUrlStale(inMs(REFRESH_LEAD_MS), NOW), true);
    assert.equal(isUrlStale(inMs(0), NOW), true);
    assert.equal(isUrlStale(inMs(-5_000), NOW), true);
  });

  it('treats a missing or unreadable expiry as stale', () => {
    for (const bad of [null, undefined, '', 'not a date']) assert.equal(isUrlStale(bad, NOW), true);
  });

  it('schedules the refresh a minute before expiry, never in a tight loop, and never without a picture', () => {
    assert.equal(refreshDelayMs(inMs(15 * 60_000), NOW), 14 * 60_000);
    assert.equal(refreshDelayMs(inMs(30_000), NOW), MIN_REFRESH_DELAY_MS);
    assert.equal(refreshDelayMs(inMs(-10_000), NOW), MIN_REFRESH_DELAY_MS);
    assert.equal(refreshDelayMs(null, NOW), false);
    assert.equal(refreshDelayMs('garbage', NOW), false);
  });

  it('refreshes a whole gallery by its earliest expiry', () => {
    const a = inMs(900_000);
    const b = inMs(300_000);
    assert.equal(earliestExpiry([a, b, null, 'x']), b);
    assert.equal(earliestExpiry([]), null);
    assert.equal(earliestExpiry([null, undefined]), null);
  });
});

describe('resolveImageType', () => {
  it('uses the picker type when it is one the server accepts', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      assert.equal(resolveImageType({ uri: 'file:///a', mimeType: type }), type);
    }
    assert.equal(resolveImageType({ uri: 'file:///a', mimeType: 'IMAGE/JPEG; q=1' }), 'image/jpeg');
  });

  it('refuses a type the server would refuse', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'video/mp4', 'application/pdf']) {
      assert.throws(() => resolveImageType({ uri: 'file:///a', mimeType: type }), UploadImageError);
    }
  });

  it('falls back to the file extension, then to JPEG', () => {
    assert.equal(resolveImageType({ uri: 'file:///x/photo.HEIC' }), 'image/heic');
    assert.equal(resolveImageType({ uri: 'file:///x/photo.png?cache=1' }), 'image/png');
    assert.equal(resolveImageType({ uri: 'file:///x/ImagePicker/abc', mimeType: null }), 'image/jpeg');
  });
});


describe('uploadImage', () => {
  const ok = JSON.stringify({ success: true, data: { id: 'ok' } });

  /** A transport that records its requests and answers like the server. */
  function fakeTransport(answer: { status?: number; body?: string } = {}) {
    const calls: UploadRequest[] = [];
    const transport: UploadTransport = async (request) => {
      calls.push(request);
      request.onProgress?.(0.25);
      return { status: answer.status ?? 200, body: answer.body ?? ok };
    };
    return { transport, calls };
  }

  const image = { uri: 'file:///cache/ImagePicker/a.png', mimeType: 'image/png' };

  it('hands the file to the transport with its type, the path and only the query entries that have a value', async () => {
    const { transport, calls } = fakeTransport();
    const progress: number[] = [];
    const result = await uploadImage<{ id: string }>({
      transport,
      method: 'POST',
      path: '/progress/photos',
      query: { takenOn: '2026-11-20', tag: undefined },
      image,
      onProgress: (fraction) => progress.push(fraction),
    });

    assert.deepEqual(result, { id: 'ok' });
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.method, 'POST');
    assert.equal(call.path, '/progress/photos');
    assert.equal(call.uri, image.uri);
    assert.equal(call.contentType, 'image/png');
    assert.deepEqual(call.query, { takenOn: '2026-11-20' }); // undefined entries are left out
    assert.deepEqual(progress, [0.25, 1]); // the transport's report, then completion
  });

  it('sends no query at all when there is none', async () => {
    const { transport, calls } = fakeTransport();
    await uploadImage({ transport, method: 'PUT', path: '/profile/avatar', image: { uri: 'file:///a.jpg' } });
    assert.equal('query' in calls[0]!, false);
    assert.equal(calls[0]!.contentType, 'image/jpeg');
  });

  it('refuses an oversized file, or an unsupported type, before sending anything', async () => {
    const { transport, calls } = fakeTransport();
    await assert.rejects(
      uploadImage({ transport, method: 'PUT', path: '/p', image: { uri: 'file:///big.jpg', fileSize: MAX_UPLOAD_BYTES + 1 } }),
      (e: unknown) => e instanceof UploadImageError && e.code === 'TOO_LARGE',
    );
    await assert.rejects(
      uploadImage({ transport, method: 'PUT', path: '/p', image: { uri: 'file:///a.gif', mimeType: 'image/gif' } }),
      (e: unknown) => e instanceof UploadImageError && e.code === 'UNSUPPORTED_TYPE',
    );
    assert.equal(calls.length, 0);
  });

  it('accepts a file of exactly 10 MB', async () => {
    const { transport, calls } = fakeTransport();
    await uploadImage({ transport, method: 'PUT', path: '/p', image: { uri: 'file:///a.jpg', fileSize: MAX_UPLOAD_BYTES } });
    assert.equal(calls.length, 1);
  });

  it('does not send when it was already cancelled, and reports a cancel during the upload as cancelled', async () => {
    const { transport, calls } = fakeTransport();
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      uploadImage({ transport, method: 'PUT', path: '/p', image, signal: cancelled.signal }),
      (e: unknown) => e instanceof UploadImageError && e.code === 'CANCELLED',
    );
    assert.equal(calls.length, 0);

    // The native task rejects with an AbortError when the signal fires mid-upload.
    const aborting: UploadTransport = async () => {
      throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    };
    await assert.rejects(
      uploadImage({ transport: aborting, method: 'PUT', path: '/p', image }),
      (e: unknown) => e instanceof UploadImageError && e.code === 'CANCELLED',
    );
  });

  it('passes any other transport failure (no connection) on unchanged', async () => {
    const failure = new Error('network down');
    const transport: UploadTransport = async () => {
      throw failure;
    };
    await assert.rejects(uploadImage({ transport, method: 'PUT', path: '/p', image }), (e: unknown) => e === failure);
  });

  it('turns a refusal by the server into an error that carries its status and its reason', async () => {
    const body = JSON.stringify({ success: false, error: { code: 'PHOTO_LIMIT_REACHED', message: 'You can keep up to 50.' } });
    const { transport } = fakeTransport({ status: 409, body });
    await assert.rejects(uploadImage({ transport, method: 'POST', path: '/p', image }), (e: unknown) => {
      assert.ok(e instanceof UploadHttpError);
      assert.equal(e.response.status, 409);
      assert.deepEqual(describeUploadError(e), {
        message: 'You can keep up to 50.',
        code: 'PHOTO_LIMIT_REACHED',
        retryable: false,
      });
      return true;
    });
  });

  it('survives a refusal whose body is not JSON (a gateway error page)', async () => {
    const { transport } = fakeTransport({ status: 502, body: '<html>Bad gateway</html>' });
    await assert.rejects(uploadImage({ transport, method: 'PUT', path: '/p', image }), (e: unknown) => {
      assert.ok(e instanceof UploadHttpError);
      assert.equal(e.response.data, null);
      assert.equal(describeUploadError(e).retryable, true);
      assert.doesNotMatch(describeUploadError(e).message, /html|gateway/i);
      return true;
    });
  });

  it('reports a success without data as an unexpected answer rather than returning nothing', async () => {
    for (const body of ['', 'not json', '{}', JSON.stringify({ success: true })]) {
      const { transport } = fakeTransport({ body });
      await assert.rejects(
        uploadImage({ transport, method: 'PUT', path: '/p', image }),
        (e: unknown) => e instanceof UploadImageError && e.code === 'BAD_RESPONSE',
        body,
      );
    }
  });
});

describe('describeUploadError', () => {
  const refusal = (status: number, code: string, message = 'server text') =>
    new UploadHttpError(status, { success: false, error: { code, message } });

  it('explains the photo limit with the server wording', () => {
    const result = describeUploadError(refusal(409, 'PHOTO_LIMIT_REACHED', 'You can keep up to 50 progress photos.'));
    assert.equal(result.code, 'PHOTO_LIMIT_REACHED');
    assert.equal(result.message, 'You can keep up to 50 progress photos.');
    assert.equal(result.retryable, false);
  });

  it('says which problems are worth retrying', () => {
    assert.equal(describeUploadError(refusal(503, 'PRIVATE_STORAGE_UNAVAILABLE')).retryable, true);
    assert.equal(describeUploadError(refusal(503, 'PRIVATE_STORAGE_NOT_CONFIGURED')).retryable, false);
    assert.equal(describeUploadError(refusal(429, 'RATE_LIMITED')).retryable, true);
    assert.equal(describeUploadError(refusal(500, 'INTERNAL_ERROR')).retryable, true);
    assert.equal(describeUploadError(refusal(422, 'INVALID_IMAGE', 'That photo looks damaged.')).retryable, false);
    assert.equal(describeUploadError(refusal(413, 'PAYLOAD_TOO_LARGE')).retryable, false);
    assert.equal(describeUploadError(refusal(401, 'TOKEN_EXPIRED')).retryable, false);
    assert.equal(describeUploadError(new Error('Network request failed')).retryable, true); // nothing answered: offline
    assert.equal(describeUploadError(new UploadImageError('TIMEOUT', 'too slow')).retryable, true);
    assert.equal(describeUploadError(new UploadImageError('READ_FAILED', 'unreadable')).retryable, true);
  });

  it('never shows technical detail for a server fault', () => {
    const message = describeUploadError(refusal(500, 'INTERNAL_ERROR', 'ECONNRESET at pg:5432 /var/app')).message;
    assert.doesNotMatch(message, /pg|ECONN|\/var/);
  });

  it('recognises local problems, cancellation and a session that ended', () => {
    assert.equal(describeUploadError(new UploadImageError('TOO_LARGE', 'too big')).message, 'too big');
    assert.equal(describeUploadError(Object.assign(new Error('x'), { name: 'AbortError' })).code, 'CANCELLED');
    assert.equal(describeUploadError({ code: 'ERR_CANCELED' }).code, 'CANCELLED');
    assert.match(describeUploadError(undefined).message, /connection/);

    const expired = Object.assign(new Error('Your session has expired. Please sign in again.'), { name: 'SessionExpiredError' });
    assert.deepEqual(describeUploadError(expired), {
      message: 'Your session has expired. Please sign in again.',
      code: 'SessionExpiredError',
      retryable: false,
    });
    const changed = Object.assign(new Error('Your session changed. Please try again.'), { name: 'SessionChangedError' });
    assert.equal(describeUploadError(changed).message, 'Your session changed. Please try again.');
  });
});

describe('when the on-device private image cache is emptied', () => {
  const session = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
    userId: 'user-1',
    isAuthenticated: true,
    isLoading: false,
    ...over,
  });
  const signedOut = session({ userId: null, isAuthenticated: false });

  it('empties on sign-out', () => {
    assert.equal(shouldClearPrivateImages(session(), signedOut), true);
  });

  it('empties when the member is signed out (the session is gone, the user is cleared)', () => {
    assert.equal(shouldClearPrivateImages(session(), session({ userId: null, isAuthenticated: false })), true);
  });

  it('empties when a different account takes over, even without a sign-out in between', () => {
    assert.equal(shouldClearPrivateImages(session(), session({ userId: 'user-2' })), true);
  });

  it('empties at app start when the saved session was read and nobody is signed in', () => {
    const starting = session({ userId: null, isAuthenticated: false, isLoading: true });
    assert.equal(shouldClearPrivateImages(starting, signedOut), true);
  });

  it('keeps the cache when the same member signs back in at app start (their own pictures, no re-download)', () => {
    const starting = session({ userId: null, isAuthenticated: false, isLoading: true });
    assert.equal(shouldClearPrivateImages(starting, session()), false);
  });

  it('keeps the cache for changes that are not about who is signed in', () => {
    assert.equal(shouldClearPrivateImages(session(), session()), false);
    assert.equal(shouldClearPrivateImages(signedOut, signedOut), false);
  });

  it('does not empty again when nobody was signed in and still nobody is', () => {
    assert.equal(shouldClearPrivateImages(signedOut, signedOut), false);
  });
});

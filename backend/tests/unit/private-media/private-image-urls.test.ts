import { describe, expect, it } from 'vitest';
import {
  imageVersionOf,
  newPrivateImageKey,
  privateThumbnailKey,
} from '../../../src/shared/private-media/private-image-policy.js';
import { PrivateImageUrlIssuer } from '../../../src/shared/private-media/private-image-urls.js';
import { FakePrivateObjectStore, keyOfFakeUrl } from '../../helpers/fake-private-store.js';

const ALICE = '3f2b8c1e-7d4a-4b6e-9a10-5c2d8e7f6a01';
const BOB = '9a7e5d3c-1b2f-4c8d-8e6a-0f1e2d3c4b5a';

function setup(ttlSeconds = 900) {
  const store = new FakePrivateObjectStore();
  const clock = { now: new Date('2026-11-20T12:00:00Z') };
  store.now = () => clock.now;
  return { store, clock, issuer: new PrivateImageUrlIssuer(store, ttlSeconds) };
}

describe('PrivateImageUrlIssuer', () => {
  it('signs the picture and its thumbnail with a 15 minute lifetime and reports the expiry', () => {
    const { issuer, store } = setup();
    const key = newPrivateImageKey(ALICE, 'avatar');
    const urls = issuer.issue(ALICE, 'avatar', key)!;

    expect(keyOfFakeUrl(urls.url)).toBe(key);
    expect(keyOfFakeUrl(urls.thumbnailUrl)).toBe(privateThumbnailKey(key));
    expect(urls.version).toBe(imageVersionOf(key));
    expect(urls.expiresAt).toBe('2026-11-20T12:15:00.000Z');
    expect(store.count('sign')).toBe(2);
  });

  it("refuses to sign a picture that is not this owner's, of this kind, in canonical form", () => {
    const { issuer, store } = setup();
    const alices = newPrivateImageKey(ALICE, 'avatar');
    expect(issuer.issue(BOB, 'avatar', alices)).toBeNull(); // someone else's
    expect(issuer.issue(ALICE, 'progress', alices)).toBeNull(); // wrong kind
    expect(issuer.issue(ALICE, 'avatar', privateThumbnailKey(alices))).toBeNull(); // a thumbnail
    expect(
      issuer.issue(ALICE, 'avatar', 'onusfit/exercises/0123456789abcdef0123456789abcdef.webp'),
    ).toBeNull(); // public
    expect(issuer.issue(ALICE, 'avatar', '')).toBeNull();
    expect(store.count('sign')).toBe(0); // nothing was even signed
  });

  it('gives a different version for every stored picture', () => {
    const { issuer } = setup();
    const a = issuer.issue(ALICE, 'progress', newPrivateImageKey(ALICE, 'progress'))!;
    const b = issuer.issue(ALICE, 'progress', newPrivateImageKey(ALICE, 'progress'))!;
    expect(a.version).not.toBe(b.version);
  });

  it('issues URLs that work until they expire, then stop', async () => {
    const { issuer, store, clock } = setup();
    const key = newPrivateImageKey(ALICE, 'avatar');
    await store.put({ key, body: new Uint8Array([7]), contentType: 'image/webp' });
    const { url } = issuer.issue(ALICE, 'avatar', key)!;

    expect(store.fetchSigned(url)).toMatchObject({ status: 200 });
    clock.now = new Date('2026-11-20T12:14:59Z');
    expect(store.fetchSigned(url)).toMatchObject({ status: 200 });
    clock.now = new Date('2026-11-20T12:15:00Z');
    expect(store.fetchSigned(url)).toEqual({ status: 403, reason: 'expired' });
  });

  it('turns a tampered URL, or one for a missing object, into a refusal', async () => {
    const { issuer, store } = setup();
    const key = newPrivateImageKey(ALICE, 'avatar');
    const { url } = issuer.issue(ALICE, 'avatar', key)!;
    expect(store.fetchSigned(url)).toEqual({ status: 404, reason: 'missing' }); // never stored
    expect(
      store.fetchSigned(url.replace(/sig=[0-9a-f]+/, 'sig=00000000000000000000000000000000')),
    ).toMatchObject({
      status: 403,
      reason: 'bad_signature',
    });
    // Extending the expiry invalidates the signature.
    expect(store.fetchSigned(url.replace(/exp=\d+/, 'exp=99999999999'))).toMatchObject({ status: 403 });
  });
});

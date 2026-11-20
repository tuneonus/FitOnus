import { describe, expect, it } from 'vitest';
import {
  createImageUrlResolver,
  createPushImageUrlResolver,
  isLegacyNotificationImageKey,
  isNotificationImageKey,
  mediaTypeOf,
  NO_IMAGE_URLS,
  NOTIFICATION_IMAGE_KEY_PATTERN,
  requiredObjectKeys,
} from '../../../src/modules/notifications/domain/notification-image.js';
import { derivativeKey, newImageKey } from '../../../src/shared/images/image-policy.js';

const HEX = '0123456789abcdef0123456789abcdef';
const LEGACY_PNG = `notifications/${HEX}.png`;
const LEGACY_JPG = `notifications/${HEX}.jpg`;
const CANONICAL = `onusfit/notifications/${HEX}.webp`;
const PUSH = `onusfit/notifications/${HEX}.push.jpg`;

describe('isNotificationImageKey: the two shapes a campaign may hold', () => {
  it.each([CANONICAL, LEGACY_PNG, LEGACY_JPG])('accepts %s', (key) => {
    expect(isNotificationImageKey(key)).toBe(true);
  });

  it('accepts every key the policy generates for notifications', () => {
    for (let i = 0; i < 50; i += 1) expect(isNotificationImageKey(newImageKey('notifications'))).toBe(true);
  });

  it.each([
    ['an external URL', 'https://evil.example/notifications/x.png'],
    ['a URL pointing at the media domain', `https://media.tuneonus.com/${CANONICAL}`],
    ['a protocol-relative URL', `//evil.example/${CANONICAL}`],
    ['path traversal (legacy shape)', `notifications/../secrets/${HEX}.png`],
    ['path traversal (canonical shape)', `onusfit/notifications/../exercises/${HEX}.webp`],
    ['a different prefix', `uploads/${HEX}.png`],
    ['another feature under onusfit/', `onusfit/exercises/${HEX}.webp`],
    ['a nested path under the prefix', `onusfit/notifications/a/${HEX}.webp`],
    ['a leading slash', `/${CANONICAL}`],
    ['uppercase hex', `onusfit/notifications/${HEX.toUpperCase()}.webp`],
    ['a short name', `onusfit/notifications/${HEX.slice(1)}.webp`],
    ['a long name', `onusfit/notifications/${HEX}0.webp`],
    ['the push JPEG derivative (it is never saved on a campaign)', PUSH],
    ['a canonical name with a non-WebP extension', `onusfit/notifications/${HEX}.png`],
    ['a legacy name with a WebP extension', `notifications/${HEX}.webp`],
    ['an unsupported extension', `notifications/${HEX}.gif`],
    ['a HEIC name', `onusfit/notifications/${HEX}.heic`],
    ['a double extension', `onusfit/notifications/${HEX}.webp.html`],
    ['a trailing newline', `${CANONICAL}\n`],
    ['a query string', `${CANONICAL}?x=1`],
    ['an empty string', ''],
  ])('rejects %s', (_name, key) => {
    expect(isNotificationImageKey(key)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ['onusfit/notifications/x']])('rejects the non-string %j', (value) => {
    expect(isNotificationImageKey(value)).toBe(false);
  });

  it('is the same pattern the request schema and the database CHECK (migration 0022) use', () => {
    expect(NOTIFICATION_IMAGE_KEY_PATTERN.source).toContain('onusfit');
    expect(NOTIFICATION_IMAGE_KEY_PATTERN.test(CANONICAL)).toBe(true);
    expect(NOTIFICATION_IMAGE_KEY_PATTERN.test(LEGACY_JPG)).toBe(true);
  });
});

describe('isLegacyNotificationImageKey', () => {
  it.each([LEGACY_PNG, LEGACY_JPG])('is true for %s', (key) => {
    expect(isLegacyNotificationImageKey(key)).toBe(true);
  });

  it.each([CANONICAL, PUSH, '', null, 7])('is false for %j', (value) => {
    expect(isLegacyNotificationImageKey(value)).toBe(false);
  });
});

describe('requiredObjectKeys: what must exist before a notification can go out', () => {
  it('is the WebP and its push JPEG for a canonical image', () => {
    expect(requiredObjectKeys(CANONICAL)).toEqual([CANONICAL, PUSH]);
    expect(requiredObjectKeys(CANONICAL)).toEqual([CANONICAL, derivativeKey(CANONICAL, 'push')]);
  });

  it('is the one file for a legacy image', () => {
    expect(requiredObjectKeys(LEGACY_PNG)).toEqual([LEGACY_PNG]);
    expect(requiredObjectKeys(LEGACY_JPG)).toEqual([LEGACY_JPG]);
  });
});

describe('mediaTypeOf', () => {
  it.each([
    ['image/png', 'image/png'],
    ['IMAGE/PNG', 'image/png'],
    ['image/jpeg; charset=binary', 'image/jpeg'],
    ['  image/webp  ;x=1', 'image/webp'],
    ['', ''],
    [undefined, ''],
  ])('%j -> %j', (header, expected) => {
    expect(mediaTypeOf(header)).toBe(expected);
  });
});

describe('createImageUrlResolver (the only way a display URL is made)', () => {
  it('joins the trusted media origin and the key, for either key shape', () => {
    const resolve = createImageUrlResolver('https://media.example.test');
    expect(resolve(CANONICAL)).toBe(`https://media.example.test/${CANONICAL}`);
    expect(resolve(LEGACY_PNG)).toBe(`https://media.example.test/${LEGACY_PNG}`);
  });

  it('shows the stored WebP for a canonical image (the browser shows it; only the push needs a JPEG)', () => {
    expect(createImageUrlResolver('https://media.example.test')(CANONICAL)).toBe(
      `https://media.example.test/onusfit/notifications/${HEX}.webp`,
    );
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(createImageUrlResolver('https://media.example.test/')(CANONICAL)).toBe(
      `https://media.example.test/${CANONICAL}`,
    );
  });

  it('gives nothing when the media origin is not configured', () => {
    expect(createImageUrlResolver(null)(CANONICAL)).toBeNull();
  });

  it('gives nothing for no key', () => {
    expect(createImageUrlResolver('https://media.example.test')(null)).toBeNull();
  });

  it.each([
    'https://evil.example/pixel.png',
    `https://media.example.test/${CANONICAL}`,
    `notifications/../${HEX}.png`,
    PUSH,
    'javascript:alert(1)',
    '',
  ])('refuses to build a URL from the stored value %j (even if a row was edited by hand)', (stored) => {
    expect(createImageUrlResolver('https://media.example.test')(stored)).toBeNull();
  });
});

describe('createPushImageUrlResolver (the URL FCM is given)', () => {
  const resolve = createPushImageUrlResolver('https://media.example.test');

  it('is the JPEG derivative for a canonical image, because FCM only guarantees JPEG and PNG', () => {
    expect(resolve(CANONICAL)).toBe(`https://media.example.test/${PUSH}`);
  });

  it('is the original, unchanged URL for a legacy image (existing campaigns keep resolving exactly as before)', () => {
    expect(resolve(LEGACY_PNG)).toBe(`https://media.example.test/${LEGACY_PNG}`);
    expect(resolve(LEGACY_JPG)).toBe(`https://media.example.test/${LEGACY_JPG}`);
    // The same URL the display resolver gives, so a notification sent before this change and one re-sent after match.
    expect(resolve(LEGACY_PNG)).toBe(createImageUrlResolver('https://media.example.test')(LEGACY_PNG));
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(createPushImageUrlResolver('https://media.example.test/')(CANONICAL)).toBe(
      `https://media.example.test/${PUSH}`,
    );
  });

  it('gives nothing when the media origin is not configured, or there is no key', () => {
    expect(createPushImageUrlResolver(null)(CANONICAL)).toBeNull();
    expect(resolve(null)).toBeNull();
  });

  it.each([
    'https://evil.example/pixel.png',
    PUSH,
    `onusfit/exercises/${HEX}.webp`,
    'javascript:alert(1)',
    '',
  ])('refuses to build a URL from the stored value %j', (stored) => {
    expect(resolve(stored)).toBeNull();
  });

  it('never produces a WebP URL: FCM is not given the format it only partially supports', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(resolve(newImageKey('notifications'))).toMatch(/\.push\.jpg$/);
    }
  });
});

describe('NO_IMAGE_URLS', () => {
  it('never resolves anything', () => {
    expect(NO_IMAGE_URLS(CANONICAL)).toBeNull();
    expect(NO_IMAGE_URLS(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_IMAGE_KEY_PATTERN,
  DERIVATIVE_FORMAT,
  FEATURE_PROFILES,
  HEIC_MAX_PIXELS,
  IMAGE_CACHE_CONTROL,
  IMAGE_KEY_ROOT,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_PIXELS,
  IMAGE_UPLOAD_MAX_BYTES,
  PUBLIC_IMAGE_FEATURES,
  derivativeKey,
  featureOfKey,
  isAcceptedUploadContentType,
  isCanonicalImageKey,
  isPublicImageFeature,
  newImageKey,
} from '../../../src/shared/images/image-policy.js';

const HEX = '0123456789abcdef0123456789abcdef';

describe('the storage root and the features that may use it', () => {
  it('keeps everything under onusfit/', () => {
    expect(IMAGE_KEY_ROOT).toBe('onusfit');
  });

  it('has exactly the notifications and exercises features', () => {
    expect([...PUBLIC_IMAGE_FEATURES]).toEqual(['notifications', 'exercises']);
  });

  it.each(['notifications', 'exercises'])('allows %s', (feature) => {
    expect(isPublicImageFeature(feature)).toBe(true);
  });

  // The bucket is public. Whatever a member owns must never be able to name its way into it.
  it.each([
    'meals',
    'meal',
    'meal-photos',
    'food',
    'progress',
    'progress-photos',
    'avatars',
    'avatar',
    'profile',
    'profiles',
    'users',
    'user',
    'members',
    'coach',
    'chat',
    'uploads',
    'private',
    'photos',
    'selfies',
    '',
    'Notifications',
    'notifications/',
    'notifications/../users',
    '../notifications',
  ])('refuses the private or unknown feature "%s"', (feature) => {
    expect(isPublicImageFeature(feature)).toBe(false);
  });

  it.each([null, undefined, 1, {}, ['notifications']])('refuses the non-string %j', (value) => {
    expect(isPublicImageFeature(value)).toBe(false);
  });

  it('has a size profile for every feature, and only for them', () => {
    expect(Object.keys(FEATURE_PROFILES).sort()).toEqual([...PUBLIC_IMAGE_FEATURES].sort());
    for (const profile of Object.values(FEATURE_PROFILES)) {
      expect(profile.maxEdge).toBeGreaterThan(0);
      expect(profile.webpQuality).toBeGreaterThan(0);
      expect(profile.webpQuality).toBeLessThanOrEqual(100);
    }
  });
});

describe('upload limits', () => {
  it('are the documented ones', () => {
    expect(IMAGE_UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(IMAGE_MAX_DIMENSION).toBe(8192);
    expect(IMAGE_MAX_PIXELS).toBe(40_000_000);
    expect(HEIC_MAX_PIXELS).toBe(16_000_000);
  });

  it('keep HEIC (WebAssembly, memory-hungry) stricter than the other formats', () => {
    expect(HEIC_MAX_PIXELS).toBeLessThan(IMAGE_MAX_PIXELS);
  });

  it('allow a 12 megapixel phone photo in every format, HEIC included', () => {
    expect(4032 * 3024).toBeLessThanOrEqual(HEIC_MAX_PIXELS);
    expect(4032).toBeLessThanOrEqual(IMAGE_MAX_DIMENSION);
  });

  it('accept the five content types, case-insensitively not (callers lower-case first)', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      expect(isAcceptedUploadContentType(type)).toBe(true);
    }
    for (const type of [
      'image/gif',
      'image/avif',
      'image/svg+xml',
      'image/tiff',
      'image/bmp',
      'application/pdf',
      'application/octet-stream',
      'text/html',
      '',
      'IMAGE/PNG',
    ]) {
      expect(isAcceptedUploadContentType(type)).toBe(false);
    }
  });

  it('cache stored images for a year, immutable, because their names are never reused', () => {
    expect(IMAGE_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
  });
});

describe('newImageKey', () => {
  it.each(PUBLIC_IMAGE_FEATURES)(
    'puts a %s image under onusfit/%s/ as .webp with a random name',
    (feature) => {
      expect(newImageKey(feature)).toMatch(new RegExp(`^onusfit/${feature}/[0-9a-f]{32}\\.webp$`));
    },
  );

  it('is always a canonical key', () => {
    for (const feature of PUBLIC_IMAGE_FEATURES) expect(isCanonicalImageKey(newImageKey(feature))).toBe(true);
  });

  it('is unpredictable: 200 keys are all different', () => {
    expect(new Set(Array.from({ length: 200 }, () => newImageKey('notifications'))).size).toBe(200);
  });

  it('takes its randomness from the injected source (16 bytes become 32 hex characters)', () => {
    expect(newImageKey('exercises', (size) => new Uint8Array(size).fill(0xab))).toBe(
      `onusfit/exercises/${'ab'.repeat(16)}.webp`,
    );
  });

  it('carries nothing about the upload: no original name, extension, owner or date', () => {
    expect(newImageKey('notifications')).not.toMatch(/\.(jpg|jpeg|png|heic|gif)|20\d\d/i);
  });
});

describe('isCanonicalImageKey', () => {
  it.each(PUBLIC_IMAGE_FEATURES)('accepts a %s key', (feature) => {
    expect(isCanonicalImageKey(`onusfit/${feature}/${HEX}.webp`)).toBe(true);
  });

  it('can be restricted to one feature', () => {
    expect(isCanonicalImageKey(`onusfit/notifications/${HEX}.webp`, 'notifications')).toBe(true);
    expect(isCanonicalImageKey(`onusfit/notifications/${HEX}.webp`, 'exercises')).toBe(false);
    expect(isCanonicalImageKey(`onusfit/exercises/${HEX}.webp`, 'notifications')).toBe(false);
  });

  it.each([
    ['a legacy notification key', `notifications/${HEX}.jpg`],
    ['a legacy png key', `notifications/${HEX}.png`],
    ['a canonical-looking jpg', `onusfit/notifications/${HEX}.jpg`],
    ['a canonical-looking png', `onusfit/notifications/${HEX}.png`],
    ['the derivative of an image', `onusfit/notifications/${HEX}.push.jpg`],
    ['a private feature', `onusfit/avatars/${HEX}.webp`],
    ['a meal photo path', `onusfit/meals/${HEX}.webp`],
    ['a missing feature', `onusfit/${HEX}.webp`],
    ['a nested path', `onusfit/notifications/a/${HEX}.webp`],
    ['a different root', `other/notifications/${HEX}.webp`],
    ['a leading slash', `/onusfit/notifications/${HEX}.webp`],
    ['uppercase hex', `onusfit/notifications/${HEX.toUpperCase()}.webp`],
    ['a short name', `onusfit/notifications/${HEX.slice(1)}.webp`],
    ['a long name', `onusfit/notifications/${HEX}0.webp`],
    ['a double extension', `onusfit/notifications/${HEX}.webp.html`],
    ['path traversal', `onusfit/notifications/../${HEX}.webp`],
    ['a trailing newline', `onusfit/notifications/${HEX}.webp\n`],
    ['a query string', `onusfit/notifications/${HEX}.webp?x=1`],
    ['a URL', `https://media.example.test/onusfit/notifications/${HEX}.webp`],
    ['an empty string', ''],
  ])('rejects %s', (_name, key) => {
    expect(isCanonicalImageKey(key)).toBe(false);
  });

  it.each([null, undefined, 42, {}])('rejects the non-string %j', (value) => {
    expect(isCanonicalImageKey(value)).toBe(false);
  });

  it('names the feature a key belongs to', () => {
    expect(featureOfKey(`onusfit/exercises/${HEX}.webp`)).toBe('exercises');
    expect(featureOfKey(`onusfit/notifications/${HEX}.webp`)).toBe('notifications');
    expect(featureOfKey(`notifications/${HEX}.jpg`)).toBeNull();
  });

  it('shares one pattern with the keys it generates', () => {
    expect(CANONICAL_IMAGE_KEY_PATTERN.test(newImageKey('exercises'))).toBe(true);
  });
});

describe('derivativeKey', () => {
  it('puts the push JPEG next to the canonical image, named from it', () => {
    expect(derivativeKey(`onusfit/notifications/${HEX}.webp`, 'push')).toBe(
      `onusfit/notifications/${HEX}.push.jpg`,
    );
  });

  it('needs nothing stored: the same key always gives the same derivative', () => {
    const key = newImageKey('notifications');
    expect(derivativeKey(key, 'push')).toBe(derivativeKey(key, 'push'));
  });

  it('is never itself a canonical key, so it can never be saved on a campaign', () => {
    expect(isCanonicalImageKey(derivativeKey(newImageKey('notifications'), 'push'))).toBe(false);
  });

  it('refuses anything that is not a canonical key', () => {
    for (const key of [`notifications/${HEX}.jpg`, `onusfit/notifications/${HEX}.push.jpg`, 'x', '']) {
      expect(() => derivativeKey(key, 'push')).toThrow();
    }
  });
});

describe('the notification profile (FCM compatibility)', () => {
  const [push] = FEATURE_PROFILES.notifications.derivatives;

  it('asks for exactly one derivative: a JPEG for the push', () => {
    expect(FEATURE_PROFILES.notifications.derivatives).toHaveLength(1);
    expect(push?.name).toBe('push');
    expect(DERIVATIVE_FORMAT.push).toEqual({ extension: 'jpg', contentType: 'image/jpeg' });
  });

  it('keeps the push image under the 1 MB Android limit FCM documents', () => {
    expect(push!.maxBytes).toBeLessThan(1_048_576);
    expect(push!.maxBytes).toBeLessThanOrEqual(1_000_000);
  });

  it('exercises need no derivative', () => {
    expect(FEATURE_PROFILES.exercises.derivatives).toEqual([]);
  });
});

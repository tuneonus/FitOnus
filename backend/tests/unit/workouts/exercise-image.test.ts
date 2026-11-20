import { describe, expect, it } from 'vitest';
import { Exercise } from '../../../src/modules/workouts/domain/exercise.js';
import {
  displayableExternalUrl,
  effectiveImageUrl,
  EXTERNAL_URL_MAX_LENGTH,
  isExerciseImageKey,
  isHttpUrl,
  NO_EXERCISE_IMAGE_URLS,
} from '../../../src/modules/workouts/domain/exercise-image.js';
import { toExerciseView } from '../../../src/modules/workouts/application/workout-view.js';
import { createFeatureImageUrlResolver } from '../../../src/shared/images/public-image-url.js';
import { newImageKey } from '../../../src/shared/images/image-policy.js';

const HEX = '0123456789abcdef0123456789abcdef';
const KEY = `onusfit/exercises/${HEX}.webp`;
const ORIGIN = 'https://media.example.test';
const resolve = createFeatureImageUrlResolver(ORIGIN, 'exercises');

const exercise = (overrides: Partial<ConstructorParameters<typeof Exercise>[0]> = {}) =>
  new Exercise({
    id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
    name: 'Squat',
    description: null,
    instructions: ['Stand'],
    tips: [],
    commonMistakes: [],
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    equipment: 'barbell',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: true,
    imageUrl: null,
    videoUrl: null,
    createdBy: null,
    isSystem: true,
    createdAt: new Date('2026-11-20T00:00:00Z'),
    updatedAt: new Date('2026-11-20T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });

describe('isExerciseImageKey', () => {
  it('accepts every key the policy generates for exercises', () => {
    for (let i = 0; i < 50; i += 1) expect(isExerciseImageKey(newImageKey('exercises'))).toBe(true);
    expect(isExerciseImageKey(KEY)).toBe(true);
  });

  it.each([
    ['a notification key (current shape)', `onusfit/notifications/${HEX}.webp`],
    ['a legacy notification key', `notifications/${HEX}.png`],
    ['the push JPEG of a notification', `onusfit/notifications/${HEX}.push.jpg`],
    ['an exercise name with another extension', `onusfit/exercises/${HEX}.png`],
    ['an exercise derivative', `onusfit/exercises/${HEX}.push.jpg`],
    ['a URL', `https://media.example.test/${KEY}`],
    ['a protocol-relative URL', `//evil.example/${KEY}`],
    ['path traversal', `onusfit/exercises/../notifications/${HEX}.webp`],
    ['a nested path', `onusfit/exercises/a/${HEX}.webp`],
    ['a leading slash', `/${KEY}`],
    ['uppercase hex', `onusfit/exercises/${HEX.toUpperCase()}.webp`],
    ['a short name', `onusfit/exercises/${HEX.slice(1)}.webp`],
    ['a long name', `onusfit/exercises/${HEX}0.webp`],
    ['a trailing newline', `${KEY}\n`],
    ['a query string', `${KEY}?x=1`],
    ['an empty string', ''],
  ])('rejects %s', (_name, key) => {
    expect(isExerciseImageKey(key)).toBe(false);
  });

  it.each([null, undefined, 42, {}, [KEY]])('rejects the non-string %j', (value) => {
    expect(isExerciseImageKey(value)).toBe(false);
  });
});

describe('isHttpUrl: external addresses are http or https and nothing else', () => {
  it.each([
    'https://cdn.example.com/a.jpg',
    'http://insecure.example/a.jpg',
    'HTTPS://CDN.EXAMPLE.COM/A.JPG',
    'https://cdn.example.com:8443/path/a.webp?v=2#frag',
    'https://203.0.113.9/a.png',
  ])('accepts %s', (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://x.example/a.png'],
    ['blob:', 'blob:https://x.example/uuid'],
    ['a protocol-relative address', '//cdn.example.com/a.jpg'],
    ['a relative path', '/images/a.jpg'],
    ['a bare host', 'cdn.example.com/a.jpg'],
    ['http with no host', 'http://'],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['plain text', 'not a url'],
  ])('rejects %s', (_name, url) => {
    expect(isHttpUrl(url)).toBe(false);
  });

  it('rejects an address longer than the limit, and accepts one of exactly the limit', () => {
    const base = 'https://cdn.example.com/';
    expect(isHttpUrl(base + 'a'.repeat(EXTERNAL_URL_MAX_LENGTH - base.length))).toBe(true);
    expect(isHttpUrl(base + 'a'.repeat(EXTERNAL_URL_MAX_LENGTH - base.length + 1))).toBe(false);
  });

  it.each([null, undefined, 42, {}])('rejects the non-string %j', (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });
});

describe('displayableExternalUrl', () => {
  it('passes an http or https address through and hides everything else (a row saved before the rule existed)', () => {
    expect(displayableExternalUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(displayableExternalUrl('http://cdn.example.com/a.jpg')).toBe('http://cdn.example.com/a.jpg');
    expect(displayableExternalUrl('javascript:alert(1)')).toBeNull();
    expect(displayableExternalUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(displayableExternalUrl('')).toBeNull();
    expect(displayableExternalUrl(null)).toBeNull();
  });
});

describe('effectiveImageUrl: an uploaded image wins, otherwise the external address', () => {
  const external = 'https://cdn.example.com/a.jpg';

  it('uses the uploaded image when both exist', () => {
    expect(effectiveImageUrl({ imageKey: KEY, imageUrl: external }, resolve)).toBe(`${ORIGIN}/${KEY}`);
  });

  it('uses the uploaded image when it is the only one', () => {
    expect(effectiveImageUrl({ imageKey: KEY, imageUrl: null }, resolve)).toBe(`${ORIGIN}/${KEY}`);
  });

  it('uses the external address when there is no uploaded image (every exercise made before uploads)', () => {
    expect(effectiveImageUrl({ imageKey: null, imageUrl: external }, resolve)).toBe(external);
  });

  it('is null when there is neither', () => {
    expect(effectiveImageUrl({ imageKey: null, imageUrl: null }, resolve)).toBeNull();
  });

  it('falls back to the external address when the media domain is not configured (an upload has no URL then)', () => {
    expect(effectiveImageUrl({ imageKey: KEY, imageUrl: external }, NO_EXERCISE_IMAGE_URLS)).toBe(external);
    expect(
      effectiveImageUrl({ imageKey: KEY, imageUrl: null }, createFeatureImageUrlResolver(null, 'exercises')),
    ).toBeNull();
  });

  it('never shows an unsafe external address', () => {
    expect(effectiveImageUrl({ imageKey: null, imageUrl: 'javascript:alert(1)' }, resolve)).toBeNull();
  });

  it('never builds a URL from a stored value that is not an exercise key (a hand-edited row)', () => {
    expect(
      effectiveImageUrl({ imageKey: `onusfit/notifications/${HEX}.webp`, imageUrl: null }, resolve),
    ).toBeNull();
    expect(
      effectiveImageUrl({ imageKey: 'https://evil.example/x.webp', imageUrl: null }, resolve),
    ).toBeNull();
  });
});

describe('createFeatureImageUrlResolver', () => {
  it('joins the trusted origin and the key, tolerating a trailing slash on the origin', () => {
    expect(createFeatureImageUrlResolver(`${ORIGIN}/`, 'exercises')(KEY)).toBe(`${ORIGIN}/${KEY}`);
  });

  it('is specific to its feature', () => {
    expect(createFeatureImageUrlResolver(ORIGIN, 'notifications')(KEY)).toBeNull();
    expect(
      createFeatureImageUrlResolver(ORIGIN, 'exercises')(`onusfit/notifications/${HEX}.webp`),
    ).toBeNull();
  });

  it('gives nothing without a key or without an origin', () => {
    expect(resolve(null)).toBeNull();
    expect(createFeatureImageUrlResolver(null, 'exercises')(KEY)).toBeNull();
  });
});

describe('toExerciseView: the API shape the mobile app and the admin console read', () => {
  it('keeps imageUrl as "the picture to display" and adds the key and the external address beside it', () => {
    const view = toExerciseView(
      exercise({ imageKey: KEY, imageUrl: 'https://cdn.example.com/a.jpg' }),
      resolve,
    );
    expect(view.imageUrl).toBe(`${ORIGIN}/${KEY}`);
    expect(view.imageKey).toBe(KEY);
    expect(view.externalImageUrl).toBe('https://cdn.example.com/a.jpg');
  });

  it('for an exercise made before uploads existed, shows exactly what was stored (the mobile contract)', () => {
    const view = toExerciseView(exercise({ imageUrl: 'https://cdn.example.com/a.jpg' }), resolve);
    expect(view.imageUrl).toBe('https://cdn.example.com/a.jpg');
    expect(view.imageKey).toBeNull();
    expect(view.externalImageUrl).toBe('https://cdn.example.com/a.jpg');
  });

  it('works without any resolver (images not wired): the external address is shown, an upload has no URL', () => {
    const view = toExerciseView(exercise({ imageKey: KEY, imageUrl: 'https://cdn.example.com/a.jpg' }));
    expect(view.imageUrl).toBe('https://cdn.example.com/a.jpg');
    expect(view.imageKey).toBe(KEY);
  });

  it('is null throughout for an exercise without any image', () => {
    const view = toExerciseView(exercise(), resolve);
    expect([view.imageUrl, view.imageKey, view.externalImageUrl]).toEqual([null, null, null]);
  });

  it('does not pass on a non-http(s) video or image address saved before the rule existed', () => {
    const view = toExerciseView(
      exercise({ imageUrl: 'data:image/png;base64,AAAA', videoUrl: 'javascript:alert(1)' }),
      resolve,
    );
    expect(view.imageUrl).toBeNull();
    expect(view.externalImageUrl).toBeNull();
    expect(view.videoUrl).toBeNull();
  });

  it('keeps an http(s) video address as it was', () => {
    expect(toExerciseView(exercise({ videoUrl: 'https://youtu.be/abc' }), resolve).videoUrl).toBe(
      'https://youtu.be/abc',
    );
  });

  it('an Exercise built without imageKey (older construction sites) has none', () => {
    expect(exercise().imageKey).toBeNull();
  });
});

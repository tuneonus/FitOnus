import { describe, expect, it } from 'vitest';
import { FEATURE_PROFILES, isCanonicalImageKey } from '../../../src/shared/images/image-policy.js';
import {
  PRIVATE_IMAGE_PROFILES,
  PRIVATE_INTAKE_FEATURE,
  PRIVATE_INTAKE_MIN_EDGE,
  imageVersionOf,
  isOwnedPrivateImageKey,
  isPrivateObjectKey,
  newPrivateImageKey,
  parsePrivateObjectKey,
  privateObjectKeysOf,
  privateThumbnailKey,
} from '../../../src/shared/private-media/private-image-policy.js';

const ALICE = '3f2b8c1e-7d4a-4b6e-9a10-5c2d8e7f6a01';
const BOB = '9a7e5d3c-1b2f-4c8d-8e6a-0f1e2d3c4b5a';
const HEX = '0123456789abcdef0123456789abcdef';

describe('private image keys', () => {
  it('are members/<owner>/<kind>/<32 hex>.webp, chosen from random bits', () => {
    const key = newPrivateImageKey(ALICE, 'avatar', () => Buffer.from(HEX, 'hex'));
    expect(key).toBe(`members/${ALICE}/avatar/${HEX}.webp`);
    expect(newPrivateImageKey(ALICE, 'progress')).toMatch(
      new RegExp(`^members/${ALICE}/progress/[0-9a-f]{32}\\.webp$`),
    );
    expect(newPrivateImageKey(ALICE, 'avatar')).not.toBe(newPrivateImageKey(ALICE, 'avatar'));
  });

  it.each(['', 'not-a-uuid', ALICE.toUpperCase(), `${ALICE}/../${BOB}`, `${ALICE}\n`])(
    'refuse an owner id that is not a lower-case UUID (%j)',
    (owner) => {
      expect(() => newPrivateImageKey(owner, 'avatar')).toThrow();
    },
  );

  it('parse into owner, kind, token and whether it is a thumbnail', () => {
    expect(parsePrivateObjectKey(`members/${ALICE}/progress/${HEX}.webp`)).toEqual({
      ownerId: ALICE,
      kind: 'progress',
      token: HEX,
      thumbnail: false,
    });
    expect(parsePrivateObjectKey(`members/${ALICE}/progress/${HEX}.thumb.webp`)?.thumbnail).toBe(true);
  });

  it.each([
    `onusfit/exercises/${HEX}.webp`, // a PUBLIC key is never a private key
    `onusfit/notifications/${HEX}.webp`,
    `notifications/${HEX}.jpg`,
    `members/${ALICE}/avatar/${HEX}.jpg`,
    `members/${ALICE}/avatar/${HEX}.png`,
    `members/${ALICE}/other/${HEX}.webp`,
    `members/${ALICE}/avatar/${HEX.slice(1)}.webp`,
    `members/${ALICE}/avatar/${HEX}.webp/extra`,
    `members/${ALICE}/avatar/../avatar/${HEX}.webp`,
    `members//avatar/${HEX}.webp`,
    `/members/${ALICE}/avatar/${HEX}.webp`,
    `members/${ALICE}/avatar/${HEX}.thumb.thumb.webp`,
    `members/${ALICE}/avatar/${HEX}.webp\n`,
    'https://example.com/a.webp',
    null,
    undefined,
    42,
  ])('reject %j', (value) => {
    expect(isPrivateObjectKey(value)).toBe(false);
  });

  it('and public keys never look like private keys, nor the other way round', () => {
    const publicKey = `onusfit/exercises/${HEX}.webp`;
    const privateKey = `members/${ALICE}/avatar/${HEX}.webp`;
    expect(isPrivateObjectKey(publicKey)).toBe(false);
    expect(isCanonicalImageKey(privateKey)).toBe(false);
  });

  it('are owned only by the id inside them, and only as a canonical key of the right kind', () => {
    const key = `members/${ALICE}/avatar/${HEX}.webp`;
    expect(isOwnedPrivateImageKey(key, ALICE, 'avatar')).toBe(true);
    expect(isOwnedPrivateImageKey(key, BOB, 'avatar')).toBe(false);
    expect(isOwnedPrivateImageKey(key, ALICE, 'progress')).toBe(false);
    expect(isOwnedPrivateImageKey(`members/${ALICE}/avatar/${HEX}.thumb.webp`, ALICE, 'avatar')).toBe(false);
    expect(isOwnedPrivateImageKey(null, ALICE, 'avatar')).toBe(false);
  });

  it('have a thumbnail beside them, and a version that changes with every replacement', () => {
    const key = `members/${ALICE}/progress/${HEX}.webp`;
    expect(privateThumbnailKey(key)).toBe(`members/${ALICE}/progress/${HEX}.thumb.webp`);
    expect(privateObjectKeysOf(key)).toEqual([key, privateThumbnailKey(key)]);
    expect(() => privateThumbnailKey(privateThumbnailKey(key))).toThrow();
    expect(() => privateThumbnailKey(`onusfit/exercises/${HEX}.webp`)).toThrow();

    expect(imageVersionOf(key)).toBe(HEX);
    const replacement = newPrivateImageKey(ALICE, 'progress');
    expect(imageVersionOf(replacement)).not.toBe(imageVersionOf(key));
  });
});

describe('private image profiles', () => {
  it('match the documented sizes', () => {
    expect(PRIVATE_IMAGE_PROFILES.avatar).toMatchObject({ maxEdge: 400, shape: 'square' });
    expect(PRIVATE_IMAGE_PROFILES.avatar.thumbnail.size).toBe(128);
    expect(PRIVATE_IMAGE_PROFILES.progress).toMatchObject({ maxEdge: 1600, shape: 'inside' });
    expect(PRIVATE_IMAGE_PROFILES.progress.thumbnail.size).toBe(200);
  });

  it('draw from an intake profile that is big enough and has no JPEG derivative to waste', () => {
    // The private pipeline reuses the shared processor with this public profile and crops from its output. If someone
    // shrinks that profile, private pictures would silently get smaller: this fails first.
    const intake = FEATURE_PROFILES[PRIVATE_INTAKE_FEATURE];
    expect(intake.maxEdge).toBeGreaterThanOrEqual(PRIVATE_INTAKE_MIN_EDGE);
    expect(intake.maxEdge).toBeGreaterThanOrEqual(PRIVATE_IMAGE_PROFILES.progress.maxEdge);
    expect(intake.derivatives).toEqual([]);
  });
});

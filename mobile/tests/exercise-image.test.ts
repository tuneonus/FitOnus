import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExerciseImage,
  isSafeExerciseImageUrl,
  calculateResponsiveImageDimensions,
  aspectRatioFromSize,
  EXERCISE_ASSET_STANDARD,
  EXERCISE_INFOGRAPHIC_ASPECT_RATIO,
  STABLE_EXERCISE_ASSET_MAP,
} from '../src/features/workouts/utils/exercise-image';
import { exerciseById, exercises } from '../src/features/workouts/data/workoutsMock';
import { images } from '../src/shared/constants/images';

describe('Exercise-to-Image Mapping and Stable ID Resolution', () => {
  it('1. Barbell Bench Press does NOT display the Push-Up asset', () => {
    // Check both slug 'bench' and database seed UUID
    const benchSlugRes = resolveExerciseImage({ exerciseId: 'bench' });
    const benchUuidRes = resolveExerciseImage({
      exerciseId: 'e0000000-0000-4000-8000-000000000001',
    });

    // Neither should map to the Push-Up asset
    assert.notEqual(benchSlugRes.localSource, images.pushUp);
    assert.notEqual(benchUuidRes.localSource, images.pushUp);

    // Both should safely indicate fallback since no bench press asset is currently bundled
    assert.equal(benchSlugRes.isFallback, true);
    assert.equal(benchUuidRes.isFallback, true);
    assert.equal(benchSlugRes.localSource, null);
    assert.equal(benchUuidRes.localSource, null);

    // Also check workoutsMock
    const benchMock = exerciseById('bench');
    assert.equal(benchMock.name, 'Barbell Bench Press');
    assert.notEqual(benchMock.image, images.pushUp);
  });

  it('2. Push-Up exercise stably resolves to the verified Push-Up infographic', () => {
    const pushUpRes = resolveExerciseImage({ exerciseId: 'push-up' });
    assert.equal(pushUpRes.isFallback, false);
    assert.equal(pushUpRes.localSource, images.pushUp);
    assert.equal(pushUpRes.localSource, STABLE_EXERCISE_ASSET_MAP['push-up']);

    const pushUpMock = exerciseById('push-up');
    assert.equal(pushUpMock.name, 'Push-Up');
    assert.equal(pushUpMock.image, images.pushUp);
  });

  it('3. Backend uploaded imageUrl takes precedence over bundled assets and fallbacks', () => {
    const remoteUrl = 'https://media.onusfit.com/onusfit/exercises/0123456789abcdef0123456789abcdef.webp';
    const res = resolveExerciseImage({
      exerciseId: 'e0000000-0000-4000-8000-000000000001',
      imageUrl: remoteUrl,
      imageKey: 'onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
      updatedAt: '2026-11-22T08:00:00.000Z',
    });

    assert.equal(res.isFallback, false);
    assert.equal(res.uri, remoteUrl);
    assert.equal(res.localSource, null);
  });

  it('4. Mapping is strictly by stable ID, never by list index or fuzzy name match', () => {
    // Array order in mock exercises
    const firstExercise = exercises[0];
    assert.equal(firstExercise.id, 'bench');
    assert.equal(firstExercise.name, 'Barbell Bench Press');
    // First exercise is Bench Press, which must NOT map to pushUp
    assert.notEqual(firstExercise.image, images.pushUp);

    // Approximate/fuzzy names must not accidentally resolve to assets
    const fuzzy1 = resolveExerciseImage({ exerciseId: 'push' });
    const fuzzy2 = resolveExerciseImage({ exerciseId: 'press' });
    const fuzzy3 = resolveExerciseImage({ exerciseId: 'bench-press' });

    assert.equal(fuzzy1.isFallback, true);
    assert.equal(fuzzy2.isFallback, true);
    assert.equal(fuzzy3.isFallback, true);
  });

  it('5. Safe fallback when exercise ID is unknown, null, or empty', () => {
    for (const empty of [null, undefined, '', '   ', 'non-existent-uuid-9999']) {
      const res = resolveExerciseImage({ exerciseId: empty });
      assert.equal(res.isFallback, true);
      assert.equal(res.uri, null);
      assert.equal(res.localSource, null);
      assert.ok(res.cacheKey.startsWith('exercise-fallback-'));
    }
  });
});

describe('Cache Invalidation and Updating', () => {
  it('1. Cache key updates when updatedAt changes', () => {
    const remoteUrl = 'https://media.onusfit.com/onusfit/exercises/bench.webp';
    const res1 = resolveExerciseImage({
      exerciseId: 'e0000000-0000-4000-8000-000000000001',
      imageUrl: remoteUrl,
      updatedAt: '2026-11-20T10:00:00.000Z',
    });

    const res2 = resolveExerciseImage({
      exerciseId: 'e0000000-0000-4000-8000-000000000001',
      imageUrl: remoteUrl,
      updatedAt: '2026-11-22T10:00:00.000Z',
    });

    assert.notEqual(res1.cacheKey, res2.cacheKey);
    assert.ok(res1.cacheKey.includes('2026-11-20'));
    assert.ok(res2.cacheKey.includes('2026-11-22'));
  });

  it('2. Cache key updates when imageKey changes', () => {
    const remoteUrl = 'https://media.onusfit.com/onusfit/exercises/image.webp';
    const res1 = resolveExerciseImage({
      exerciseId: 'ex-1',
      imageUrl: remoteUrl,
      imageKey: 'onusfit/exercises/11111111111111111111111111111111.webp',
    });

    const res2 = resolveExerciseImage({
      exerciseId: 'ex-1',
      imageUrl: remoteUrl,
      imageKey: 'onusfit/exercises/22222222222222222222222222222222.webp',
    });

    assert.notEqual(res1.cacheKey, res2.cacheKey);
  });
});

describe('URL Safety Validation', () => {
  it('1. Allows valid https and http addresses', () => {
    assert.equal(
      isSafeExerciseImageUrl('https://media.onusfit.com/exercises/push.webp'),
      'https://media.onusfit.com/exercises/push.webp',
    );
    assert.equal(
      isSafeExerciseImageUrl('http://localhost:3000/exercises/push.webp'),
      'http://localhost:3000/exercises/push.webp',
    );
  });

  it('2. Rejects dangerous protocols and invalid strings', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'file:///etc/passwd',
      'ftp://media.onusfit.com/pic.webp',
      '/relative/path/image.webp',
      'not-a-url',
      null,
      undefined,
      12345,
      {},
    ]) {
      assert.equal(isSafeExerciseImageUrl(bad), null, `Expected rejection for: ${bad}`);
    }
  });

  it('3. Rejects absurdly long URLs exceeding 2048 chars', () => {
    const longUrl = `https://media.onusfit.com/${'a'.repeat(2100)}.webp`;
    assert.equal(isSafeExerciseImageUrl(longUrl), null);
  });
});

describe('Responsive Image Display & Asset Standard Specifications', () => {
  it('1. Preferred new asset standard is 1200 × 960 (5:4 aspect ratio)', () => {
    assert.equal(EXERCISE_ASSET_STANDARD.preferred.width, 1200);
    assert.equal(EXERCISE_ASSET_STANDARD.preferred.height, 960);
    assert.equal(EXERCISE_ASSET_STANDARD.preferred.aspectRatio, 1.25);
    assert.equal(EXERCISE_ASSET_STANDARD.preferred.format, 'image/webp');
  });

  it('2. Compatible formats include 1024 × 1024 square assets', () => {
    const square = EXERCISE_ASSET_STANDARD.compatible.find((c) => c.width === 1024);
    assert.ok(square);
    assert.equal(square.height, 1024);
    assert.equal(square.aspectRatio, 1);
  });

  it('3. Calculates responsive dimensions maintaining aspect ratio across screen widths', () => {
    // 5:4 ratio (1.25)
    const phoneWidth360 = calculateResponsiveImageDimensions(360, 5 / 4);
    assert.equal(phoneWidth360.width, 360);
    assert.equal(phoneWidth360.height, 288); // 360 / 1.25 = 288

    const phoneWidth400 = calculateResponsiveImageDimensions(400, 5 / 4);
    assert.equal(phoneWidth400.width, 400);
    assert.equal(phoneWidth400.height, 320); // 400 / 1.25 = 320

    const tabletWidth768 = calculateResponsiveImageDimensions(768, 5 / 4);
    assert.equal(tabletWidth768.width, 768);
    assert.equal(tabletWidth768.height, 614); // 768 / 1.25 = 614.4 => 614

    // 1:1 square ratio
    const squarePhone = calculateResponsiveImageDimensions(360, 1.0);
    assert.equal(squarePhone.width, 360);
    assert.equal(squarePhone.height, 360);
  });

  it('4. Content rules specify character, attire, colors, and exclusions', () => {
    const rules = EXERCISE_ASSET_STANDARD.contentRules;
    assert.ok(rules.character.includes('Man Bun'));
    assert.ok(rules.attire.includes('black athletic briefs'));
    assert.ok(rules.attire.includes('private areas'));
    assert.ok(rules.muscleColors.primary.includes('Red'));
    assert.ok(rules.muscleColors.secondary.includes('Orange'));
    assert.ok(rules.prohibited.includes('No sets, reps'));
  });

  it('5. Container width is fully coverable (100% stretch and full-bleed across screen)', () => {
    // Standard full width takes entire available container width
    const containerWidth = 390;
    const dimensions = calculateResponsiveImageDimensions(containerWidth, 5 / 4);
    assert.equal(dimensions.width, containerWidth);

    // Edge-to-edge: the full screen width is used (no negative margins, no side padding)
    const gutter = 20;
    const fullBleedWidth = containerWidth + gutter * 2;
    const fullBleedDimensions = calculateResponsiveImageDimensions(fullBleedWidth, 5 / 4);
    assert.equal(fullBleedDimensions.width, fullBleedWidth);
    assert.equal(fullBleedDimensions.height, Math.round(fullBleedWidth / (5 / 4)));
  });
});

describe('Full-width 4:5 infographic display', () => {
  it('1. 4:5 portrait (1080 x 1350) is the placeholder ratio and a supported asset format', () => {
    assert.equal(EXERCISE_INFOGRAPHIC_ASPECT_RATIO, 4 / 5);
    assert.equal(EXERCISE_INFOGRAPHIC_ASPECT_RATIO, 0.8);
    const portrait = EXERCISE_ASSET_STANDARD.compatible.find((c) => c.width === 1080);
    assert.ok(portrait);
    assert.equal(portrait.height, 1350);
    assert.equal(portrait.aspectRatio, 0.8);
  });

  it('2. aspectRatioFromSize returns the real ratio and rejects unusable sizes', () => {
    assert.equal(aspectRatioFromSize(1080, 1350), 0.8);
    assert.equal(aspectRatioFromSize(1200, 960), 1.25);
    assert.equal(aspectRatioFromSize(1024, 1024), 1);
    for (const [w, h] of [
      [0, 100],
      [100, 0],
      [-1, 100],
      [100, -1],
      [Number.NaN, 100],
      [100, Number.POSITIVE_INFINITY],
      ['1080', 1350],
      [undefined, 1350],
      [null, null],
    ] as const) {
      assert.equal(aspectRatioFromSize(w, h), null, `Expected null for ${String(w)} x ${String(h)}`);
    }
  });

  it('3. Height follows the width at 4:5 on every phone width: complete image, no crop', () => {
    for (const [width, height] of [
      [360, 450],
      [390, 488], // 487.5 rounds up
      [412, 515],
      [428, 535],
      [768, 960],
    ] as const) {
      const d = calculateResponsiveImageDimensions(width, EXERCISE_INFOGRAPHIC_ASPECT_RATIO);
      assert.equal(d.width, width, 'image uses 100% of the available width');
      assert.equal(d.height, height);
      assert.ok(Math.abs(d.width / d.height - 0.8) < 0.003, 'ratio stays 4:5 within rounding');
    }
  });

  it('4. A remote image is not assumed to be 5:4 landscape before its real size is known', () => {
    const remote = resolveExerciseImage({
      exerciseId: 'e0000000-0000-4000-8000-000000000001',
      imageUrl: 'https://media.onusfit.com/onusfit/exercises/0123456789abcdef0123456789abcdef.webp',
    });
    assert.equal(remote.aspectRatio, 0.8);
    assert.notEqual(remote.aspectRatio, EXERCISE_ASSET_STANDARD.preferred.aspectRatio);
  });
});

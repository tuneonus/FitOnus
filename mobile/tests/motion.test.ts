import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp01,
  countUpValue,
  decimalPlaces,
  motion,
  progressOffset,
  ringDashOffset,
  roundToPlaces,
  staggerDelay,
} from '../src/shared/theme/motion';
import { premium } from '../src/shared/theme/premium';
import {
  barGrowDelay,
  dashLengthFor,
  polylineLength,
} from '../src/shared/components/charts/chart-motion';

describe('motion tokens', () => {
  it('reuses the press and settle timings the app already had', () => {
    assert.equal(motion.duration.press, premium.motion.press);
    assert.equal(motion.duration.settle, premium.motion.settle);
  });

  it('keeps the pressed look Button has always had (only the easing is new)', () => {
    assert.equal(motion.press.scale, 0.98);
    assert.equal(motion.press.opacity, 0.86);
  });

  it('follows the Magic Patterns curve and base duration', () => {
    assert.deepEqual([...motion.ease], [0.23, 1, 0.32, 1]);
    assert.equal(motion.duration.base, 220);
  });

  it('uses the four springs of the design system', () => {
    assert.deepEqual(motion.spring.default, { damping: 15, stiffness: 150, mass: 1 });
    assert.deepEqual(motion.spring.snappy, { damping: 20, stiffness: 300, mass: 0.8 });
    assert.deepEqual(motion.spring.gentle, { damping: 20, stiffness: 100, mass: 1 });
    assert.deepEqual(motion.spring.bouncy, { damping: 10, stiffness: 150, mass: 0.8 });
  });

  it('never lets the count-up exceed 600 ms and keeps every duration a positive whole number', () => {
    assert.ok(motion.duration.countUp <= 600);
    for (const [name, ms] of Object.entries(motion.duration)) {
      assert.ok(Number.isInteger(ms) && ms > 0, `${name} must be a positive integer, got ${ms}`);
    }
  });

  it('exits faster than it enters, so the interface never seems to wait', () => {
    assert.ok(motion.duration.exit < motion.duration.base);
  });

  it('keeps entrances subtle', () => {
    assert.ok(motion.rise <= 12);
  });
});

describe('clamp01', () => {
  it('limits to 0..1 and treats NaN as 0', () => {
    assert.equal(clamp01(-3), 0);
    assert.equal(clamp01(0.4), 0.4);
    assert.equal(clamp01(7), 1);
    assert.equal(clamp01(Number.NaN), 0);
    assert.equal(clamp01(Infinity), 1);
    assert.equal(clamp01(-Infinity), 0);
  });
});

describe('staggerDelay', () => {
  it('steps by 50 ms per sibling from the base delay', () => {
    assert.equal(staggerDelay(0), 0);
    assert.equal(staggerDelay(1), 50);
    assert.equal(staggerDelay(3, 60), 210);
  });

  it('stops growing after the eighth item so a long list never makes the last rows wait', () => {
    assert.equal(staggerDelay(7), 350);
    assert.equal(staggerDelay(8), 350);
    assert.equal(staggerDelay(200), 350);
  });

  it('is safe for nonsense input', () => {
    assert.equal(staggerDelay(-4), 0);
    assert.equal(staggerDelay(Number.NaN), 0);
    assert.equal(staggerDelay(2.9), 100);
    assert.equal(staggerDelay(0, -50), 0);
  });
});

describe('decimalPlaces and roundToPlaces', () => {
  it('finds the precision a number needs, up to 3', () => {
    assert.equal(decimalPlaces(12), 0);
    assert.equal(decimalPlaces(12.5), 1);
    assert.equal(decimalPlaces(12.25), 2);
    assert.equal(decimalPlaces(0.125), 3);
    assert.equal(decimalPlaces(1 / 3), 3);
    assert.equal(decimalPlaces(Number.NaN), 0);
    assert.equal(decimalPlaces(Infinity), 0);
  });

  it('rounds to that many decimals', () => {
    assert.equal(roundToPlaces(12.3456, 0), 12);
    assert.equal(roundToPlaces(12.3456, 2), 12.35);
    assert.equal(roundToPlaces(0.5, 0), 1);
  });
});

describe('countUpValue', () => {
  it('starts at 0 and lands on the target exactly, whatever its precision', () => {
    for (const target of [0, 45, 12450, 12450.37, 0.125, 83.25]) {
      const places = decimalPlaces(target);
      assert.equal(countUpValue(target, 0, places), 0);
      assert.equal(countUpValue(target, 1, places), target);
      assert.equal(countUpValue(target, 4, places), target);
    }
  });

  it('shows whole numbers on the way to a whole target', () => {
    for (let step = 0; step <= 20; step += 1) {
      assert.ok(Number.isInteger(countUpValue(12450, step / 20, 0)));
    }
  });

  it('keeps the target precision on the way to a decimal target', () => {
    const value = countUpValue(83.25, 0.37, 2);
    assert.equal(value, roundToPlaces(value, 2));
  });

  it('never goes backwards', () => {
    for (const target of [45, 12450, 83.25]) {
      const places = decimalPlaces(target);
      let previous = -1;
      for (let step = 0; step <= 100; step += 1) {
        const value = countUpValue(target, step / 100, places);
        assert.ok(value >= previous, `${target}: ${value} < ${previous} at step ${step}`);
        previous = value;
      }
    }
  });

  it('is safe for nonsense progress', () => {
    assert.equal(countUpValue(50, -2, 0), 0);
    assert.equal(countUpValue(50, Number.NaN, 0), 0);
  });
});

describe('progressOffset', () => {
  it('shows exactly the requested share of the track', () => {
    assert.equal(progressOffset(1, 300), 0);
    assert.equal(progressOffset(0, 300), -300);
    assert.equal(progressOffset(0.5, 300), -150);
    assert.equal(progressOffset(0.25, 200), -150);
  });

  it('clamps progress and ignores a negative width', () => {
    assert.equal(progressOffset(2, 300), 0);
    assert.equal(progressOffset(-1, 300), -300);
    assert.ok(progressOffset(0.5, -40) === 0);
  });
});

describe('ringDashOffset', () => {
  it('leaves the requested share of the ring drawn', () => {
    assert.equal(ringDashOffset(200, 0), 200);
    assert.equal(ringDashOffset(200, 1), 0);
    assert.equal(ringDashOffset(200, 0.25), 150);
  });

  it('clamps progress', () => {
    assert.equal(ringDashOffset(200, 3), 0);
    assert.equal(ringDashOffset(200, -1), 200);
  });
});

describe('chart drawing helpers', () => {
  it('measures a polyline by its segments', () => {
    assert.equal(polylineLength([]), 0);
    assert.equal(polylineLength([{ x: 1, y: 1 }]), 0);
    assert.equal(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
      5,
    );
    assert.equal(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
      11,
    );
  });

  it('gives the dash a little more than the true length, so a finished line has no gap at its end', () => {
    assert.ok(dashLengthFor(100) > 100);
    assert.equal(dashLengthFor(0), 0);
  });

  it('staggers bars by 25 ms but never longer than 300 ms in total', () => {
    assert.equal(barGrowDelay(0), 0);
    assert.equal(barGrowDelay(4), 100);
    assert.equal(barGrowDelay(12), 300);
    assert.equal(barGrowDelay(60), 300);
    assert.equal(barGrowDelay(-3), 0);
  });
});

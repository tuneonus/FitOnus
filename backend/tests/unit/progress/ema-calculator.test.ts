import { describe, expect, it } from 'vitest';
import { calculateEma } from '../../../src/modules/progress/domain/ema-calculator.js';

describe('EMA Calculator', () => {
  it('returns empty array when input is empty', () => {
    expect(calculateEma([])).toEqual([]);
  });

  it('returns single point unmodified for array of length 1', () => {
    const input = [{ label: 'Mon', value: 80.0 }];
    const result = calculateEma(input);
    expect(result).toEqual([{ label: 'Mon', value: 80.0 }]);
  });

  it('calculates standard exponential moving average with alpha = 0.1', () => {
    const input = [
      { label: 'Day 1', value: 80.0 },
      { label: 'Day 2', value: 79.0 },
      { label: 'Day 3', value: 78.0 },
    ];
    // Day 1: 80.0
    // Day 2: 79.0 * 0.1 + 80.0 * 0.9 = 7.9 + 72.0 = 79.9
    // Day 3: 78.0 * 0.1 + 79.9 * 0.9 = 7.8 + 71.91 = 79.71 -> 79.7
    const result = calculateEma(input, { alpha: 0.1, decimals: 1 });
    expect(result).toEqual([
      { label: 'Day 1', value: 80.0 },
      { label: 'Day 2', value: 79.9 },
      { label: 'Day 3', value: 79.7 },
    ]);
  });

  it('filters out sharp daily spikes effectively', () => {
    const input = [
      { label: 'Day 1', value: 75.0 },
      { label: 'Day 2', value: 75.0 },
      { label: 'Day 3', value: 78.0 }, // 3 kg water weight spike
      { label: 'Day 4', value: 75.0 },
    ];
    const result = calculateEma(input, { alpha: 0.1, decimals: 1 });
    // Day 3 EMA only rises slightly from 75.0 to 75.3 rather than jumping to 78.0
    expect(result[2]?.value).toBe(75.3);
    // Day 4 returns toward 75.3
    expect(result[3]?.value).toBe(75.3);
  });

  it('handles custom alpha and custom decimal places', () => {
    const input = [
      { label: 'W1', value: 80.0 },
      { label: 'W2', value: 75.0 },
    ];
    // With alpha = 0.5: 75 * 0.5 + 80 * 0.5 = 77.5
    const result = calculateEma(input, { alpha: 0.5, decimals: 2 });
    expect(result[1]?.value).toBe(77.5);
  });
});

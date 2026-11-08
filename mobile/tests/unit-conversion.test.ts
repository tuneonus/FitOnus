import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  kgToLb,
  lbToKg,
  formatWeight,
  parseWeightInputToKg,
  cmToInches,
  inchesToCm,
  cmToFtIn,
  ftInToCm,
  formatHeight,
  parseHeightInputToCm,
} from '../src/shared/utils/unit-conversion';

describe('Unit Conversion: Weight (kg ↔ lb)', () => {
  it('converts kg to lb accurately', () => {
    // 70 kg * 2.20462... ~ 154.3 lb
    const lb = kgToLb(70);
    assert.equal(lb, 154.3);

    // 100 kg ~ 220.5 lb
    assert.equal(kgToLb(100), 220.5);

    // 0 kg, negative, or invalid returns null
    assert.equal(kgToLb(0), null);
    assert.equal(kgToLb(-10), null);
    assert.equal(kgToLb(null), null);
    assert.equal(kgToLb(undefined), null);
    assert.equal(kgToLb(NaN), null);
  });

  it('converts lb to kg accurately', () => {
    // 154.32 lb * 0.453592... ~ 70.0 kg
    const kg = lbToKg(154.32);
    assert.equal(kg, 70.0);

    // 200 lb ~ 90.7 kg
    assert.equal(lbToKg(200), 90.7);

    // invalid inputs return null
    assert.equal(lbToKg(0), null);
    assert.equal(lbToKg(-5), null);
    assert.equal(lbToKg(null), null);
    assert.equal(lbToKg(undefined), null);
  });

  it('formats weight correctly according to target unit system', () => {
    assert.equal(formatWeight(75.5, 'metric'), '75.5 kg');
    assert.equal(formatWeight(75.5, 'imperial'), '166.4 lb');

    // Without unit suffix
    assert.equal(formatWeight(75.5, 'metric', { includeUnit: false }), '75.5');
    assert.equal(formatWeight(75.5, 'imperial', { includeUnit: false }), '166.4');

    // Nullish and invalid values return fallback
    assert.equal(formatWeight(null, 'metric'), '—');
    assert.equal(formatWeight(undefined, 'imperial'), '—');
    assert.equal(formatWeight(0, 'metric', { fallback: 'No weight' }), 'No weight');
  });

  it('parses weight inputs back to canonical metric kg', () => {
    assert.equal(parseWeightInputToKg(75.5, 'metric'), 75.5);
    assert.equal(parseWeightInputToKg(' 82.4 ', 'metric'), 82.4);

    // Imperial parsing: 165 lb ~ 74.84 kg
    const parsedKg = parseWeightInputToKg('165', 'imperial');
    assert.ok(parsedKg !== null);
    assert.equal(Math.round(parsedKg * 10) / 10, 74.8);

    // Invalid inputs
    assert.equal(parseWeightInputToKg('', 'metric'), null);
    assert.equal(parseWeightInputToKg('abc', 'metric'), null);
    assert.equal(parseWeightInputToKg(-5, 'imperial'), null);
    assert.equal(parseWeightInputToKg(null, 'metric'), null);
  });
});

describe('Unit Conversion: Height (cm ↔ ft/in)', () => {
  it('converts cm to inches accurately', () => {
    const inches = cmToInches(178);
    assert.ok(inches !== null);
    assert.equal(Math.round(inches * 10) / 10, 70.1);

    assert.equal(cmToInches(0), null);
    assert.equal(cmToInches(-150), null);
    assert.equal(cmToInches(null), null);
  });

  it('converts inches to cm accurately', () => {
    assert.equal(inchesToCm(70), 177.8);
    assert.equal(inchesToCm(0), null);
    assert.equal(inchesToCm(null), null);
  });

  it('converts cm to feet and inches accurately', () => {
    // 178 cm is ~70.08 inches -> 5 feet 10 inches
    const ftIn1 = cmToFtIn(178);
    assert.deepEqual(ftIn1, { feet: 5, inches: 10 });

    // 183 cm is ~72.05 inches -> 6 feet 0 inches
    const ftIn2 = cmToFtIn(183);
    assert.deepEqual(ftIn2, { feet: 6, inches: 0 });

    // 165 cm is ~64.96 inches -> 5 feet 5 inches
    const ftIn3 = cmToFtIn(165);
    assert.deepEqual(ftIn3, { feet: 5, inches: 5 });

    assert.equal(cmToFtIn(null), null);
    assert.equal(cmToFtIn(0), null);
  });

  it('converts feet and inches back to cm accurately', () => {
    // 5 ft 10 in = 70 in -> 177.8 cm
    assert.equal(ftInToCm(5, 10), 177.8);

    // 6 ft 0 in = 72 in -> 182.9 cm
    assert.equal(ftInToCm(6, 0), 182.9);

    assert.equal(ftInToCm(0, 0), null);
    assert.equal(ftInToCm(null, null), null);
  });

  it('formats height correctly according to unit system', () => {
    assert.equal(formatHeight(178, 'metric'), '178 cm');
    assert.equal(formatHeight(178, 'imperial'), '5 ft 10 in');
    assert.equal(formatHeight(178, 'imperial', { compactImperial: true }), "5' 10\"");

    assert.equal(formatHeight(null, 'metric'), '—');
    assert.equal(formatHeight(undefined, 'imperial'), '—');
    assert.equal(formatHeight(0, 'metric', { fallback: 'N/A' }), 'N/A');
  });

  it('parses height input back to canonical cm', () => {
    assert.equal(parseHeightInputToCm({ cm: 180 }, 'metric'), 180);
    assert.equal(parseHeightInputToCm({ cm: ' 175.5 ' }, 'metric'), 175.5);

    // Imperial parsing: 5 ft 10 in -> 177.8 cm
    assert.equal(parseHeightInputToCm({ feet: 5, inches: 10 }, 'imperial'), 177.8);
    assert.equal(parseHeightInputToCm({ feet: '6', inches: '0' }, 'imperial'), 182.9);

    assert.equal(parseHeightInputToCm({ cm: null }, 'metric'), null);
    assert.equal(parseHeightInputToCm({ cm: 'bad' }, 'metric'), null);
  });
});

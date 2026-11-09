import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHomeNutrition,
  localDateKey,
  progressRatio,
} from '../src/features/home/utils/home-overview';
import type { DailyNutritionView, MealEntry } from '../src/features/nutrition/types/nutrition';
import { Colors } from '../src/constants/theme';
import { colorTokens, darkColorTokens } from '../src/shared/theme/tokens';

const date = '2026-11-09';
const daily: DailyNutritionView = {
  date,
  targets: { calories: 2000, proteinG: 130, carbsG: 250, fatG: 65, waterMl: 2400 },
  consumed: { calories: 750, proteinG: 40, carbsG: 90, fatG: 25, fiberG: 10, waterMl: 750 },
  remaining: null,
  meals: [],
};
const entry: MealEntry = {
  id: 'offline-meal',
  date,
  meal: 'lunch',
  time: '12:30',
  method: 'manual',
  isSynced: false,
  items: [
    {
      id: 'test-food',
      name: 'Test meal',
      serving: '1 serving',
      kcal: 250,
      protein: 20,
      carbs: 30,
      fat: 5,
      fiber: 4,
    },
  ],
};
const input = {
  date,
  summary: daily,
  cachedSummary: null,
  entries: [] as MealEntry[],
  selectedDate: date,
  waterMl: 0,
};

describe('Premium Home: daily data fidelity', () => {
  it('does not manufacture metrics or goals when there is no daily data', () => {
    const result = buildHomeNutrition({ ...input, summary: null });
    assert.equal(result.available, false);
    assert.equal(result.totals.kcal, null);
    assert.equal(result.totals.protein, null);
    assert.equal(result.goals.kcal, null);
    assert.equal(result.goals.waterMl, null);
    assert.equal(result.waterMl, null);
  });
  it('preserves genuine zero totals from a loaded empty day', () => {
    const result = buildHomeNutrition({
      ...input,
      summary: {
        ...daily,
        consumed: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, waterMl: 0 },
      },
    });
    assert.equal(result.available, true);
    assert.equal(result.totals.kcal, 0);
    assert.equal(result.waterMl, 0);
    assert.equal(result.remaining, 2000);
  });
  it('uses exact API targets and consumed values', () => {
    const result = buildHomeNutrition(input);
    assert.equal(result.totals.kcal, 750);
    assert.equal(result.totals.protein, 40);
    assert.equal(result.goals.protein, 130);
    assert.equal(result.goals.waterMl, 2400);
    assert.equal(result.remaining, 1250);
  });
  it('does not display yesterday’s cache as today’s data', () => {
    const result = buildHomeNutrition({
      ...input,
      summary: { ...daily, date: '2026-11-08' },
      cachedSummary: { ...daily, date: '2026-11-08' },
      selectedDate: '2026-11-08',
      waterMl: 2000,
    });
    assert.equal(result.available, false);
    assert.equal(result.waterMl, null);
  });
  it('shows same-day cached data when the network is unavailable', () => {
    const result = buildHomeNutrition({
      ...input,
      summary: null,
      cachedSummary: daily,
      waterMl: 750,
    });
    assert.equal(result.totals.kcal, 750);
    assert.equal(result.waterMl, 750);
  });
  it('includes unsynced meals exactly once without adding confirmed store entries', () => {
    const result = buildHomeNutrition({
      ...input,
      entries: [entry, { ...entry, id: 'synced', isSynced: true }],
    });
    assert.equal(result.totals.kcal, 1000);
    assert.equal(result.totals.protein, 60);
    assert.equal(result.pendingMeals, 1);
  });
  it('does not double count an offline meal already returned by the server', () => {
    const result = buildHomeNutrition({
      ...input,
      summary: { ...daily, meals: [{ id: entry.id } as DailyNutritionView['meals'][number]] },
      entries: [entry],
    });
    assert.equal(result.totals.kcal, 750);
    assert.equal(result.pendingMeals, 0);
  });
  it('filters explicit historical dates even when the diary is on today', () => {
    const result = buildHomeNutrition({ ...input, entries: [{ ...entry, date: '2026-11-08' }] });
    assert.equal(result.totals.kcal, 750);
  });
  it('shows local offline meal values without inventing goals or complete server totals', () => {
    const result = buildHomeNutrition({ ...input, summary: null, entries: [entry] });
    assert.equal(result.totals.kcal, 250);
    assert.equal(result.goals.kcal, null);
    assert.equal(result.sourceLabel, 'Saved on this device');
  });
  it('keeps optimistic water additions visible during an older query refetch', () => {
    const result = buildHomeNutrition({ ...input, cachedSummary: daily, waterMl: 1250 });
    assert.equal(result.waterMl, 1250);
  });
  it('ignores water from a historical diary selection', () => {
    const result = buildHomeNutrition({ ...input, selectedDate: '2026-11-08', waterMl: 3000 });
    assert.equal(result.waterMl, 750);
  });
  it('preserves over-goal values and treats missing or zero targets as unset', () => {
    const result = buildHomeNutrition({
      ...input,
      summary: {
        ...daily,
        targets: { calories: 500, proteinG: null, carbsG: 0, fatG: 65, waterMl: null },
      },
    });
    assert.equal(result.remaining, -250);
    assert.equal(result.goals.protein, null);
    assert.equal(result.goals.carbs, null);
    assert.equal(progressRatio(750, 500), 1);
  });
  it('keeps progress finite for unknown, zero, negative, or invalid values', () => {
    for (const [value, goal] of [
      [null, 100],
      [50, null],
      [50, 0],
      [-10, 100],
      [NaN, 100],
      [10, Infinity],
    ] as const) {
      assert.equal(progressRatio(value, goal), 0);
    }
    assert.equal(progressRatio(25, 100), 0.25);
  });
  it('uses the local calendar instead of a UTC date slice', () => {
    const localMorning = new Date(2026, 10, 9, 0, 10);
    assert.equal(localDateKey(localMorning), date);
  });
});

function luminance(hex: string): number {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const channel = parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

describe('Premium Home: readable semantic palette', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: small text meets 4.5:1 contrast on its intended surfaces`, () => {
      const colors = Colors[mode];
      for (const [ink, background] of [
        [colors.ink, colors.bg],
        [colors.muted, colors.bg],
        [colors.muted, colors.surface],
        [colors.ink, colors.surface2],
        [colors.muted, colors.surface2],
        [colors.heroInk, colors.hero],
        [colors.heroMuted, colors.hero],
        [colors.accent, colors.hero],
        [colors.accentInk, colors.accent],
        [colors.accentStrong, colors.surface2],
      ]) {
        const a = luminance(ink),
          b = luminance(background);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(ratio >= 4.5, `${ink} on ${background}: ${ratio.toFixed(2)}:1`);
      }
    });
    it(`${mode}: existing theme exports agree on the palette`, () => {
      const tokens = mode === 'light' ? colorTokens : darkColorTokens;
      const colors = Colors[mode];
      assert.equal(colors.bg, tokens.background);
      assert.equal(colors.accent, tokens.primary);
      assert.equal(colors.hero, tokens.hero);
      assert.equal(colors.ink, tokens.text);
      assert.equal(colors.muted, tokens.mutedText);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { nutritionSummarySchema } from '../../../src/modules/dashboard/interface/dashboard.schemas.js';

// The dashboard no longer has a formula of its own: its goals come from `resolveDailyTargets`
// (tests/unit/profile/daily-targets.test.ts), the same resolver the nutrition diary uses.

describe('dashboard response schema', () => {
  const nutrition = {
    calories: 1200,
    caloriesGoal: 2259,
    protein: 80,
    proteinGoal: 141,
    carbs: 100,
    carbsGoal: 282,
    fat: 40,
    fatGoal: 63,
  };

  it('carries targetsSource through to clients', () => {
    const parsed = nutritionSummarySchema.parse({ ...nutrition, targetsSource: 'estimated' });

    expect(parsed.targetsSource).toBe('estimated');
  });

  it('stays valid without targetsSource, so existing payloads and clients are unaffected', () => {
    expect(nutritionSummarySchema.parse(nutrition).targetsSource).toBeUndefined();
  });

  it('rejects an unknown source', () => {
    expect(nutritionSummarySchema.safeParse({ ...nutrition, targetsSource: 'guess' }).success).toBe(false);
  });
});

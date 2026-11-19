import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildDeterministicInsights,
  buildWelcomeInsights,
  hasSufficientInsightsData,
} from '../../../src/modules/coach/domain/coach-insights.js';
import type { CoachInsightsResponse, UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';

/**
 * The deterministic insights and the welcome answer moved out of the former GeminiCoachInsightsService
 * unchanged. The fixture holds what that service returned (generatedAt normalised) for nine synthetic
 * contexts in every language, both when the model failed and when its reply was unusable.
 */
interface Case {
  name: string;
  context: UserFitnessContext;
  lang: string | null;
  expectedOnModelError: CoachInsightsResponse;
  expectedOnUnusableReply: CoachInsightsResponse;
}
const CASES = JSON.parse(
  readFileSync(new URL('../../fixtures/coach-insights/deterministic_cases.json', import.meta.url), 'utf8'),
) as Case[];

const normalise = (r: CoachInsightsResponse) => ({ ...r, generatedAt: 'GENERATED_AT' });
/** What the old service returned when it could not use the model: welcome for no data, else deterministic. */
const fallbackFor = (context: UserFitnessContext, lang?: string) =>
  hasSufficientInsightsData(context) ? buildDeterministicInsights(context, lang) : buildWelcomeInsights(context, lang);

describe('coach insights rules that stay in Node', () => {
  it('the corpus covers every context and language', () => {
    expect(CASES).toHaveLength(45);
    expect(new Set(CASES.map((c) => c.lang))).toEqual(new Set(['en', 'ta', 'tanglish', null, 'fr']));
    expect(CASES.some((c) => c.name.startsWith('I_insufficient'))).toBe(true);
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s: identical to what the Node Gemini service returned', (_name, c) => {
    const actual = normalise(fallbackFor(c.context, c.lang ?? undefined));
    expect(actual).toEqual(c.expectedOnModelError);
    expect(actual).toEqual(c.expectedOnUnusableReply);
  });

  it('a user with no data gets the welcome answer (never an AI call), in all three languages', () => {
    const empty = CASES.find((c) => c.name === 'I_insufficient__en')!.context;
    expect(hasSufficientInsightsData(empty)).toBe(false);
    expect(buildWelcomeInsights(empty, 'en')).toMatchObject({ greeting: 'Welcome, Anu!', insights: [], hasSufficientData: false });
    expect(buildWelcomeInsights(empty, 'tanglish').greeting).toBe('Vanakkam, Anu!');
    expect(buildWelcomeInsights(empty, 'ta').greeting).toBe('வணக்கம், Anu!');
  });

  it.each([
    ['a workout', { recentWorkouts: [{ name: 'x' }] }],
    ['calories', { todayNutrition: { caloriesConsumed: 1 } }],
    ['water', { todayNutrition: { waterIntakeMl: 1 } }],
    ['a weight', { latestWeightKg: 70 }],
    ['a goal', { activeGoals: [{ title: 'g' }] }],
    ['a planned workout', { todayPlannedWorkout: { name: 'p' } }],
  ])('any real data (%s) is sufficient', (_name, patch) => {
    const empty = CASES.find((c) => c.name === 'I_insufficient__en')!.context;
    const context = { ...empty, ...patch, todayNutrition: { ...empty.todayNutrition, ...(patch as any).todayNutrition } } as UserFitnessContext;
    expect(hasSufficientInsightsData(context)).toBe(true);
  });

  it('deterministic insights are always valid for the public schema values', () => {
    for (const c of CASES.filter((x) => hasSufficientInsightsData(x.context))) {
      const r = buildDeterministicInsights(c.context, c.lang ?? undefined);
      expect(r.hasSufficientData).toBe(true);
      for (const item of r.insights) {
        expect(['workout', 'nutrition', 'hydration', 'goal', 'recovery']).toContain(item.category);
        expect(item.id.startsWith('ins-det-')).toBe(true);
      }
    }
  });
});

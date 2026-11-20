import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '../../../src/shared/application/unit-of-work.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import {
  Food,
  Meal,
  MealItem,
  UpdateMealUseCase,
  reuseStoredItem,
  type IFoodRepository,
  type IMealRepository,
} from '../../../src/modules/nutrition/index.js';
import { updateMealRequest } from '../../../src/modules/nutrition/interface/nutrition.schemas.js';

const userId = '11111111-1111-4111-8111-111111111111';
const mealId = '22222222-2222-4222-8222-222222222222';
const eggFoodId = 'f0000000-0000-4000-8000-000000000002';
const riceFoodId = 'f0000000-0000-4000-8000-000000000004';
const eggItemId = 'aaaaaaaa-0000-4000-8000-000000000001';
const riceItemId = 'aaaaaaaa-0000-4000-8000-000000000002';
const aiItemId = 'aaaaaaaa-0000-4000-8000-000000000003';

/** The egg as the catalog describes it TODAY: an admin has since corrected it from 143 to 200 kcal per 100 g. */
const catalogEggToday = new Food({
  id: eggFoodId,
  name: 'Egg, whole, raw',
  brand: null,
  barcode: null,
  servingSize: 1,
  servingUnit: 'piece',
  servingWeightG: 50,
  servingBasis: '100g',
  calories: 200,
  proteinG: 20,
  carbohydratesG: 1,
  fatG: 12,
  fiberG: 0,
  dataSource: 'usda_fdc',
  sourceId: '171287',
  isCustom: false,
  isVerified: true,
  verificationStatus: 'verified',
  createdBy: null,
});

/** Two eggs logged when the catalog still said 143 kcal per 100 g: 100 g, 143 kcal. */
const storedEggs = () =>
  new MealItem({
    id: eggItemId,
    mealId,
    foodId: eggFoodId,
    foodName: 'Egg, whole, raw',
    foodBrand: null,
    servingSize: 1,
    servingUnit: 'piece',
    servingWeightG: 50,
    servingMultiplier: 2,
    loggedWeightG: 100,
    calories: 143,
    proteinG: 12.56,
    carbsG: 0.72,
    fatG: 9.51,
    fiberG: 0,
    createdAt: new Date('2026-11-05T08:00:00Z'),
  });

const storedRice = () =>
  new MealItem({
    id: riceItemId,
    mealId,
    foodId: riceFoodId,
    foodName: 'Rice',
    foodBrand: null,
    servingSize: 1,
    servingUnit: 'cup',
    servingWeightG: 150,
    servingMultiplier: 1,
    loggedWeightG: 150,
    calories: 195,
    proteinG: 4,
    carbsG: 42,
    fatG: 0.5,
    fiberG: 1,
    createdAt: new Date('2026-11-05T08:00:01Z'),
  });

/** An AI estimate: no catalog food, numbers come from the model. 150 g portion, 248 kcal. */
const storedAiChicken = () =>
  new MealItem({
    id: aiItemId,
    mealId,
    foodId: null,
    foodName: 'Grilled Chicken Breast',
    foodBrand: 'AI Estimate',
    servingSize: 1,
    servingUnit: 'fillet',
    servingWeightG: 150,
    servingMultiplier: 1,
    loggedWeightG: 150,
    calories: 248,
    proteinG: 46.5,
    carbsG: 0,
    fatG: 5.4,
    fiberG: 0,
    createdAt: new Date('2026-11-05T08:00:02Z'),
  });

describe('reuseStoredItem: an edit never re-prices what was logged', () => {
  it('returns the stored item itself when the portion is unchanged, ignoring client-sent numbers', () => {
    const stored = storedEggs();
    const kept = reuseStoredItem(stored, {
      foodId: eggFoodId,
      servingMultiplier: 2,
      // A client may send rounded or even wrong numbers; an unchanged portion must not pick them up.
      calories: 143.4,
      proteinG: 99,
    });
    expect(kept).toBe(stored);
  });

  it('treats a weight within the stored 2-decimal precision as the same portion', () => {
    const stored = storedEggs();
    expect(reuseStoredItem(stored, { foodId: eggFoodId, servingMultiplier: 2, loggedWeightG: 100.004 })).toBe(
      stored,
    );
  });

  it("scales the stored snapshot, not today's catalog row, when the portion changes", () => {
    const scaled = reuseStoredItem(storedEggs(), { foodId: eggFoodId, servingMultiplier: 3 })!;
    // 3 eggs = 150 g = 1.5 x the logged 100 g. From the snapshot: 143 x 1.5. From today's catalog it would be 300.
    expect(scaled.loggedWeightG).toBe(150);
    expect(scaled.servingMultiplier).toBe(3);
    expect(scaled.calories).toBe(214.5);
    expect(scaled.proteinG).toBe(18.84);
    expect(scaled.id).toBe(eggItemId);
    expect(scaled.createdAt).toEqual(new Date('2026-11-05T08:00:00Z'));
  });

  it('uses loggedWeightG over the multiplier when both are sent (weight-driven portions stay exact)', () => {
    const scaled = reuseStoredItem(storedEggs(), {
      foodId: eggFoodId,
      servingMultiplier: 1.5,
      loggedWeightG: 75,
    })!;
    expect(scaled.loggedWeightG).toBe(75);
    expect(scaled.calories).toBe(107.3); // 143 x 0.75 = 107.25 -> one decimal
  });

  it('scales an AI estimate (no catalog food) proportionally and keeps its brand label', () => {
    const scaled = reuseStoredItem(storedAiChicken(), { foodId: null, servingMultiplier: 1.5 })!;
    expect(scaled.loggedWeightG).toBe(225);
    expect(scaled.calories).toBe(372);
    expect(scaled.foodBrand).toBe('AI Estimate');
  });

  it('absolute multipliers compose: 2x then 1.5x of the base is 3x, matching the UI', () => {
    // The UI multiplies the CURRENT portion: a meal at 2x, edited by 1.5x, is saved as 2 x 1.5 = 3x absolute.
    const atTwo = storedEggs();
    const relative = 1.5;
    const absolute = atTwo.servingMultiplier * relative;
    const result = reuseStoredItem(atTwo, { foodId: eggFoodId, servingMultiplier: absolute })!;
    expect(result.servingMultiplier).toBe(3);
    expect(result.loggedWeightG).toBe(150);
    expect(result.calories).toBe(214.5);

    // And editing again from 3x by 0.5 lands on 1.5x of the base (75 g), again from the stored snapshot.
    const back = reuseStoredItem(result, {
      foodId: eggFoodId,
      servingMultiplier: result.servingMultiplier * 0.5,
    })!;
    expect(back.loggedWeightG).toBe(75);
    expect(back.calories).toBe(107.3);
  });

  it('returns null for a different food: that is a replacement, not an edit', () => {
    expect(reuseStoredItem(storedEggs(), { foodId: riceFoodId, servingMultiplier: 2 })).toBeNull();
    expect(reuseStoredItem(storedEggs(), { foodId: null, servingMultiplier: 2 })).toBeNull();
  });

  it('keeps the stored multiplier positive when a tiny portion of a huge serving would round to 0.00', () => {
    const huge = new MealItem({
      id: eggItemId,
      mealId,
      foodId: null,
      foodName: 'Bulk oats',
      servingSize: 1,
      servingUnit: 'bag',
      servingWeightG: 5000,
      servingMultiplier: 1,
      loggedWeightG: 5000,
      calories: 1000,
      proteinG: 100,
      carbsG: 100,
      fatG: 10,
      fiberG: 10,
    });
    const tiny = reuseStoredItem(huge, { foodId: null, servingMultiplier: 0.01, loggedWeightG: 1 })!;
    expect(tiny.loggedWeightG).toBe(1);
    expect(tiny.servingMultiplier).toBe(0.01);
  });

  it('rejects a scaled item that no longer fits the column limits', () => {
    expect(() => reuseStoredItem(storedAiChicken(), { foodId: null, servingMultiplier: 5000 })).toThrow(
      AppError,
    );
  });

  it('rejects a non-positive multiplier like any other line', () => {
    expect(() => reuseStoredItem(storedEggs(), { foodId: eggFoodId, servingMultiplier: 0 })).toThrow(
      AppError,
    );
  });
});

describe('UpdateMealUseCase with stored items', () => {
  let foodRepo: IFoodRepository;
  let mealRepo: IMealRepository;
  let uow: UnitOfWork;
  let useCase: UpdateMealUseCase;
  let saved: Meal | null;

  const existingMeal = () =>
    new Meal({
      id: mealId,
      userId,
      mealType: 'lunch',
      date: '2026-11-05',
      items: [storedEggs(), storedRice(), storedAiChicken()],
    });

  beforeEach(() => {
    saved = null;
    foodRepo = {
      findById: vi.fn(async (id: string) => (id === eggFoodId ? catalogEggToday : null)),
    } as unknown as IFoodRepository;
    mealRepo = {
      findById: vi.fn(async () => existingMeal()),
      update: vi.fn(async (_id: string, _userId: string, meal: Meal) => {
        saved = meal;
        return meal;
      }),
    } as unknown as IMealRepository;
    uow = { run: vi.fn(async (work) => work()) };
    useCase = new UpdateMealUseCase(mealRepo, foodRepo, uow);
  });

  const keepLine = (mealItemId: string, foodId: string | null, servingMultiplier: number) => ({
    mealItemId,
    foodId,
    servingMultiplier,
  });

  it('removing one item leaves every other item byte-for-byte as it was logged (no catalog lookup at all)', async () => {
    await useCase.execute({
      id: mealId,
      userId,
      items: [keepLine(eggItemId, eggFoodId, 2), keepLine(aiItemId, null, 1)],
    });

    expect(saved!.items.map((i) => i.id)).toEqual([eggItemId, aiItemId]);
    const egg = saved!.items[0]!;
    expect(egg.calories).toBe(143); // not 200 x 1 = 200 from today's catalog
    expect(egg.proteinG).toBe(12.56);
    expect(saved!.totalCalories).toBe(391); // 143 + 248
    expect(foodRepo.findById).not.toHaveBeenCalled();
  });

  it('changing one portion rescales only that item', async () => {
    await useCase.execute({
      id: mealId,
      userId,
      items: [
        keepLine(eggItemId, eggFoodId, 2),
        keepLine(riceItemId, riceFoodId, 2),
        keepLine(aiItemId, null, 1),
      ],
    });

    const [egg, rice, chicken] = saved!.items;
    expect(egg!.calories).toBe(143);
    expect(rice!.calories).toBe(390);
    expect(rice!.loggedWeightG).toBe(300);
    expect(chicken!.calories).toBe(248);
  });

  it('a line without mealItemId is a new item priced from the catalog', async () => {
    await useCase.execute({
      id: mealId,
      userId,
      items: [keepLine(eggItemId, eggFoodId, 2), { foodId: eggFoodId, servingMultiplier: 1 }],
    });

    const [kept, added] = saved!.items;
    expect(kept!.id).toBe(eggItemId);
    expect(added!.id).not.toBe(eggItemId);
    expect(added!.calories).toBe(100); // 1 egg = 50 g x 200 kcal per 100 g, today's catalog
  });

  it('claims a stored item once: a second line with the same mealItemId becomes a new item, never a duplicate id', async () => {
    await useCase.execute({
      id: mealId,
      userId,
      items: [keepLine(eggItemId, eggFoodId, 2), keepLine(eggItemId, eggFoodId, 1)],
    });

    const ids = saved!.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(eggItemId);
  });

  it('ignores a mealItemId that belongs to another meal: the line is priced as a new item', async () => {
    await useCase.execute({
      id: mealId,
      userId,
      items: [keepLine('99999999-0000-4000-8000-000000000009', eggFoodId, 1)],
    });

    const only = saved!.items[0]!;
    expect(only.id).not.toBe('99999999-0000-4000-8000-000000000009');
    expect(only.calories).toBe(100);
  });

  it('a mealItemId pointing at a different food is a replacement and is priced from the catalog', async () => {
    await useCase.execute({
      id: mealId,
      userId,
      items: [keepLine(riceItemId, eggFoodId, 1)],
    });

    const only = saved!.items[0]!;
    expect(only.foodId).toBe(eggFoodId);
    expect(only.id).not.toBe(riceItemId);
    expect(only.calories).toBe(100);
  });

  it('editing only the notes keeps every item untouched', async () => {
    await useCase.execute({ id: mealId, userId, notes: 'with chutney' });
    expect(saved!.items.map((i) => i.id)).toEqual([eggItemId, riceItemId, aiItemId]);
    expect(saved!.notes).toBe('with chutney');
  });
});

describe('updateMealRequest schema', () => {
  const body = (items: unknown[]) => updateMealRequest.body.safeParse({ items });

  it('accepts mealItemId on an item', () => {
    expect(body([{ mealItemId: eggItemId, foodId: eggFoodId, servingMultiplier: 2 }]).success).toBe(true);
  });

  it('rejects a mealItemId that is not a uuid', () => {
    expect(body([{ mealItemId: 'not-a-uuid', foodId: eggFoodId, servingMultiplier: 2 }]).success).toBe(false);
  });

  it('still accepts the previous shape (no mealItemId)', () => {
    expect(body([{ foodId: eggFoodId, servingMultiplier: 2 }]).success).toBe(true);
  });
});

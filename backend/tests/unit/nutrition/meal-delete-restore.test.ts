import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/shared/errors/app-error.js';
import {
  AI_ESTIMATE_BRANDS,
  DeleteMealUseCase,
  DeleteWaterUseCase,
  LogWaterUseCase,
  Meal,
  MealItem,
  RestoreMealUseCase,
  WaterIntake,
  isAiEstimateBrand,
  toMealView,
  type IMealRepository,
  type IWaterRepository,
} from '../../../src/modules/nutrition/index.js';

const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const mealId = '33333333-3333-4333-8333-333333333333';
const waterId = '44444444-4444-4444-8444-444444444444';

/**
 * A small in-memory repository with the same observable rules as PgMealRepository: `findById` hides deleted
 * meals unless asked, `softDelete`/`restore` only act on the matching state and owner.
 */
class InMemoryMealRepo implements Pick<IMealRepository, 'findById' | 'softDelete' | 'restore'> {
  readonly meals = new Map<string, Meal>();

  async findById(id: string, userId?: string, includeDeleted = false): Promise<Meal | null> {
    const meal = this.meals.get(id);
    if (!meal) return null;
    if (userId && meal.userId !== userId) return null;
    if (meal.deletedAt && !includeDeleted) return null;
    return meal;
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const meal = this.meals.get(id);
    if (!meal || meal.userId !== userId || meal.deletedAt) return false;
    meal.deletedAt = new Date();
    return true;
  }

  async restore(id: string, userId: string): Promise<boolean> {
    const meal = this.meals.get(id);
    if (!meal || meal.userId !== userId || !meal.deletedAt) return false;
    meal.deletedAt = null;
    return true;
  }
}

function sampleMeal(): Meal {
  return new Meal({
    id: mealId,
    userId: owner,
    mealType: 'dinner',
    date: '2026-11-05',
    items: [
      new MealItem({
        id: '55555555-5555-4555-8555-555555555555',
        mealId,
        foodId: null,
        foodName: 'Dosa',
        foodBrand: 'AI Voice Estimate',
        servingSize: 2,
        servingUnit: 'piece',
        servingWeightG: 160,
        servingMultiplier: 1,
        loggedWeightG: 160,
        calories: 266,
        proteinG: 6,
        carbsG: 45,
        fatG: 7,
        fiberG: 2,
      }),
    ],
  });
}

describe('DeleteMealUseCase and RestoreMealUseCase', () => {
  let repo: InMemoryMealRepo;
  let remove: DeleteMealUseCase;
  let restore: RestoreMealUseCase;

  beforeEach(() => {
    repo = new InMemoryMealRepo();
    repo.meals.set(mealId, sampleMeal());
    remove = new DeleteMealUseCase(repo as unknown as IMealRepository);
    restore = new RestoreMealUseCase(repo as unknown as IMealRepository);
  });

  it('deleting hides the meal from every normal read', async () => {
    const result = await remove.execute({ userId: owner, id: mealId });

    expect(result).toEqual({ id: mealId, alreadyDeleted: false });
    expect(await repo.findById(mealId, owner)).toBeNull();
  });

  it('deleting twice is idempotent: the retry succeeds and says nothing changed', async () => {
    await remove.execute({ userId: owner, id: mealId });
    const retry = await remove.execute({ userId: owner, id: mealId });

    expect(retry).toEqual({ id: mealId, alreadyDeleted: true });
  });

  it('restoring brings back the same meal id with the exact items it had (no re-creation)', async () => {
    const before = toMealView(repo.meals.get(mealId)!);

    await remove.execute({ userId: owner, id: mealId });
    const result = await restore.execute({ userId: owner, id: mealId });

    expect(result.restored).toBe(true);
    expect(result.meal.id).toBe(mealId);
    expect(result.meal).toEqual(before);
    expect(result.meal.items[0]!.id).toBe('55555555-5555-4555-8555-555555555555');
    expect(await repo.findById(mealId, owner)).not.toBeNull();
  });

  it('restoring a meal that is not deleted is idempotent and returns it unchanged', async () => {
    const result = await restore.execute({ userId: owner, id: mealId });

    expect(result.restored).toBe(false);
    expect(result.meal.id).toBe(mealId);
  });

  it('delete -> restore -> delete -> restore keeps working with one id throughout', async () => {
    for (let round = 0; round < 2; round += 1) {
      expect((await remove.execute({ userId: owner, id: mealId })).alreadyDeleted).toBe(false);
      expect((await restore.execute({ userId: owner, id: mealId })).restored).toBe(true);
    }
    expect(repo.meals.size).toBe(1);
  });

  it('a meal that never existed is 404 for both operations', async () => {
    const missing = '99999999-9999-4999-8999-999999999999';
    await expect(remove.execute({ userId: owner, id: missing })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(restore.execute({ userId: owner, id: missing })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("another user's meal is 403 and is never touched, live or deleted", async () => {
    await expect(remove.execute({ userId: stranger, id: mealId })).rejects.toBeInstanceOf(AppError);
    await expect(remove.execute({ userId: stranger, id: mealId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repo.meals.get(mealId)!.deletedAt).toBeNull();

    await remove.execute({ userId: owner, id: mealId });
    await expect(restore.execute({ userId: stranger, id: mealId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repo.meals.get(mealId)!.deletedAt).not.toBeNull();
  });

  it('a concurrent delete that wins the race still reports success', async () => {
    const racing = new InMemoryMealRepo();
    racing.meals.set(mealId, sampleMeal());
    // The meal looks live when read, but another request deletes it before our write lands.
    const originalSoftDelete = racing.softDelete.bind(racing);
    racing.softDelete = async (id, userId) => {
      await originalSoftDelete(id, userId);
      return false;
    };

    const result = await new DeleteMealUseCase(racing as unknown as IMealRepository).execute({
      userId: owner,
      id: mealId,
    });
    expect(result).toEqual({ id: mealId, alreadyDeleted: true });
  });
});

describe('DeleteWaterUseCase', () => {
  const entries = new Map<string, WaterIntake>();
  let waterRepo: IWaterRepository;

  beforeEach(() => {
    entries.clear();
    entries.set(waterId, new WaterIntake({ id: waterId, userId: owner, date: '2026-11-05', amountMl: 250 }));
    waterRepo = {
      findById: async (id: string) => entries.get(id) ?? null,
      create: async (entry: WaterIntake) => {
        if (entries.has(entry.id)) return { entry: entries.get(entry.id)!, created: false };
        entries.set(entry.id, entry);
        return { entry, created: true };
      },
      delete: async (id: string, userId: string) => {
        const entry = entries.get(id);
        if (!entry || entry.userId !== userId) return false;
        entries.delete(id);
        return true;
      },
      listByDate: async () => [...entries.values()],
      getTotalByDate: async () => [...entries.values()].reduce((sum, e) => sum + e.amountMl, 0),
      getTotalDateRange: async () => [],
    };
  });

  it('removes the entry', async () => {
    const result = await new DeleteWaterUseCase(waterRepo).execute({ userId: owner, id: waterId });

    expect(result).toEqual({ id: waterId });
    expect(entries.has(waterId)).toBe(false);
  });

  it('a second delete is 404 (the entry is already gone)', async () => {
    const useCase = new DeleteWaterUseCase(waterRepo);
    await useCase.execute({ userId: owner, id: waterId });

    await expect(useCase.execute({ userId: owner, id: waterId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("another user's entry is 403 and survives", async () => {
    await expect(
      new DeleteWaterUseCase(waterRepo).execute({ userId: stranger, id: waterId }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(entries.has(waterId)).toBe(true);
  });

  it('the undo is logging the same entry again with the same id', async () => {
    const original = entries.get(waterId)!;
    await new DeleteWaterUseCase(waterRepo).execute({ userId: owner, id: waterId });

    const relog = await new LogWaterUseCase(waterRepo).execute({
      id: waterId,
      userId: owner,
      date: '2026-11-05',
      amountMl: original.amountMl,
      loggedAt: original.loggedAt,
    });

    expect(relog.created).toBe(true);
    expect(relog.entry.id).toBe(waterId);
    expect(relog.entry.amountMl).toBe(250);
    expect(await waterRepo.getTotalByDate(owner, '2026-11-05')).toBe(250);
  });
});

describe('AI estimate provenance in the meal view', () => {
  it('marks items stamped with an AI parser label, so the label survives a save and a refresh', () => {
    const view = toMealView(sampleMeal());
    expect(view.items[0]!.isEstimated).toBe(true);
  });

  it('does not mark catalog or hand-entered items', () => {
    expect(isAiEstimateBrand(null)).toBe(false);
    expect(isAiEstimateBrand(undefined)).toBe(false);
    expect(isAiEstimateBrand('Amul')).toBe(false);
    expect(isAiEstimateBrand('AI Estimate')).toBe(true);
    expect(isAiEstimateBrand(' AI Voice Estimate ')).toBe(true);
  });

  it('uses exactly the labels the Python parsers stamp (the label is a cross-service contract)', () => {
    const python = (file: string) =>
      readFileSync(
        new URL(`../../../../ai-backend/src/onusfit_ai/features/meals/application/${file}`, import.meta.url),
        'utf8',
      );

    // photo_parsing.py: `brand="AI Estimate"`, parsing.py (voice): `brand="AI Voice Estimate"`.
    expect(python('photo_parsing.py')).toContain('brand="AI Estimate"');
    expect(python('parsing.py')).toContain('brand="AI Voice Estimate"');
    expect([...AI_ESTIMATE_BRANDS].sort()).toEqual(['AI Estimate', 'AI Voice Estimate']);
  });
});

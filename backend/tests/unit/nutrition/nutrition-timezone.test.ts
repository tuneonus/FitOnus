import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '../../../src/shared/application/unit-of-work.js';
import {
  GetDailyNutritionUseCase,
  GetNutritionAnalyticsUseCase,
  LogMealUseCase,
  LogWaterUseCase,
  Meal,
  type IFoodRepository,
  type IMealRepository,
  type IUserProfileTargetPort,
  type IWaterRepository,
} from '../../../src/modules/nutrition/index.js';
import {
  addDaysToDate,
  isValidCalendarDate,
  localDateString,
  resolveTimeZone,
  todayInTimeZone,
  type Clock,
} from '../../../src/modules/nutrition/domain/local-date.js';

/**
 * Fixed clocks, no dependency on the machine timezone or the real date.
 *   LATE_EVENING_UTC  2026-11-12T20:00Z = 2026-11-13 01:30 Asia/Kolkata, still 2026-11-12 in UTC
 *   SUNDAY_NIGHT_UTC  2026-11-15T19:00Z = Monday 2026-11-16 00:30 Asia/Kolkata, still Sunday in UTC
 */
const IST = 'Asia/Kolkata';
const fixed =
  (iso: string): Clock =>
  () =>
    new Date(iso);
const LATE_EVENING_UTC = fixed('2026-11-12T20:00:00Z');
const SUNDAY_NIGHT_UTC = fixed('2026-11-15T19:00:00Z');
const userId = 'user-1';

describe('nutrition local-date helpers', () => {
  it('resolves timezones without ever throwing', () => {
    expect(resolveTimeZone(IST)).toBe(IST);
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York');
    for (const bad of [undefined, null, '', '  ', 'Not/AZone', 'x'.repeat(65)]) {
      expect(resolveTimeZone(bad as never), String(bad)).toBe('UTC');
    }
  });

  it('flips the local day at local midnight and handles month / year / leap / DST boundaries', () => {
    expect(localDateString(new Date('2026-11-12T18:29:59.999Z'), IST)).toBe('2026-11-12');
    expect(localDateString(new Date('2026-11-12T18:30:00.000Z'), IST)).toBe('2026-11-13');
    expect(localDateString(new Date('2026-11-30T18:30:00Z'), IST)).toBe('2026-12-01');
    expect(localDateString(new Date('2026-12-31T19:00:00Z'), IST)).toBe('2027-01-01');
    expect(localDateString(new Date('2026-12-31T19:00:00Z'), 'UTC')).toBe('2026-12-31');
    expect(localDateString(new Date('2028-02-28T18:30:00Z'), IST)).toBe('2028-02-29');
    expect(localDateString(new Date('2027-01-01T03:00:00Z'), 'America/New_York')).toBe('2026-12-31');
    expect(localDateString(new Date('2026-03-09T03:59:00Z'), 'America/New_York')).toBe('2026-03-08');
    expect(localDateString(new Date('2026-03-09T04:00:00Z'), 'America/New_York')).toBe('2026-03-09');
    expect(todayInTimeZone(LATE_EVENING_UTC, IST)).toBe('2026-11-13');
    expect(todayInTimeZone(LATE_EVENING_UTC, 'Not/AZone')).toBe('2026-11-12');
  });

  it('validates calendar dates and shifts them across boundaries', () => {
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
    for (const d of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '2101-01-01', '2026-1-1', '']) {
      expect(isValidCalendarDate(d), d).toBe(false);
    }
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDaysToDate('2026-11-13', -6)).toBe('2026-11-07');
  });
});

describe('nutrition use cases: implicit "today" is the user local day', () => {
  let mealRepo: IMealRepository;
  let waterRepo: IWaterRepository;
  let foodRepo: IFoodRepository;
  let targetPort: IUserProfileTargetPort;
  let uow: UnitOfWork;

  beforeEach(() => {
    mealRepo = {
      findById: vi.fn().mockResolvedValue(null),
      listByDate: vi.fn().mockResolvedValue([]),
      listDateRange: vi.fn().mockResolvedValue([]),
      create: vi.fn(async (meal: Meal) => ({ meal, created: true })),
      update: vi.fn(),
      softDelete: vi.fn(),
      getMostLoggedFoods: vi.fn().mockResolvedValue([]),
      countLoggedDays: vi.fn(),
    };
    waterRepo = {
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (entry) => ({ entry, created: true })),
      listByDate: vi.fn(),
      getTotalByDate: vi.fn().mockResolvedValue(0),
      getTotalDateRange: vi.fn(),
    };
    foodRepo = { findById: vi.fn() } as unknown as IFoodRepository;
    targetPort = { findTargetsByUserId: vi.fn().mockResolvedValue(null) };
    uow = { run: vi.fn(async (work) => work()) };
  });

  describe('GetDailyNutritionUseCase', () => {
    it('reads the IST user day (the 13th) at 01:30 IST, and the UTC day (the 12th) without a timezone', async () => {
      const useCase = new GetDailyNutritionUseCase(mealRepo, waterRepo, targetPort, LATE_EVENING_UTC);

      const ist = await useCase.execute({ userId, timezone: IST });
      expect(ist.date).toBe('2026-11-13');
      expect(mealRepo.listByDate).toHaveBeenLastCalledWith(userId, '2026-11-13');
      expect(waterRepo.getTotalByDate).toHaveBeenLastCalledWith(userId, '2026-11-13');

      const utc = await useCase.execute({ userId });
      expect(utc.date).toBe('2026-11-12');
      expect(mealRepo.listByDate).toHaveBeenLastCalledWith(userId, '2026-11-12');
    });

    it('uses an explicit client date as given and falls back to UTC for an invalid timezone', async () => {
      const useCase = new GetDailyNutritionUseCase(mealRepo, waterRepo, targetPort, LATE_EVENING_UTC);

      expect((await useCase.execute({ userId, date: '2026-11-05', timezone: IST })).date).toBe('2026-11-05');
      expect((await useCase.execute({ userId, timezone: 'Not/AZone' })).date).toBe('2026-11-12');
      await expect(useCase.execute({ userId, date: '2026-02-30' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });

  describe('LogMealUseCase default date', () => {
    const item = { foodName: 'Toast', servingMultiplier: 1, loggedWeightG: 40, calories: 100 };

    it('files an undated meal under the user local day', async () => {
      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow, LATE_EVENING_UTC);

      const ist = await useCase.execute({ userId, mealType: 'breakfast', items: [item], timezone: IST });
      expect(ist.meal.date).toBe('2026-11-13');
      const utc = await useCase.execute({ userId, mealType: 'breakfast', items: [item] });
      expect(utc.meal.date).toBe('2026-11-12');
    });

    it('keeps an explicit date untouched and stamps timestamps from the injected clock', async () => {
      const useCase = new LogMealUseCase(mealRepo, foodRepo, uow, LATE_EVENING_UTC);
      const res = await useCase.execute({
        userId,
        mealType: 'dinner',
        date: '2026-11-10',
        items: [item],
        timezone: IST,
      });
      expect(res.meal.date).toBe('2026-11-10');
      expect(res.meal.createdAt).toBe('2026-11-12T20:00:00.000Z');
      await expect(
        useCase.execute({ userId, mealType: 'dinner', date: '2026-02-30', items: [item] }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('LogWaterUseCase default date', () => {
    it('files undated water under the user local day of "now"', async () => {
      const useCase = new LogWaterUseCase(waterRepo, LATE_EVENING_UTC);

      expect((await useCase.execute({ userId, amountMl: 250, timezone: IST })).entry.date).toBe('2026-11-13');
      expect((await useCase.execute({ userId, amountMl: 250 })).entry.date).toBe('2026-11-12');
      expect((await useCase.execute({ userId, amountMl: 250, timezone: 'Not/AZone' })).entry.date).toBe(
        '2026-11-12',
      );
    });

    it('derives the day from loggedAt when the client sends only an instant (Monday 00:30 IST)', async () => {
      const useCase = new LogWaterUseCase(waterRepo, LATE_EVENING_UTC);
      const loggedAt = new Date('2026-11-15T19:00:00Z');

      expect((await useCase.execute({ userId, amountMl: 250, loggedAt, timezone: IST })).entry.date).toBe(
        '2026-11-16',
      );
      expect((await useCase.execute({ userId, amountMl: 250, loggedAt })).entry.date).toBe('2026-11-15');
    });

    it('uses an explicit date as given even when loggedAt falls on another local day', async () => {
      const useCase = new LogWaterUseCase(waterRepo, LATE_EVENING_UTC);
      const res = await useCase.execute({
        userId,
        amountMl: 250,
        date: '2026-11-12',
        loggedAt: new Date('2026-11-12T20:00:00Z'),
        timezone: IST,
      });
      expect(res.entry.date).toBe('2026-11-12');
    });
  });

  describe('GetNutritionAnalyticsUseCase window', () => {
    it('ends the week on the user local day', async () => {
      const useCase = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, LATE_EVENING_UTC);

      const ist = await useCase.execute({ userId, range: 'week', timezone: IST });
      expect([ist.startDate, ist.endDate]).toEqual(['2026-11-07', '2026-11-13']);
      expect(mealRepo.listDateRange).toHaveBeenLastCalledWith(userId, '2026-11-07', '2026-11-13');
      expect(ist.caloriesTrend).toHaveLength(7);
      expect(ist.caloriesTrend.at(-1)!.date).toBe('2026-11-13');

      const utc = await useCase.execute({ userId, range: 'week' });
      expect([utc.startDate, utc.endDate]).toEqual(['2026-11-06', '2026-11-12']);
    });

    it('uses an explicit endDate as given, and a 28 day month window', async () => {
      const useCase = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, LATE_EVENING_UTC);
      const explicit = await useCase.execute({ userId, range: 'week', endDate: '2026-11-05', timezone: IST });
      expect([explicit.startDate, explicit.endDate]).toEqual(['2026-10-30', '2026-11-05']);

      const month = await useCase.execute({ userId, range: 'month', timezone: IST });
      expect([month.startDate, month.endDate]).toEqual(['2026-10-17', '2026-11-13']);
      expect(month.totalDaysInRange).toBe(28);
    });

    it('crosses the year boundary and the leap day in local time', async () => {
      const newYear = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, fixed('2026-12-31T19:00:00Z'));
      const ist = await newYear.execute({ userId, range: 'week', timezone: IST });
      expect([ist.startDate, ist.endDate]).toEqual(['2026-12-26', '2027-01-01']);
      const utc = await newYear.execute({ userId, range: 'week' });
      expect(utc.endDate).toBe('2026-12-31');

      const leap = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, fixed('2028-02-29T18:30:00Z'));
      const afterLeap = await leap.execute({ userId, range: 'week', timezone: IST });
      expect(afterLeap.endDate).toBe('2028-03-01');
      expect(afterLeap.startDate).toBe('2028-02-24');
    });

    it('groups logged meals into the local days of the window (the 13th counts for IST)', async () => {
      const meal = new Meal({
        id: 'm1',
        userId,
        mealType: 'breakfast',
        date: '2026-11-13',
        totalCalories: 500,
        totalProteinG: 20,
        totalCarbsG: 50,
        totalFatG: 10,
      });
      vi.mocked(mealRepo.listDateRange).mockResolvedValue([meal]);
      const useCase = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, LATE_EVENING_UTC);

      const ist = await useCase.execute({ userId, range: 'week', timezone: IST });
      expect(ist.loggedDaysCount).toBe(1);
      expect(ist.caloriesTrend.at(-1)).toMatchObject({ date: '2026-11-13', value: 500 });
    });

    it('documents why a test that logs a FIXED date and then asks for the default window rots with the calendar', async () => {
      // The window is "the 7 days ending today", so a meal on a hard-coded 2026-11-05 is inside it only while
      // today is between 2026-11-05 and 2026-11-11 for the viewer; from the 12th on it is simply too old.
      const fixedMeal = new Meal({
        id: 'm1',
        userId,
        mealType: 'snack',
        date: '2026-11-05',
        totalCalories: 143,
      });
      vi.mocked(mealRepo.listDateRange).mockImplementation(async (_u, start, end) =>
        fixedMeal.date >= start && fixedMeal.date <= end ? [fixedMeal] : [],
      );
      const loggedDaysOn = async (iso: string, timezone?: string) =>
        (
          await new GetNutritionAnalyticsUseCase(mealRepo, targetPort, fixed(iso)).execute({
            userId,
            range: 'week',
            timezone,
          })
        ).loggedDaysCount;

      expect(await loggedDaysOn('2026-11-11T12:00:00Z')).toBe(1);
      expect(await loggedDaysOn('2026-11-11T12:00:00Z', IST)).toBe(1); // 17:30 IST on the 11th: window 5th-11th
      expect(await loggedDaysOn('2026-11-11T20:00:00Z', IST)).toBe(0); // 01:30 IST on the 12th: window 6th-12th
      expect(await loggedDaysOn('2026-11-11T20:00:00Z')).toBe(1); // the same instant is still the 11th in UTC
      expect(await loggedDaysOn('2026-11-12T12:00:00Z')).toBe(0);
      expect(await loggedDaysOn('2026-11-13T12:00:00Z', IST)).toBe(0);
    });

    it('rejects an impossible endDate', async () => {
      const useCase = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, LATE_EVENING_UTC);
      await expect(useCase.execute({ userId, range: 'week', endDate: '2026-02-30' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });

  it('SUNDAY_NIGHT_UTC is Monday for an IST user (sanity for week-start dependent callers)', () => {
    expect(todayInTimeZone(SUNDAY_NIGHT_UTC, IST)).toBe('2026-11-16');
    expect(todayInTimeZone(SUNDAY_NIGHT_UTC, 'UTC')).toBe('2026-11-15');
  });
});

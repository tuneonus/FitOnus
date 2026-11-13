import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { PgMealRepository, PgWaterRepository } from '../../../src/modules/nutrition/index.js';

/**
 * `pg` turns a DATE column into a JS Date at LOCAL midnight of the Node process. Reading the calendar day back
 * with toISOString() (UTC) returns the previous day on any host whose timezone is ahead of UTC, e.g. an IST
 * developer machine. The repositories must therefore read local getters; these tests switch the process
 * timezone to prove the result no longer depends on where the code runs.
 */
const MACHINE_ZONES = ['UTC', 'Asia/Kolkata', 'Pacific/Kiritimati', 'America/Los_Angeles'];
const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const db = (rows: unknown[]) =>
  ({ query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) }) as unknown as SqlExecutor;

describe('nutrition repositories read DATE columns as the stored calendar day', () => {
  it.each(MACHINE_ZONES)('water totals by day under a %s process timezone', async (machineTz) => {
    process.env.TZ = machineTz;
    const rows = [{ date: new Date(2026, 10, 5), total: '750' }]; // what pg returns for DATE '2026-11-05'
    const result = await new PgWaterRepository(db(rows)).getTotalDateRange('u', '2026-11-01', '2026-11-07');
    expect(result).toEqual([{ date: '2026-11-05', totalMl: 750 }]);
  });

  it.each(MACHINE_ZONES)('meals keep their stored day under a %s process timezone', async (machineTz) => {
    process.env.TZ = machineTz;
    const mealRow = {
      id: 'm1',
      user_id: 'u',
      meal_type: 'lunch',
      date: new Date(2026, 11, 1), // DATE '2026-12-01'
      total_calories: '100',
      total_protein_g: '1',
      total_carbs_g: '1',
      total_fat_g: '1',
      total_fiber_g: '1',
      notes: null,
      created_at: new Date('2026-12-01T00:00:00Z'),
      updated_at: new Date('2026-12-01T00:00:00Z'),
      deleted_at: null,
    };
    const executor = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [mealRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as unknown as SqlExecutor;
    const meals = await new PgMealRepository(executor).listByDate('u', '2026-12-01');
    expect(meals[0]!.date).toBe('2026-12-01');
  });

  it('still accepts the text form of a date', async () => {
    const result = await new PgWaterRepository(db([{ date: '2026-11-05', total: '10' }])).getTotalDateRange(
      'u',
      '2026-11-01',
      '2026-11-07',
    );
    expect(result[0]!.date).toBe('2026-11-05');
  });
});

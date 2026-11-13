import { describe, expect, it } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { PgAppSettingsRepository } from '../../../src/modules/app-settings/index.js';
import type { UnitOfWork } from '../../../src/shared/application/unit-of-work.js';

const USER = '11111111-1111-4111-8111-111111111111';

interface Recorded {
  sql: string;
  values: readonly unknown[];
  insideUnitOfWork: boolean;
}

/** Records every statement and whether it ran inside `uow.run`, answering from a scripted queue. */
function harness(answers: Record<string, unknown>[][]) {
  const statements: Recorded[] = [];
  let depth = 0;
  const queue = [...answers];
  const db: SqlExecutor = {
    async query(sql: string, values: readonly unknown[] = []) {
      statements.push({ sql, values, insideUnitOfWork: depth > 0 });
      return { rows: queue.shift() ?? [], rowCount: 0 } as never;
    },
  };
  const uow: UnitOfWork = {
    async run<T>(work: () => Promise<T>): Promise<T> {
      depth += 1;
      try {
        return await work();
      } finally {
        depth -= 1;
      }
    },
  };
  return { repo: new PgAppSettingsRepository(db, uow), statements };
}

const counts = (action: number, total: number) => [
  { action_count: action, total_count: total, usage_date: '2026-11-12' },
];

describe('PgAppSettingsRepository.reserveAiUsage (SQL contract)', () => {
  it('takes the per-user advisory lock first, then reads counts, then increments, all inside one transaction', async () => {
    const { repo, statements } = harness([[{}], counts(2, 5), [{ request_count: 3 }]]);

    const result = await repo.reserveAiUsage({
      userId: USER,
      actionType: 'meal_photo',
      actionLimit: 10,
      totalLimit: 50,
    });

    expect(result).toEqual({ allowed: true, usageDate: '2026-11-12', actionCount: 3, totalCount: 6 });
    expect(statements).toHaveLength(3);
    expect(statements.every((s) => s.insideUnitOfWork)).toBe(true);
    expect(statements[0]!.sql).toContain('pg_advisory_xact_lock');
    expect(statements[0]!.values).toEqual([`ai_usage:${USER}`]);
    expect(statements[1]!.sql).toContain('FROM user_ai_usage');
    expect(statements[2]!.sql).toContain('ON CONFLICT (user_id, usage_date, action_type)');
  });

  it('uses the real column name request_count (the table has no `count` column)', async () => {
    const { repo, statements } = harness([[{}], counts(0, 0), [{ request_count: 1 }]]);

    await repo.reserveAiUsage({ userId: USER, actionType: 'coach_chat', actionLimit: 5, totalLimit: 5 });

    const sql = statements.map((s) => s.sql).join('\n');
    expect(sql).toContain('request_count');
    expect(sql).not.toMatch(/\bcount\s*=/);
    expect(sql).not.toMatch(/user_ai_usage\.count\b/);
  });

  it.each([
    ['feature limit', counts(10, 12), 'action_limit'],
    ['total limit', counts(3, 50), 'total_limit'],
  ])('writes nothing when the %s is reached', async (_name, row, reason) => {
    const { repo, statements } = harness([[{}], row]);

    const result = await repo.reserveAiUsage({
      userId: USER,
      actionType: 'meal_photo',
      actionLimit: 10,
      totalLimit: 50,
    });

    expect(result).toMatchObject({ allowed: false, reason });
    expect(statements).toHaveLength(2);
    expect(statements.some((s) => /INSERT|UPDATE/i.test(s.sql))).toBe(false);
  });

  it('a limit of 0 can never admit a request', async () => {
    const { repo } = harness([[{}], counts(0, 0)]);

    await expect(
      repo.reserveAiUsage({ userId: USER, actionType: 'meal_photo', actionLimit: 0, totalLimit: 50 }),
    ).resolves.toMatchObject({ allowed: false, reason: 'action_limit' });
  });
});

describe('PgAppSettingsRepository.releaseAiUsage', () => {
  it('decrements atomically in one statement, never below zero, for the reserved day', async () => {
    const { repo, statements } = harness([[]]);

    await repo.releaseAiUsage({ userId: USER, actionType: 'voice_meal', usageDate: '2026-11-12' });

    expect(statements).toHaveLength(1);
    expect(statements[0]!.sql).toContain('GREATEST(request_count - 1, 0)');
    expect(statements[0]!.values).toEqual([USER, '2026-11-12', 'voice_meal']);
  });
});

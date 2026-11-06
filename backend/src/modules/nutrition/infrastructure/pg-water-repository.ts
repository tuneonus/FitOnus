import type { SqlExecutor } from '../../../database/transaction.js';
import { WaterIntake } from '../domain/water.js';
import type { IWaterRepository } from '../application/ports.js';

interface WaterRow {
  id: string;
  user_id: string;
  date: string | Date;
  amount_ml: number;
  logged_at: Date;
  created_at: Date;
}

function formatDate(dateVal: string | Date): string {
  if (typeof dateVal === 'string') {
    return dateVal.slice(0, 10);
  }
  return dateVal.toISOString().slice(0, 10);
}

function toDomain(row: WaterRow): WaterIntake {
  return new WaterIntake({
    id: row.id,
    userId: row.user_id,
    date: formatDate(row.date),
    amountMl: row.amount_ml,
    loggedAt: row.logged_at,
    createdAt: row.created_at,
  });
}

export class PgWaterRepository implements IWaterRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<WaterIntake | null> {
    const res = await this.db.query<WaterRow>(
      `SELECT id, user_id, date, amount_ml, logged_at, created_at FROM water_intake WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async create(entry: WaterIntake): Promise<{ entry: WaterIntake; created: boolean }> {
    const query = `
      INSERT INTO water_intake (id, user_id, date, amount_ml, logged_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
      RETURNING id, user_id, date, amount_ml, logged_at, created_at
    `;
    const res = await this.db.query<WaterRow>(query, [
      entry.id,
      entry.userId,
      entry.date,
      entry.amountMl,
      entry.loggedAt,
      entry.createdAt,
    ]);

    if (res.rows.length === 0) {
      return { entry, created: false };
    }

    return { entry: toDomain(res.rows[0]!), created: true };
  }

  async listByDate(userId: string, date: string): Promise<WaterIntake[]> {
    const res = await this.db.query<WaterRow>(
      `SELECT * FROM water_intake WHERE user_id = $1 AND date = $2 ORDER BY logged_at ASC`,
      [userId, date],
    );
    return res.rows.map(toDomain);
  }

  async getTotalByDate(userId: string, date: string): Promise<number> {
    const res = await this.db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_ml), 0)::text AS total FROM water_intake WHERE user_id = $1 AND date = $2`,
      [userId, date],
    );
    return parseInt(res.rows[0]?.total ?? '0', 10);
  }

  async getTotalDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; totalMl: number }[]> {
    const res = await this.db.query<{ date: string | Date; total: string }>(
      `
      SELECT date, COALESCE(SUM(amount_ml), 0)::text AS total
      FROM water_intake
      WHERE user_id = $1 AND date >= $2 AND date <= $3
      GROUP BY date
      ORDER BY date ASC
      `,
      [userId, startDate, endDate],
    );
    return res.rows.map((r) => ({
      date: formatDate(r.date),
      totalMl: parseInt(r.total, 10),
    }));
  }
}


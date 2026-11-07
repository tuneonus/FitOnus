import type { SqlExecutor } from '../../../database/transaction.js';
import type { IFoodFavoriteRepository } from '../application/ports.js';

export class PgFavoriteRepository implements IFoodFavoriteRepository {
  constructor(private readonly db: SqlExecutor) {}

  async addFavorite(userId: string, foodId: string): Promise<boolean> {
    const query = `
      INSERT INTO food_favorites (id, user_id, food_id, created_at)
      VALUES (gen_random_uuid(), $1, $2, NOW())
      ON CONFLICT (user_id, food_id) DO NOTHING
      RETURNING id
    `;
    const res = await this.db.query(query, [userId, foodId]);
    return (res.rowCount ?? 0) > 0;
  }

  async removeFavorite(userId: string, foodId: string): Promise<boolean> {
    const query = `DELETE FROM food_favorites WHERE user_id = $1 AND food_id = $2`;
    const res = await this.db.query(query, [userId, foodId]);
    return (res.rowCount ?? 0) > 0;
  }

  async isFavorite(userId: string, foodId: string): Promise<boolean> {
    const query = `SELECT 1 FROM food_favorites WHERE user_id = $1 AND food_id = $2 LIMIT 1`;
    const res = await this.db.query(query, [userId, foodId]);
    return (res.rowCount ?? 0) > 0;
  }

  async listFavoriteFoodIds(userId: string): Promise<string[]> {
    const query = `SELECT food_id FROM food_favorites WHERE user_id = $1 ORDER BY created_at DESC`;
    const res = await this.db.query<{ food_id: string }>(query, [userId]);
    return res.rows.map((r) => r.food_id);
  }
}

import type { SqlExecutor } from '../../../database/transaction.js';
import type { ProgressPhotoRepository } from '../application/photo-ports.js';
import {
  ProgressPhotoLimitReachedError,
  type NewProgressPhoto,
  type ProgressPhotoRecord,
  type ProgressPhotoTag,
} from '../domain/progress-photo.js';

interface PhotoRow {
  id: string;
  user_id: string;
  object_key: string;
  taken_on: string;
  tag: ProgressPhotoTag | null;
  width: number;
  height: number;
  byte_size: number;
  created_at: Date;
}

// `taken_on` is read as text: the pg driver would otherwise turn a DATE into a Date at local midnight and shift the day.
const COLUMNS = `id, user_id, object_key, to_char(taken_on, 'YYYY-MM-DD') AS taken_on, tag, width, height, byte_size, created_at`;

const toRecord = (row: PhotoRow): ProgressPhotoRecord => ({
  id: row.id,
  userId: row.user_id,
  objectKey: row.object_key,
  takenOn: row.taken_on,
  tag: row.tag,
  width: row.width,
  height: row.height,
  byteSize: row.byte_size,
  createdAt: row.created_at,
});

const isLimitViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: string }).code === '23514' &&
  (error as { constraint?: string }).constraint === 'progress_photos_user_limit';

export class PgProgressPhotoRepository implements ProgressPhotoRepository {
  constructor(private readonly db: SqlExecutor) {}

  async count(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM progress_photos WHERE user_id = $1',
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async insert(userId: string, photo: NewProgressPhoto): Promise<ProgressPhotoRecord> {
    try {
      const { rows } = await this.db.query<PhotoRow>(
        `INSERT INTO progress_photos (user_id, object_key, taken_on, tag, width, height, byte_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNS}`,
        [userId, photo.objectKey, photo.takenOn, photo.tag, photo.width, photo.height, photo.byteSize],
      );
      return toRecord(rows[0]!);
    } catch (error) {
      if (isLimitViolation(error)) throw new ProgressPhotoLimitReachedError();
      throw error;
    }
  }

  async list(userId: string): Promise<ProgressPhotoRecord[]> {
    const { rows } = await this.db.query<PhotoRow>(
      `SELECT ${COLUMNS} FROM progress_photos
        WHERE user_id = $1
        ORDER BY taken_on DESC, created_at DESC, id`,
      [userId],
    );
    return rows.map(toRecord);
  }

  async find(userId: string, id: string): Promise<ProgressPhotoRecord | null> {
    const { rows } = await this.db.query<PhotoRow>(
      `SELECT ${COLUMNS} FROM progress_photos WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query('DELETE FROM progress_photos WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
    return (rowCount ?? 0) > 0;
  }
}

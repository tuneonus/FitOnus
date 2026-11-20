import type { SqlExecutor } from '../../../database/transaction.js';
import type { AvatarRepository, MemberAvatarRecord, SaveAvatarParams } from '../application/avatar-ports.js';

interface AvatarRow {
  user_id: string;
  object_key: string;
  width: number;
  height: number;
  byte_size: number;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'user_id, object_key, width, height, byte_size, created_at, updated_at';

const toRecord = (row: AvatarRow): MemberAvatarRecord => ({
  userId: row.user_id,
  objectKey: row.object_key,
  width: row.width,
  height: row.height,
  byteSize: row.byte_size,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PgAvatarRepository implements AvatarRepository {
  constructor(private readonly db: SqlExecutor) {}

  async find(userId: string): Promise<MemberAvatarRecord | null> {
    const { rows } = await this.db.query<AvatarRow>(
      `SELECT ${COLUMNS} FROM member_avatars WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async save(userId: string, picture: SaveAvatarParams): Promise<MemberAvatarRecord> {
    // One statement, so the swap is atomic. On a replacement the UPDATE changes object_key, which fires the trigger
    // that queues the previous picture and its thumbnail for deletion (migration 0026).
    const { rows } = await this.db.query<AvatarRow>(
      `INSERT INTO member_avatars (user_id, object_key, width, height, byte_size)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
          SET object_key = EXCLUDED.object_key,
              width      = EXCLUDED.width,
              height     = EXCLUDED.height,
              byte_size  = EXCLUDED.byte_size,
              updated_at = now()
       RETURNING ${COLUMNS}`,
      [userId, picture.objectKey, picture.width, picture.height, picture.byteSize],
    );
    return toRecord(rows[0]!);
  }

  async remove(userId: string): Promise<boolean> {
    const { rowCount } = await this.db.query('DELETE FROM member_avatars WHERE user_id = $1', [userId]);
    return (rowCount ?? 0) > 0;
  }
}

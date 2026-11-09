import type { Database } from '../../../database/transaction.js';
import type { MemoryRepository } from '../application/ports.js';
import type {
  MemoryCategory,
  MemoryItem,
  MemoryListResponse,
  MemoryStatus,
} from '../domain/coach-memory.types.js';

interface MemoryRow {
  id: string;
  category: MemoryCategory;
  text: string;
  source: string;
  sensitive: boolean;
  status: MemoryStatus;
  created_at: Date;
  updated_at: Date;
}

export class PgMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Database) {}

  async listMemories(userId: string): Promise<MemoryListResponse> {
    const enabled = await this.isMemoryEnabled(userId);

    const res = await this.db.query<MemoryRow>(
      `SELECT id, category, text, source, sensitive, status, created_at, updated_at
       FROM coach_memories
       WHERE user_id = $1 AND status IN ('active', 'pending_approval')
       ORDER BY created_at DESC`,
      [userId],
    );

    const items: MemoryItem[] = [];
    const suggestions: MemoryItem[] = [];

    for (const r of res.rows) {
      const item = this.mapItem(r);
      if (r.status === 'active') {
        items.push(item);
      } else if (r.status === 'pending_approval') {
        suggestions.push(item);
      }
    }

    return {
      enabled,
      items,
      suggestions,
    };
  }

  async getMemory(userId: string, memoryId: string): Promise<MemoryItem | null> {
    const res = await this.db.query<MemoryRow>(
      `SELECT id, category, text, source, sensitive, status, created_at, updated_at
       FROM coach_memories
       WHERE id = $1 AND user_id = $2`,
      [memoryId, userId],
    );
    if (!res.rows[0]) return null;
    return this.mapItem(res.rows[0]);
  }

  async createMemory(
    userId: string,
    input: {
      category: MemoryCategory;
      text: string;
      source?: string;
      sensitive?: boolean;
      status?: MemoryStatus;
    },
  ): Promise<MemoryItem> {
    const res = await this.db.query<MemoryRow>(
      `INSERT INTO coach_memories (user_id, category, text, source, sensitive, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category, text, source, sensitive, status, created_at, updated_at`,
      [
        userId,
        input.category,
        input.text.trim(),
        input.source?.trim() || 'Conversation',
        Boolean(input.sensitive),
        input.status || 'active',
      ],
    );
    return this.mapItem(res.rows[0]!);
  }

  async updateMemory(
    userId: string,
    memoryId: string,
    text: string,
  ): Promise<MemoryItem | null> {
    const res = await this.db.query<MemoryRow>(
      `UPDATE coach_memories
       SET text = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, category, text, source, sensitive, status, created_at, updated_at`,
      [memoryId, userId, text.trim()],
    );
    if (!res.rows[0]) return null;
    return this.mapItem(res.rows[0]);
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM coach_memories WHERE id = $1 AND user_id = $2`,
      [memoryId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async updateMemoryStatus(
    userId: string,
    memoryId: string,
    status: MemoryStatus,
  ): Promise<MemoryItem | null> {
    const res = await this.db.query<MemoryRow>(
      `UPDATE coach_memories
       SET status = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, category, text, source, sensitive, status, created_at, updated_at`,
      [memoryId, userId, status],
    );
    if (!res.rows[0]) return null;
    return this.mapItem(res.rows[0]);
  }

  async clearAll(userId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM coach_memories WHERE user_id = $1`,
      [userId],
    );
  }

  async isMemoryEnabled(userId: string): Promise<boolean> {
    const res = await this.db.query<{ ai_memory_enabled: boolean | null }>(
      `SELECT ai_memory_enabled FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    // Defaults to true if row exists or not yet initialized
    return res.rows[0]?.ai_memory_enabled !== false;
  }

  async setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO user_settings (user_id, ai_memory_enabled)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET ai_memory_enabled = $2, updated_at = now()`,
      [userId, enabled],
    );
  }

  async getActiveMemoriesForContext(userId: string): Promise<string[]> {
    const enabled = await this.isMemoryEnabled(userId);
    if (!enabled) return [];

    const res = await this.db.query<{ category: string; text: string }>(
      `SELECT category, text
       FROM coach_memories
       WHERE user_id = $1 AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 15`,
      [userId],
    );

    return res.rows.map((r) => `[${r.category.toUpperCase()}]: ${r.text}`);
  }

  private mapItem(row: MemoryRow): MemoryItem {
    return {
      id: row.id,
      category: row.category,
      text: row.text,
      source: row.source,
      sensitive: row.sensitive,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}


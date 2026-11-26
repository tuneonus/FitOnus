import type { Database } from '../../../database/transaction.js';
import type { MemoryRepository } from '../application/ports.js';
import type {
  MemoryCategory,
  MemoryItem,
  MemoryListResponse,
  MemoryStatus,
} from '../domain/coach-memory.types.js';
import { estimateTokens } from '../domain/history-budget.js';

interface MemoryRow {
  id: string;
  category: MemoryCategory;
  text: string;
  source: string;
  sensitive: boolean;
  status: MemoryStatus;
  confidence: string | number | null;
  source_message_id: string | null;
  source_conversation_id: string | null;
  expires_at: Date | null;
  superseded_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PgMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Database) {}

  async listMemories(userId: string): Promise<MemoryListResponse> {
    const enabled = await this.isMemoryEnabled(userId);

    const res = await this.db.query<MemoryRow>(
      `SELECT id, category, text, source, sensitive, status,
              confidence, source_message_id, source_conversation_id, expires_at, superseded_by_id,
              created_at, updated_at
       FROM coach_memories
       WHERE user_id = $1
         AND status IN ('active', 'pending_approval')
         AND (expires_at IS NULL OR expires_at > now())
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
      `SELECT id, category, text, source, sensitive, status,
              confidence, source_message_id, source_conversation_id, expires_at, superseded_by_id,
              created_at, updated_at
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
      confidence?: number;
      sourceMessageId?: string | null;
      sourceConversationId?: string | null;
      expiresAt?: string | null;
    },
  ): Promise<MemoryItem> {
    const isSensitive = Boolean(
      input.sensitive || input.category === 'injuries' || input.category === 'medical',
    );
    // Explicit manual input may pass status='active', but default safety for sensitive is pending_approval
    const status = input.status || (isSensitive ? 'pending_approval' : 'active');
    const confidence =
      typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 1.0;

    const res = await this.db.query<MemoryRow>(
      `INSERT INTO coach_memories (
         user_id, category, text, source, sensitive, status,
         confidence, source_message_id, source_conversation_id, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, category, text, source, sensitive, status,
                 confidence, source_message_id, source_conversation_id, expires_at, superseded_by_id,
                 created_at, updated_at`,
      [
        userId,
        input.category,
        input.text.trim(),
        input.source?.trim() || 'Conversation',
        isSensitive,
        status,
        confidence,
        input.sourceMessageId || null,
        input.sourceConversationId || null,
        input.expiresAt ? new Date(input.expiresAt) : null,
      ],
    );
    return this.mapItem(res.rows[0]!);
  }

  async updateMemory(userId: string, memoryId: string, text: string): Promise<MemoryItem | null> {
    const res = await this.db.query<MemoryRow>(
      `UPDATE coach_memories
       SET text = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, category, text, source, sensitive, status,
                 confidence, source_message_id, source_conversation_id, expires_at, superseded_by_id,
                 created_at, updated_at`,
      [memoryId, userId, text.trim()],
    );
    if (!res.rows[0]) return null;
    return this.mapItem(res.rows[0]);
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM coach_memories WHERE id = $1 AND user_id = $2`, [
      memoryId,
      userId,
    ]);
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
       RETURNING id, category, text, source, sensitive, status,
                 confidence, source_message_id, source_conversation_id, expires_at, superseded_by_id,
                 created_at, updated_at`,
      [memoryId, userId, status],
    );
    if (!res.rows[0]) return null;
    return this.mapItem(res.rows[0]);
  }

  async dismissSuggestion(userId: string, memoryId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE coach_memories
       SET status = 'dismissed', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'pending_approval'`,
      [memoryId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async clearAll(userId: string): Promise<void> {
    await this.db.query(`DELETE FROM coach_memories WHERE user_id = $1`, [userId]);
    // Also cancel all pending jobs upon clearAll
    await this.db.query(
      `UPDATE ai_memory_extraction_jobs
       SET status = 'cancelled', updated_at = now()
       WHERE user_id = $1 AND status IN ('pending', 'processing', 'failed')`,
      [userId],
    );
  }

  async isMemoryEnabled(userId: string): Promise<boolean> {
    const res = await this.db.query<{
      ai_memory_enabled: boolean | null;
      ai_memory_consented_at: Date | null;
    }>(`SELECT ai_memory_enabled, ai_memory_consented_at FROM user_settings WHERE user_id = $1`, [userId]);
    const row = res.rows[0];
    if (!row) return false;
    // Strict opt-in: MUST have explicit ai_memory_enabled === true AND non-null consent timestamp
    return Boolean(row.ai_memory_enabled === true && row.ai_memory_consented_at);
  }

  async setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.db.query(
        `INSERT INTO user_settings (user_id, ai_memory_enabled, ai_memory_consented_at)
         VALUES ($1, true, now())
         ON CONFLICT (user_id) DO UPDATE
         SET ai_memory_enabled = true,
             ai_memory_consented_at = COALESCE(user_settings.ai_memory_consented_at, now()),
             updated_at = now()`,
        [userId],
      );
    } else {
      await this.db.query(
        `INSERT INTO user_settings (user_id, ai_memory_enabled)
         VALUES ($1, false)
         ON CONFLICT (user_id) DO UPDATE
         SET ai_memory_enabled = false,
             updated_at = now()`,
        [userId],
      );
      // Immediately cancel all active/pending extraction jobs upon consent revocation
      await this.db.query(
        `UPDATE ai_memory_extraction_jobs
         SET status = 'cancelled', updated_at = now()
         WHERE user_id = $1 AND status IN ('pending', 'processing', 'failed')`,
        [userId],
      );
    }
  }

  async getDismissedTexts(userId: string): Promise<string[]> {
    const res = await this.db.query<{ text: string }>(
      `SELECT text
       FROM coach_memories
       WHERE user_id = $1
         AND status = 'dismissed'
         AND updated_at >= now() - interval '90 days'`,
      [userId],
    );
    return res.rows.map((r) => r.text);
  }

  async getActiveMemoriesForContext(userId: string, queryText?: string, maxTokens = 300): Promise<string[]> {
    const enabled = await this.isMemoryEnabled(userId);
    if (!enabled) return [];

    const res = await this.db.query<{ category: MemoryCategory; text: string; updated_at: Date }>(
      `SELECT category, text, updated_at
       FROM coach_memories
       WHERE user_id = $1
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY updated_at DESC
       LIMIT 20`,
      [userId],
    );

    if (res.rows.length === 0) return [];

    // Relevance scoring if queryText provided
    let sortedRows = res.rows;
    if (queryText && queryText.trim().length > 0) {
      const qLower = queryText.toLowerCase();
      const terms = qLower.split(/\s+/).filter((t) => t.length > 2);

      const scored = res.rows.map((row) => {
        let score = 0;
        const textLower = row.text.toLowerCase();

        // Safety prioritization: Injury memories are pinned/boosted for movement queries (English, Tamil, Tanglish)
        const isWorkoutQuery =
          /(workout|exercise|squat|bench|deadlift|press|run|cardio|lift|pain|injury|shoulder|knee|back|leg|chest|arm|வலி|காயம்|தோள்பட்டை|முட்டி|முழங்கால்|இடுப்பு|முதுகு|சுளுக்கு|மார்பு|vali|valikuthu|kaayam|tholpattai|mutti|iduppu|mudhugu|soreness)/i.test(
            qLower,
          );
        const isNutritionQuery =
          /(food|eat|diet|protein|calorie|carb|fat|meal|snack|supplement|allergy|fasting|water|hydration|உணவு|சாப்பாடு|தண்ணீர்|முட்டை|பால்|புரதம்|saapadu|unavu|thanni|muttai|saapdalama|diet)/i.test(
            qLower,
          );

        if (isWorkoutQuery && (row.category === 'injuries' || row.category === 'medical')) {
          score += 10;
        }
        if (isWorkoutQuery && row.category === 'workout') {
          score += 5;
        }
        if (isNutritionQuery && (row.category === 'food' || row.category === 'supplements')) {
          score += 6;
        }

        // Keyword overlap
        for (const term of terms) {
          if (textLower.includes(term)) {
            score += 2;
          }
        }

        return { row, score };
      });

      scored.sort((a, b) => b.score - a.score);
      sortedRows = scored.map((s) => s.row);
    }

    // Token-budget capping (max 5 items, maxTokens budget)
    const result: string[] = [];
    let accumulatedTokens = 0;

    for (const r of sortedRows) {
      const cleanText = r.text
        .replace(/[\r\n\t]+/g, ' ')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim();
      const formatted = `[${r.category.toUpperCase()}]: ${cleanText}`;
      const tokens = estimateTokens(formatted);

      if (result.length > 0 && accumulatedTokens + tokens > maxTokens) {
        break;
      }

      result.push(formatted);
      accumulatedTokens += tokens;

      if (result.length >= 5) {
        break;
      }
    }

    return result;
  }

  private mapItem(row: MemoryRow): MemoryItem {
    return {
      id: row.id,
      category: row.category,
      text: row.text,
      source: row.source,
      sensitive: row.sensitive,
      status: row.status,
      confidence: row.confidence !== null ? Number(row.confidence) : undefined,
      sourceMessageId: row.source_message_id,
      sourceConversationId: row.source_conversation_id,
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      supersededById: row.superseded_by_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

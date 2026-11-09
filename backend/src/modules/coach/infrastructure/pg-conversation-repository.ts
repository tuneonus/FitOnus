import type { Database } from '../../../database/transaction.js';
import type { ConversationRepository } from '../application/ports.js';
import type {
  ConversationDetail,
  ConversationSummary,
  StoredChatMessage,
} from '../domain/coach-history.types.js';

interface ConvoRow {
  id: string;
  title: string;
  preview: string;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  blocks: any;
  sources: any;
  follow_ups: any;
  created_at: Date;
}

export class PgConversationRepository implements ConversationRepository {
  constructor(private readonly db: Database) {}

  async createConversation(
    userId: string,
    title: string,
    preview = '',
  ): Promise<ConversationSummary> {
    const res = await this.db.query<ConvoRow>(
      `INSERT INTO coach_conversations (user_id, title, preview)
       VALUES ($1, $2, $3)
       RETURNING id, title, preview, created_at, updated_at`,
      [userId, title.trim() || 'New Conversation', preview.trim()],
    );
    const row = res.rows[0]!;
    return this.mapSummary(row);
  }

  async listConversations(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ conversations: ConversationSummary[]; total: number }> {
    const countRes = await this.db.query<{ count: string }>(
      `SELECT count(*)::text as count FROM coach_conversations WHERE user_id = $1`,
      [userId],
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const listRes = await this.db.query<ConvoRow>(
      `SELECT id, title, preview, created_at, updated_at
       FROM coach_conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    return {
      conversations: listRes.rows.map((r) => this.mapSummary(r)),
      total,
    };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetail | null> {
    const convoRes = await this.db.query<ConvoRow>(
      `SELECT id, title, preview, created_at, updated_at
       FROM coach_conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    if (!convoRes.rows[0]) return null;

    const messages = await this.getMessages(userId, conversationId);
    const row = convoRes.rows[0];

    return {
      id: row.id,
      title: row.title,
      preview: row.preview,
      messages,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    updates: { title?: string; preview?: string },
  ): Promise<ConversationSummary | null> {
    const res = await this.db.query<ConvoRow>(
      `UPDATE coach_conversations
       SET title = COALESCE($3, title),
           preview = COALESCE($4, preview),
           updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, preview, created_at, updated_at`,
      [conversationId, userId, updates.title ?? null, updates.preview ?? null],
    );
    if (!res.rows[0]) return null;
    return this.mapSummary(res.rows[0]);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM coach_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async addMessage(
    userId: string,
    conversationId: string,
    message: StoredChatMessage,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO coach_messages (id, conversation_id, user_id, role, text, blocks, sources, follow_ups, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
       SET text = EXCLUDED.text,
           blocks = EXCLUDED.blocks,
           sources = EXCLUDED.sources,
           follow_ups = EXCLUDED.follow_ups`,
      [
        message.id,
        conversationId,
        userId,
        message.role,
        message.text,
        JSON.stringify(message.blocks ?? []),
        JSON.stringify(message.sources ?? []),
        JSON.stringify(message.followUps ?? []),
        message.createdAt ? new Date(message.createdAt) : new Date(),
      ],
    );

    // Update conversation timestamp and preview snippet
    const previewSnippet = message.role === 'assistant' ? message.text.slice(0, 140) : null;
    await this.db.query(
      `UPDATE coach_conversations
       SET updated_at = now(),
           preview = COALESCE($3, preview)
       WHERE id = $1 AND user_id = $2`,
      [conversationId, userId, previewSnippet],
    );
  }

  async getMessages(
    userId: string,
    conversationId: string,
    limit = 100,
  ): Promise<StoredChatMessage[]> {
    const res = await this.db.query<MessageRow>(
      `SELECT id, conversation_id, role, text, blocks, sources, follow_ups, created_at
       FROM coach_messages
       WHERE conversation_id = $1 AND user_id = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [conversationId, userId, limit],
    );

    return res.rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      text: r.text,
      blocks: typeof r.blocks === 'string' ? JSON.parse(r.blocks) : r.blocks ?? [],
      sources: typeof r.sources === 'string' ? JSON.parse(r.sources) : r.sources ?? [],
      followUps: typeof r.follow_ups === 'string' ? JSON.parse(r.follow_ups) : r.follow_ups ?? [],
      createdAt: r.created_at.toISOString(),
    }));
  }

  private mapSummary(row: ConvoRow): ConversationSummary {
    return {
      id: row.id,
      title: row.title,
      preview: row.preview,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}


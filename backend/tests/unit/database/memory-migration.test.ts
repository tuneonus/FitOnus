import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMigrations } from '../../../src/database/migration-runner.js';
import { MIGRATIONS_DIR } from '../../helpers/test-database.js';

describe('AI Memory Migration 0033', () => {
  it('loads migration 0033 with valid version and transactional mode', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0033 = migrations.find((m) => m.version === 33);

    expect(m0033).toBeDefined();
    expect(m0033?.name).toBe('harden_ai_memory_consent_and_metadata');
    expect(m0033?.transactional).toBe(true);
  });

  it('contains consent hardening and metadata definitions in 0033', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0033_harden_ai_memory_consent_and_metadata.sql');
    const sql = await readFile(filePath, 'utf8');

    // 1. Consent defaults and explicit consent timestamp
    expect(sql).toContain('ALTER TABLE user_settings');
    expect(sql).toContain('ALTER COLUMN ai_memory_enabled SET DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ai_memory_consented_at timestamptz NULL');
    expect(sql).toContain('SET ai_memory_enabled = false');
    expect(sql).toContain('WHERE ai_memory_consented_at IS NULL');

    // 2. Memory metadata columns
    expect(sql).toContain('ALTER TABLE coach_memories');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS confidence numeric(3,2)');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_message_id text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_conversation_id uuid');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS superseded_by_id uuid');

    // 3. Status constraint with superseded
    expect(sql).toContain("CHECK (status IN ('active', 'pending_approval', 'dismissed', 'archived', 'superseded'))");

    // 4. Job queue table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_memory_extraction_jobs (');
    expect(sql).toContain('user_id         uuid        NOT NULL REFERENCES users(id)');
    expect(sql).toContain('conversation_id uuid        NOT NULL REFERENCES coach_conversations(id)');
    expect(sql).toContain('status          text        NOT NULL');
    expect(sql).toContain('attempts        integer     NOT NULL DEFAULT 0');
    expect(sql).toContain('CONSTRAINT uq_ai_memory_jobs_convo_msg UNIQUE (conversation_id, message_id)');

    // 5. Indexes
    expect(sql).toContain('idx_coach_messages_convo_user_created_desc');
    expect(sql).toContain('idx_ai_memory_jobs_due');
    expect(sql).toContain('idx_ai_memory_jobs_user');
  });
});

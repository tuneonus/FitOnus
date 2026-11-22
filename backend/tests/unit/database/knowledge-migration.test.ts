import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMigrations } from '../../../src/database/migration-runner.js';
import { MIGRATIONS_DIR } from '../../helpers/test-database.js';

describe('Knowledge Base & pgvector Migrations', () => {
  it('loads migration 0029 with valid version and transactional mode', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0029 = migrations.find((m) => m.version === 29);

    expect(m0029).toBeDefined();
    expect(m0029?.name).toBe('create_vector_extension_and_knowledge_base');
    expect(m0029?.transactional).toBe(true);
  });

  it('contains pgvector extension and expected schema definitions in 0029', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0029_create_vector_extension_and_knowledge_base.sql');
    const sql = await readFile(filePath, 'utf8');

    // 1. pgvector extension
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector;');

    // 2. knowledge_documents table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS knowledge_documents (');
    expect(sql).toContain('slug        varchar(120) NOT NULL UNIQUE');
    expect(sql).toContain('title       varchar(255) NOT NULL');
    expect(sql).toContain("category    varchar(50)  NOT NULL CHECK (category IN ('fitness', 'nutrition', 'recovery', 'app_guide'))");
    expect(sql).toContain('content     text         NOT NULL');
    expect(sql).toContain('metadata    jsonb        NOT NULL DEFAULT');

    // 3. knowledge_chunks table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS knowledge_chunks (');
    expect(sql).toContain('document_id     uuid         NOT NULL REFERENCES knowledge_documents (id) ON DELETE CASCADE');
    expect(sql).toContain('chunk_index     integer      NOT NULL CHECK (chunk_index >= 0)');
    expect(sql).toContain('embedding       vector(768)  NOT NULL');
    expect(sql).toContain('CONSTRAINT uq_knowledge_chunk_doc_index UNIQUE (document_id, chunk_index)');

    // 4. Indexes including HNSW
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_knowledge_documents_slug');
    expect(sql).toContain('USING hnsw (embedding vector_cosine_ops)');
    expect(sql).toContain('WITH (m = 16, ef_construction = 64)');
  });

  it('loads migration 0030 and defines full-text GIN indexes', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0030 = migrations.find((m) => m.version === 30);

    expect(m0030).toBeDefined();
    expect(m0030?.name).toBe('create_knowledge_fulltext_index');
    expect(m0030?.transactional).toBe(true);

    const filePath = path.join(MIGRATIONS_DIR, '0030_create_knowledge_fulltext_index.sql');
    const sql = await readFile(filePath, 'utf8');

    expect(sql).toContain('idx_knowledge_chunks_content_tsv');
    expect(sql).toContain("to_tsvector('english', content)");
    expect(sql).toContain('USING gin');
  });

  it('loads migration 0031 and defines document lifecycle, author expansion and multilingual search', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0031 = migrations.find((m) => m.version === 31);

    expect(m0031).toBeDefined();
    expect(m0031?.name).toBe('add_knowledge_document_lifecycle');
    expect(m0031?.transactional).toBe(true);

    const filePath = path.join(MIGRATIONS_DIR, '0031_add_knowledge_document_lifecycle.sql');
    const sql = await readFile(filePath, 'utf8');

    // 1. Lifecycle columns
    expect(sql).toContain('is_active BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('content_hash VARCHAR(64) NULL');
    expect(sql).toContain("processing_status VARCHAR(30) NOT NULL DEFAULT 'ready'");
    expect(sql).toContain('processing_error TEXT NULL');

    // 2. Author column expansion
    expect(sql).toContain('ALTER COLUMN author TYPE VARCHAR(255)');

    // 3. Status constraint
    expect(sql).toContain("CHECK (processing_status IN ('ready', 'processing', 'failed', 'pending'))");

    // 4. Content hash unique index
    expect(sql).toContain('uq_knowledge_documents_content_hash');

    // 5. Active category composite index
    expect(sql).toContain('idx_knowledge_documents_active_category');

    // 6. Multilingual 'simple' dictionary GIN index
    expect(sql).toContain('idx_knowledge_chunks_content_tsv_simple');
    expect(sql).toContain("to_tsvector('simple', content)");
  });

  it('loads migration 0032 and defines reindex lifecycle columns, constraint and index', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0032 = migrations.find((m) => m.version === 32);

    expect(m0032).toBeDefined();
    expect(m0032?.name).toBe('add_knowledge_reindex_status');
    expect(m0032?.transactional).toBe(true);

    const filePath = path.join(MIGRATIONS_DIR, '0032_add_knowledge_reindex_status.sql');
    const sql = await readFile(filePath, 'utf8');

    // 1. Reindex status and tracking columns
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS reindex_status VARCHAR(30) NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS reindex_error TEXT NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS last_reindexed_at TIMESTAMPTZ NULL');

    // 2. Status constraint
    expect(sql).toContain('chk_knowledge_documents_reindex_status');
    expect(sql).toContain("reindex_status IN ('processing', 'failed', 'completed')");

    // 3. Reindex index
    expect(sql).toContain('idx_knowledge_documents_reindex_status');
  });
});

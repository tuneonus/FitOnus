-- Migration 0031: Knowledge Base Document Lifecycle, Status & Multilingual Search
-- FitOnus AI Phase 06.5: Production Hardening for Admin Knowledge Management
--
-- 1. Adds is_active flag for disabling documents without data loss
-- 2. Adds content_hash (SHA-256) for robust duplicate detection
-- 3. Adds processing_status and processing_error for failure tracking
-- 4. Expands author column from varchar(120) to varchar(255)
-- 5. Adds multilingual 'simple' GIN full-text index for Tamil and non-English scripts

-- 1. Lifecycle columns
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS processing_error TEXT NULL;

-- 2. Expand author column length
ALTER TABLE knowledge_documents
  ALTER COLUMN author TYPE VARCHAR(255);

-- 3. Ensure status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_knowledge_documents_status'
  ) THEN
    ALTER TABLE knowledge_documents
      ADD CONSTRAINT chk_knowledge_documents_status
      CHECK (processing_status IN ('ready', 'processing', 'failed', 'pending'));
  END IF;
END $$;

-- 4. Backfill content_hash for existing documents if any
UPDATE knowledge_documents
SET content_hash = encode(sha256(content::bytea), 'hex')
WHERE content_hash IS NULL;

-- 5. Indexes for lifecycle and duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_documents_content_hash
  ON knowledge_documents (content_hash);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_active_category
  ON knowledge_documents (category, is_active);

-- 6. Multilingual full-text search index using 'simple' dictionary (preserves non-English / Tamil tokens)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv_simple
  ON knowledge_chunks USING gin (to_tsvector('simple', content));


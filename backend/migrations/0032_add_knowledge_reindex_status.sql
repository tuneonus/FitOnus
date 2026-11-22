-- Migration 0032: Knowledge Document Reindex Status & Failure Recovery
-- FitOnus AI Phase 06.5: Safe Reindexing & Continuous Availability
--
-- Adds reindex_status, reindex_error, and last_reindexed_at to decouple
-- background reindexing operations from primary document availability (processing_status).

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS reindex_status VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS reindex_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_reindexed_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_knowledge_documents_reindex_status'
  ) THEN
    ALTER TABLE knowledge_documents
      ADD CONSTRAINT chk_knowledge_documents_reindex_status
      CHECK (reindex_status IS NULL OR reindex_status IN ('processing', 'failed', 'completed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_reindex_status
  ON knowledge_documents (reindex_status)
  WHERE reindex_status IS NOT NULL;


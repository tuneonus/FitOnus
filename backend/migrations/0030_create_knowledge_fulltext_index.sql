-- Migration 0030: Add Full-Text Search GIN index to knowledge_chunks and knowledge_documents
-- FitOnus AI Phase 06: Advanced RAG & Hybrid Retrieval
--
-- Enables fast lexical full-text search using PostgreSQL's native tsvector and GIN indexing,
-- powering hybrid retrieval with Reciprocal Rank Fusion (RRF) alongside pgvector cosine distance.

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv
  ON knowledge_chunks USING gin (to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_title_tsv
  ON knowledge_documents USING gin (to_tsvector('english', title));


-- Migration 0029: PostgreSQL pgvector extension & Knowledge Base schema
-- FitOnus AI Phase 5: Vector Database & pgvector Integration (768 dimensions)
--
-- Enables pgvector extension, creates knowledge_documents and knowledge_chunks tables,
-- and configures HNSW index for cosine distance similarity search (<=>).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        varchar(120) NOT NULL UNIQUE,
  title       varchar(255) NOT NULL,
  category    varchar(50)  NOT NULL CHECK (category IN ('fitness', 'nutrition', 'recovery', 'app_guide')),
  content     text         NOT NULL,
  author      varchar(120) NOT NULL DEFAULT 'OnusFit Editorial',
  license     varchar(120) NOT NULL DEFAULT 'Proprietary / Verified Public Domain',
  metadata    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  version     integer      NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category
  ON knowledge_documents (category);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_slug
  ON knowledge_documents (slug);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid         NOT NULL REFERENCES knowledge_documents (id) ON DELETE CASCADE,
  chunk_index     integer      NOT NULL CHECK (chunk_index >= 0),
  content         text         NOT NULL,
  token_count     integer      NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  embedding       vector(768)  NOT NULL,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT uq_knowledge_chunk_doc_index UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id
  ON knowledge_chunks (document_id);

-- HNSW (Hierarchical Navigable Small World) index for fast cosine similarity search.
-- vector_cosine_ops maps to the cosine distance operator (<=>).
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);


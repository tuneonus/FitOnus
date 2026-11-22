# OnusFit AI Engineering Guide: Phase 06.5
## Admin Knowledge Management — Production Hardening, Secure Parsing, Document Lifecycle & Multilingual Grounding
### அட்மின் அறிவு மேலாண்மை — உற்பத்தி கடினமாக்கல், பாதுகாப்பான கோப்பு பிரித்தெடுத்தல் மற்றும் பன்மொழி ஆதரவு

> **Language**: Bilingual (English + Tanglish / தமிழ்) for GenAI / AI Systems Engineer architecture depth.  
> **Key Modules**:
> - Secure Text Extraction: `backend/src/modules/knowledge/interface/text-extractor.ts`
> - Migration 0031 Lifecycle & Multilingual Index: `backend/migrations/0031_add_knowledge_document_lifecycle.sql`
> - Migration 0032 Reindex Status & Continuous Availability: `backend/migrations/0032_add_knowledge_reindex_status.sql`
> - Knowledge Persistence & Lifecycle: `backend/src/modules/knowledge/infrastructure/pg-knowledge-repository.ts`
> - Knowledge Service & Duplicate Defense: `backend/src/modules/knowledge/application/knowledge-service.ts`
> - Admin API Schemas & Routes: `backend/src/modules/knowledge/interface/knowledge-admin.schemas.ts`, `routes.ts`
> - Admin Next.js Console: `admin/src/features/knowledge/` (`KnowledgeAdminView`, `KnowledgeDocumentTable`, `KnowledgeUploadCard`)

---

## 1. Executive Summary & Production Motivation
### திட்ட சுருக்கம் மற்றும் உற்பத்தி அவசியம்

#### English:
In Phase 06, we built the hybrid retrieval and Reciprocal Rank Fusion (RRF) pipeline to ground the FitOnus AI Coach with authoritative sports science and fitness knowledge. Phase 06.5 delivers the enterprise administrative control plane: allowing administrators to upload, curate, monitor, and reindex knowledge documents without service disruption.

During initial security and architecture audits, critical vulnerabilities were identified:
1. **Unsafe Custom PDF Parser**: Vulnerable to catastrophic decompression bombs, infinite loops on malformed cross-reference tables, and memory exhaustion.
2. **Accidental Silent Overwrite**: Uploading a document with an existing slug or identical content previously risked silently deleting or mangling vector chunks.
3. **No Soft Deactivation**: Disabling an outdated article required permanently deleting it, destroying all vector embeddings in `pgvector`.
4. **Multilingual Lexical Blindspots**: The standard English PostgreSQL dictionary stripped or mishandled non-Latin scripts (Tamil, Tanglish, Diacritics).

Phase 06.5 resolves each problem with production-grade engineering patterns.

#### Tanglish / தமிழில் விளக்கம்:
Phase 06-ல நாம் RRF மற்றும் Hybrid Search உருவாக்கினோம். Phase 06.5-ல் அட்மின் டேஷ்போர்டு மூலமாக PDF, Markdown, Text ஆவணங்களை அப்லோட் செய்து, நிர்வகிக்கும் முழுமையான கட்டுப்பாட்டுத் தளத்தை (Admin Control Plane) உருவாக்கியுள்ளோம்.

ஆடிட்டின் போது கண்டுபிடிக்கப்பட்ட முக்கிய பிரச்சனைகள்:
1. **பாதுகாப்பற்ற PDF பார்சர்**: Regex-ல் பைனரி ஸ்ட்ரீம்களை பார்ஸ் செய்வது Memory Denial of Service (DoS) ஆபத்தை உருவாக்கியது.
2. **தற்செயலான டேட்டா இழப்பு**: ஒரே ஸ்லக் (slug) கொண்ட புதிய கோப்பை அப்லோட் செய்தால் பழைய chunks அழிக்கப்படும் அபாயம் இருந்தது.
3. **செயலிழக்கச் செய்யும் வசதி இன்மை**: ஒரு ஆவணத்தை தற்காலிகமாக நிறுத்த வழியில்லை; முழுமையாக delete செய்ய வேண்டியிருந்தது.
4. **தமிழ் எழுத்துக்கள் சர்ச் சிக்கல்**: PostgreSQL-ன் English dictionary தமிழ் வார்த்தைகளை ஸ்டெம் (stem) செய்ய முடியாமல் தேடலில் விடுபட வைத்தது.

இவை அனைத்தும் Phase 06.5-ல் மிக பாதுகாப்பாக சரிசெய்யப்பட்டுள்ளன.

---

## 2. Secure PDF & Document Extraction Architecture
### பாதுகாப்பான ஆவண பிரித்தெடுத்தல் கட்டமைப்பு

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin Dashboard (Upload PDF / Markdown / TXT, max 15 MiB)       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Streamed with Rate Limiter
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend TextExtractor (`text-extractor.ts`)                     │
│  ├─ sanitizeFileName(): Strips path traversal (`../`, `..\`)    │
│  ├─ detectFileType(): Checks %PDF magic bytes & UTF-8 bounds    │
│  ├─ PDFParse (v2.4.5) with strict instance isolation            │
│  ├─ Promise.race timeout (10 seconds limit)                     │
│  └─ Bounded extraction (Truncated at 500,000 characters)        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Clean UTF-8 Plaintext (English / Tamil)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Duplicate & Quota Protection Check                              │
│  ├─ Compute SHA-256 Content Hash                                │
│  ├─ Check DB: Slug already exists? -> HTTP 409 Conflict         │
│  └─ Check DB: Hash already exists? -> HTTP 409 Conflict         │
│     (Aborts BEFORE calling Gemini API to save quota & money)     │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Passes Duplicate Check
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Python AI Backend: Embed Chunks (gemini-embedding-001, 768-d)   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 768-dim Vectors
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ PostgreSQL Transaction (`pg-knowledge-repository.ts`)           │
│  ├─ INSERT knowledge_documents (is_active=true, status='ready') │
│  └─ INSERT knowledge_chunks (embedding::vector(768))            │
└─────────────────────────────────────────────────────────────────┘
```

### Key Engineering Guardrails in Text Extraction:
1. **Bounded Timeout**: Wrapped in `Promise.race([executeExtraction(), timeoutPromise])` enforcing a strict 10-second ceiling to prevent CPU starvation.
2. **Buffer Limits**: Hard-capped at 15 MiB (`MAX_DOCUMENT_UPLOAD_BYTES`), rejecting oversized streams before loading into memory.
3. **Character Truncation**: Extracted strings exceeding 500,000 characters are safely bounded to prevent Node.js V8 heap blowup.
4. **Filename Sanitization**: `sanitizeFileName()` strips ASCII control characters (`\x00-\x1f`) and directory traversal sequences (`../../etc/passwd`).

---

## 3. Document Lifecycle & Duplicate Protection
### ஆவண வாழ்க்கைச் சுழற்சி மற்றும் நகல் பாதுகாப்பு

Migration `0031_add_knowledge_document_lifecycle.sql` establishes enterprise lifecycle management:

```sql
-- 1. Lifecycle columns
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS processing_error TEXT NULL;

-- 2. Author expansion
ALTER TABLE knowledge_documents
  ALTER COLUMN author TYPE VARCHAR(255);

-- 3. Status constraint
ALTER TABLE knowledge_documents
  ADD CONSTRAINT chk_knowledge_documents_status
  CHECK (processing_status IN ('ready', 'processing', 'failed', 'pending'));

-- 4. Unique Content Hash Index
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_documents_content_hash
  ON knowledge_documents (content_hash);
```

### 3.1 Pre-Embedding Duplicate Guard
Instead of calling Google Gemini to generate embeddings for a file that will ultimately fail a unique database constraint, `KnowledgeService` computes a SHA-256 hash of the cleaned text immediately:
```ts
const contentHash = crypto.createHash('sha256').update(content).digest('hex');

const existingByHash = await this.repository.getDocumentByContentHash(contentHash);
if (existingByHash) {
  throw new AppError(
    'conflict',
    'CONFLICT',
    `A document with identical content already exists: "${existingByHash.title}" (${existingByHash.slug}).`,
  );
}
```
**Tanglish குறிப்பு**: Gemini embedding API-க்கு காசு ஆகுது! Duplicate content-ஐ ಮೊದಲே Hash போட்டு கண்டுபிடித்து 409 Conflict தந்து விடுகிறோம். இதனால் வீண் API செலவு மற்றும் latency தடுக்கப்படுகிறது.

### 3.2 Non-Destructive Reindexing & Continuous Availability
When an administrator triggers `POST /documents/:idOrSlug/reindex`:
1. **Separation of Lifecycles (Migration 0032)**:
   - `processing_status` indicates whether the document is ready for AI Coach grounding (`'ready'`). It remains `'ready'` throughout the entire reindex operation.
   - `reindex_status` tracks background reindexing (`'processing' | 'failed' | 'completed'`).
2. **Concurrency Safety**:
   - `startDocumentReindex(idOrSlug)` performs an atomic SQL update (`WHERE (reindex_status IS NULL OR reindex_status != 'processing' OR updated_at < now() - INTERVAL '5 minutes')`).
   - If another reindex is already underway, it immediately rejects with HTTP 409 Conflict without invoking Gemini.
3. **Continuous Retrieval Availability**:
   - While Gemini generates new 768-d embeddings in memory, AI Coach hybrid retrieval queries (`findSimilarChunks`, `findTextChunks`, `findHybridChunks`) continue serving the existing valid chunks because `d.processing_status = 'ready' AND d.is_active = true`.
4. **Reindex Failure Recovery**:
   - If embedding or chunking fails (e.g., quota exceeded, rate limit, timeout), `failDocumentReindex(id, error)` is called.
   - It records `reindex_status = 'failed'` and stores the exact error message in `reindex_error`.
   - **Crucially**: `processing_status` remains `'ready'`, `is_active` remains untouched, and `replaceDocumentChunks()` is never called.
   - The document remains 100% available to AI Coach and Admin Search with its original verified chunks intact.
5. **Atomic Chunk Replacement**:
   - Only upon complete, verified embedding generation are chunks atomically replaced in a single PostgreSQL transaction:
     ```sql
     DELETE FROM knowledge_chunks WHERE document_id = $1;
     INSERT INTO knowledge_chunks (...) VALUES (...);
     UPDATE knowledge_documents
       SET version = version + 1,
           processing_status = 'ready',
           reindex_status = 'completed',
           reindex_error = NULL,
           last_reindexed_at = now()
       WHERE id = $1;
     ```
   - The document's active/disabled state (`is_active`) is strictly preserved.

---

## 4. Multilingual Search Architecture (Tamil & English)
### பன்மொழி தேடல் கட்டமைப்பு (தமிழ் மற்றும் ஆங்கிலம்)

Traditional PostgreSQL full-text search uses the `'english'` dictionary, which applies Porter Stemming (e.g., "running" -> "run"). For non-English scripts like Tamil (`உடற்பயிற்சி`) or Tanglish, the English stemmer ignores non-ASCII characters or treats them as whitespace.

Migration `0031` adds a dedicated GIN full-text search index using the `'simple'` dictionary:
```sql
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv_simple
  ON knowledge_chunks USING gin (to_tsvector('simple', content));
```

In `pg-knowledge-repository.ts`, `findTextChunks()` executes a dual-dictionary matching strategy:
```sql
WHERE (d.is_active = true) AND (d.processing_status = 'ready')
  AND ($2::text IS NULL OR d.category = $2)
  AND (
    to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
    OR to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $1)
    OR c.content ILIKE ('%' || $1 || '%')
    OR d.title ILIKE ('%' || $1 || '%')
  )
```
- **English queries** benefit from morphological stemming ("squats" matches "squatting").
- **Tamil queries** (`உடற்பயிற்சி`, `புரதச்சத்து`) match via the simple dictionary and exact tokens.
- **Transliterated queries** match via substring `ILIKE`.

---

## 5. Admin Next.js Console Integration
### அட்மின் கன்சோல் ஒருங்கிணைப்பு

In `admin/src/features/knowledge/`:
- **`KnowledgeDocumentTable.tsx`**:
  - **Active / Disabled Toggle**: One-click status switch modifying `isActive` via `PATCH /documents/:id/status`.
  - **Processing Status Indicators**: Real-time badges (`Ready`, `Processing`, `Error` with tooltip).
  - **Reindex Action**: Dedicated `RefreshCw` button to trigger chunk regeneration.
  - **Metadata Modal**: Edit title, category, author, and license on the fly.
  - **Server-Side Pagination**: Integrated with `TablePagination` component.
- **`KnowledgeUploadCard.tsx`**:
  - Handles drag-and-drop file upload (PDF/TXT/MD) and direct text paste.
  - Formats friendly HTTP 409 Conflict alerts guiding the admin to use Reindex when appropriate.
- **Extended Timeouts**: Upload and reindex requests specify `AbortSignal.timeout(60000)` (60s) to gracefully handle large multi-chunk embeddings without premature frontend timeouts.

---

## 6. Verification Results
### சரிபார்ப்பு மற்றும் தணிக்கை முடிவுகள்

| Component | Checks Executed | Status |
| :--- | :--- | :--- |
| **Backend TypeScript** | `npm --prefix backend run typecheck` | Passed (0 errors) |
| **Backend Vitest** | `vitest run tests/unit/knowledge tests/unit/database/knowledge-migration.test.ts` | Passed (106/106 tests across 10 suites) |
| **Backend Build** | `tsc -p tsconfig.build.json` | Passed |
| **Admin TypeScript** | `cd admin && node_modules/.bin/tsc --noEmit` | Passed (0 errors) |
| **Admin Unit Tests** | `npm --prefix admin test` | Passed (299/299 tests across 50 suites) |
| **Admin Next.js Build** | `npm --prefix admin run build` | Passed (Turbopack, 11 routes dynamic) |
| **Python AI Backend** | `pytest ai-backend/tests` | Passed (883/883 tests) |
| **ESLint Standards** | `eslint src/modules/knowledge tests/unit/knowledge` & `admin/src/features/knowledge` | Passed (0 errors, 0 warnings) |

---

## 7. GenAI Engineer Interview Q&A
### நேர்காணல் வினா-விடை

**Q: Why shouldn't you parse arbitrary PDF binary streams using JavaScript regular expressions in production?**  
**A**: Regular expressions against arbitrary binary streams are prone to catastrophic backtracking (ReDoS) and memory exhaustion when encountering malformed objects, compressed byte-ranges, or decompression bombs. Production RAG pipelines must use dedicated, memory-isolated parsers (like `pdf-parse` / Mozilla PDF.js) with strict execution timeouts, stream bounds, and error handling.

**Q: How does FitOnus prevent wasted vector embedding API costs during document ingestion?**  
**A**: We compute a cryptographic SHA-256 content hash of the cleaned document body before chunking. We query the relational database for matching hashes or slugs. If a match is detected, an HTTP 409 Conflict is returned immediately, completely avoiding calls to Google Gemini's embedding endpoint.

**Q: How do you handle non-destructive document reindexing in a live vector database without blinding retrieval?**  
**A**: We decouple document readiness (`processing_status = 'ready'`) from background reindex lifecycle (`reindex_status = 'processing' | 'failed' | 'completed'`). During reindexing, `processing_status` remains `'ready'`, so AI Coach hybrid retrieval continues serving the existing valid chunks without downtime. New chunks and 768-d embeddings are computed in memory. If embedding fails, `reindex_status` is marked `'failed'` with error details, but existing chunks and `'ready'` status are untouched. Old chunks are only deleted and atomically replaced in PostgreSQL inside a single transaction after verified embedding generation. Concurrency is guarded at the database level using atomic conditional updates.


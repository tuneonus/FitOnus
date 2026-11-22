import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeApi } from '../src/features/knowledge/api';
import type { CreateDocumentInput } from '../src/features/knowledge/types';

describe('Admin Knowledge Base (RAG) — API Client & Contract Verification', () => {
  it('1. listDocuments encodes category, page, and limit into query string', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedMethod = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = input.toString();
      requestedMethod = init?.method ?? 'GET';
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: 'doc-1',
              slug: 'hypertrophy-volume',
              title: 'Hypertrophy Volume Guidelines',
              category: 'fitness',
              author: 'Dr. Mike',
              license: 'CC-BY-4.0',
              version: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          meta: { page: 2, limit: 10, total: 25, totalPages: 3 },
          message: 'Documents retrieved successfully',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const result = await knowledgeApi.listDocuments({
        category: 'fitness',
        page: 2,
        limit: 10,
      });

      assert.equal(requestedMethod, 'GET');
      assert.ok(requestedUrl.includes('/knowledge/documents'));
      assert.ok(requestedUrl.includes('category=fitness'));
      assert.ok(requestedUrl.includes('page=2'));
      assert.ok(requestedUrl.includes('limit=10'));
      assert.equal(result.documents.length, 1);
      assert.equal(result.documents[0].slug, 'hypertrophy-volume');
      assert.equal(result.meta?.total, 25);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2. getDocument encodes slug and forwards includeChunks query param', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      requestedUrl = input.toString();
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 'doc-1',
            slug: 'bench-press-cues',
            title: 'Bench Press Cues',
            category: 'fitness',
            content: 'Full chest touch with retracted scapulae.',
            version: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            chunks: [
              {
                id: 'chunk-1',
                documentId: 'doc-1',
                chunkIndex: 0,
                content: 'Full chest touch with retracted scapulae.',
                tokenCount: 7,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const doc = await knowledgeApi.getDocument('bench-press-cues', true);

      assert.ok(requestedUrl.includes('/knowledge/documents/bench-press-cues?includeChunks=true'));
      assert.equal(doc.slug, 'bench-press-cues');
      assert.equal(doc.chunks?.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('3. uploadFile sends raw file body with appropriate Content-Type and query metadata', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedMethod = '';
    let requestedContentType = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = input.toString();
      requestedMethod = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      requestedContentType = headers.get('Content-Type') ?? '';

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            document: {
              id: 'doc-pdf-1',
              slug: 'schoenfeld-hypertrophy',
              title: 'Schoenfeld Hypertrophy Review',
              category: 'fitness',
              author: 'Brad Schoenfeld',
              license: 'CC-BY-4.0',
              version: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            chunkCount: 8,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const fakePdf = new File(['%PDF-1.4 sample content for testing upload'], 'hypertrophy.pdf', {
        type: 'application/pdf',
      });

      const res = await knowledgeApi.uploadFile({
        file: fakePdf,
        title: 'Schoenfeld Hypertrophy Review',
        category: 'fitness',
        slug: 'schoenfeld-hypertrophy',
        author: 'Brad Schoenfeld',
        license: 'CC-BY-4.0',
      });

      assert.equal(requestedMethod, 'POST');
      assert.ok(requestedUrl.includes('/knowledge/upload'));
      assert.ok(requestedUrl.includes('title=Schoenfeld+Hypertrophy+Review'));
      assert.ok(requestedUrl.includes('category=fitness'));
      assert.ok(requestedUrl.includes('slug=schoenfeld-hypertrophy'));
      assert.ok(requestedUrl.includes('fileName=hypertrophy.pdf'));
      assert.equal(requestedContentType, 'application/pdf');
      assert.equal(res.chunkCount, 8);
      assert.equal(res.document.slug, 'schoenfeld-hypertrophy');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('4. createDocument sends JSON payload with validated input', async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = '';
    let sentBody = '';

    globalThis.fetch = mock.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestedMethod = init?.method ?? 'GET';
      sentBody = init?.body?.toString() ?? '';

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            document: {
              id: 'doc-json-1',
              slug: 'sleep-hygiene',
              title: 'Sleep Hygiene Protocols',
              category: 'recovery',
              author: 'Dr. Walker',
              version: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            chunkCount: 2,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const payload: CreateDocumentInput = {
        title: 'Sleep Hygiene Protocols',
        category: 'recovery',
        content: 'Cool room temperature and consistent circadian schedule optimize deep sleep architecture.',
        author: 'Dr. Walker',
      };

      const res = await knowledgeApi.createDocument(payload);

      assert.equal(requestedMethod, 'POST');
      const parsed = JSON.parse(sentBody);
      assert.equal(parsed.title, 'Sleep Hygiene Protocols');
      assert.equal(parsed.category, 'recovery');
      assert.equal(res.chunkCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5. deleteDocument sends DELETE request with encoded document slug', async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = '';
    let requestedUrl = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = input.toString();
      requestedMethod = init?.method ?? 'GET';
      return new Response(
        JSON.stringify({
          success: true,
          data: { idOrSlug: 'old-doc', deleted: true },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const res = await knowledgeApi.deleteDocument('old-doc');
      assert.equal(requestedMethod, 'DELETE');
      assert.ok(requestedUrl.endsWith('/knowledge/documents/old-doc'));
      assert.equal(res.deleted, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('6. search sends hybrid parameters and returns ranked chunks and RAG prompt preview', async () => {
    const originalFetch = globalThis.fetch;
    let sentPayload: Record<string, unknown> = {};

    globalThis.fetch = mock.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentPayload = JSON.parse(init?.body?.toString() ?? '{}');
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            query: 'progressive overload',
            chunks: [
              {
                id: 'chunk-1',
                documentId: 'doc-1',
                documentSlug: 'training-principles',
                documentTitle: 'Training Principles',
                documentCategory: 'fitness',
                chunkIndex: 0,
                content: 'Gradual increase of stress placed upon the body during exercise.',
                tokenCount: 12,
                similarity: 0.91,
                textRank: 0.85,
                rrfScore: 0.032,
              },
            ],
            ragContext: {
              items: [
                {
                  documentSlug: 'training-principles',
                  documentTitle: 'Training Principles',
                  category: 'fitness',
                  chunkIndex: 0,
                  content: 'Gradual increase of stress placed upon the body during exercise.',
                  citation: '[training-principles:0]',
                  similarity: 0.91,
                  rrfScore: 0.032,
                },
              ],
              citations: [
                {
                  documentSlug: 'training-principles',
                  documentTitle: 'Training Principles',
                  category: 'fitness',
                  chunkIndex: 0,
                  citation: '[training-principles:0]',
                },
              ],
              formattedPromptSection: '<retrieved_knowledge>...</retrieved_knowledge>',
              totalTokens: 12,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const res = await knowledgeApi.search({
        query: 'progressive overload',
        category: 'fitness',
        limit: 3,
        vectorWeight: 0.7,
        textWeight: 0.3,
        testRagContext: true,
      });

      assert.equal(sentPayload.query, 'progressive overload');
      assert.equal(sentPayload.category, 'fitness');
      assert.equal(sentPayload.limit, 3);
      assert.equal(sentPayload.vectorWeight, 0.7);
      assert.equal(sentPayload.textWeight, 0.3);

      assert.equal(res.chunks.length, 1);
      assert.equal(res.chunks[0].similarity, 0.91);
      assert.equal(res.ragContext?.citations.length, 1);
      assert.equal(res.ragContext?.citations[0].citation, '[training-principles:0]');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('7. toggleDocumentStatus sends PATCH request with isActive payload', async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = '';
    let requestedUrl = '';
    let sentBody = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = input.toString();
      requestedMethod = init?.method ?? 'GET';
      sentBody = init?.body?.toString() ?? '';
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 'doc-1',
            slug: 'active-doc',
            title: 'Active Document',
            category: 'fitness',
            isActive: false,
            version: 1,
            processingStatus: 'ready',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const res = await knowledgeApi.toggleDocumentStatus('active-doc', false);
      assert.equal(requestedMethod, 'PATCH');
      assert.ok(requestedUrl.endsWith('/knowledge/documents/active-doc/status'));
      assert.equal(JSON.parse(sentBody).isActive, false);
      assert.equal(res.isActive, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('8. updateDocumentMetadata sends PATCH request with updated fields', async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = '';
    let requestedUrl = '';
    let sentBody = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = input.toString();
      requestedMethod = init?.method ?? 'GET';
      sentBody = init?.body?.toString() ?? '';
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 'doc-1',
            slug: 'edit-doc',
            title: 'New Title',
            category: 'nutrition',
            author: 'New Author',
            version: 1,
            isActive: true,
            processingStatus: 'ready',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const res = await knowledgeApi.updateDocumentMetadata('edit-doc', {
        title: 'New Title',
        category: 'nutrition',
        author: 'New Author',
      });
      assert.equal(requestedMethod, 'PATCH');
      assert.ok(requestedUrl.endsWith('/knowledge/documents/edit-doc'));
      const parsed = JSON.parse(sentBody);
      assert.equal(parsed.title, 'New Title');
      assert.equal(parsed.category, 'nutrition');
      assert.equal(res.title, 'New Title');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('9. reindexDocument sends POST request to reindex endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let requestedMethod = '';
    let requestedUrl = '';

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = input.toString();
      requestedMethod = init?.method ?? 'GET';
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            document: {
              id: 'doc-1',
              slug: 'reindex-doc',
              title: 'Reindexed Doc',
              category: 'fitness',
              version: 2,
              isActive: true,
              processingStatus: 'ready',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            chunkCount: 5,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      const res = await knowledgeApi.reindexDocument('reindex-doc');
      assert.equal(requestedMethod, 'POST');
      assert.ok(requestedUrl.endsWith('/knowledge/documents/reindex-doc/reindex'));
      assert.equal(res.chunkCount, 5);
      assert.equal(res.document.version, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


import { describe, expect, it } from 'vitest';
import { CURATED_KNOWLEDGE_DOCUMENTS } from '../../../scripts/seed-knowledge.js';
import { SemanticChunker } from '../../../src/modules/knowledge/domain/semantic-chunker.js';

describe('Curated Knowledge Base Seed Dataset', () => {
  it('contains valid, authoritative knowledge documents with required provenance', () => {
    expect(CURATED_KNOWLEDGE_DOCUMENTS.length).toBeGreaterThanOrEqual(5);

    const validCategories = new Set(['fitness', 'nutrition', 'recovery', 'app_guide']);
    const seenSlugs = new Set<string>();

    for (const doc of CURATED_KNOWLEDGE_DOCUMENTS) {
      // 1. Slug checks
      expect(doc.slug).toMatch(/^[a-z0-9_-]{3,120}$/);
      expect(seenSlugs.has(doc.slug)).toBe(false);
      seenSlugs.add(doc.slug);

      // 2. Category checks
      expect(validCategories.has(doc.category)).toBe(true);

      // 3. Provenance and license attribution
      expect(doc.title.trim().length).toBeGreaterThan(10);
      expect(doc.author).toBeDefined();
      expect(doc.author!.trim().length).toBeGreaterThan(3);
      expect(doc.license).toBeDefined();
      expect(doc.license!.trim().length).toBeGreaterThan(5);

      // 4. Content validity
      expect(doc.content.trim().length).toBeGreaterThan(200);
      expect(doc.content).toContain('# ');
    }
  });

  it('chunks every curated document into valid chunks without empty slices', () => {
    const chunker = new SemanticChunker();

    for (const doc of CURATED_KNOWLEDGE_DOCUMENTS) {
      const chunks = chunker.chunk(doc.content, {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
      });

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      for (const chunk of chunks) {
        expect(chunk.content.trim().length).toBeGreaterThan(30);
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(chunk.metadata.documentSlug).toBe(doc.slug);
        expect(chunk.metadata.category).toBe(doc.category);
      }
    }
  });
});

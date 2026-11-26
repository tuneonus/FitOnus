/**
 * Reciprocal Rank Fusion (RRF) for Hybrid Information Retrieval.
 * FitOnus Phase 06: Advanced RAG & AI Coach Grounding.
 *
 * Implements standard Reciprocal Rank Fusion:
 *   RRF(d) = sum_{m in {dense, text}} (w_m / (k + r_m(d)))
 *
 * where k is a smoothing parameter (standard default = 60), r_m(d) is the 1-based rank
 * of document chunk d in ranked result list m, and w_m is an optional modality weight.
 */

import type { HybridChunk, SimilarChunk, TextChunk } from './knowledge.types.js';

export interface RrfOptions {
  /** Smoothing parameter k in RRF formula (default: 60). */
  k?: number | undefined;
  /** Multiplier weight for dense vector similarity ranking (default: 1.0). */
  vectorWeight?: number | undefined;
  /** Multiplier weight for lexical text search ranking (default: 1.0). */
  textWeight?: number | undefined;
  /** Maximum number of fused chunks to return (default: 5). */
  topK?: number | undefined;
  /** Minimum dense cosine similarity threshold to consider (default: 0.0). */
  minSimilarity?: number | undefined;
}

export function reciprocalRankFusion(
  denseResults: readonly SimilarChunk[],
  textResults: readonly TextChunk[],
  options: RrfOptions = {},
): HybridChunk[] {
  const k = Math.max(1, options.k ?? 60);
  const vectorWeight = Math.max(0, options.vectorWeight ?? 1.0);
  const textWeight = Math.max(0, options.textWeight ?? 1.0);
  const topK = Math.max(1, options.topK ?? 5);
  const minSimilarity = options.minSimilarity ?? 0.0;

  interface Entry {
    chunk: HybridChunk;
    hasDense: boolean;
    hasText: boolean;
  }

  const entries = new Map<string, Entry>();

  // 1. Process dense vector results (ranked 1..N)
  for (let idx = 0; idx < denseResults.length; idx++) {
    const item = denseResults[idx]!;
    if (item.similarity < minSimilarity) {
      continue;
    }
    const rank = idx + 1; // 1-based rank
    const scoreContribution = vectorWeight / (k + rank);

    entries.set(item.id, {
      chunk: {
        id: item.id,
        documentId: item.documentId,
        documentSlug: item.documentSlug,
        documentTitle: item.documentTitle,
        documentCategory: item.documentCategory,
        chunkIndex: item.chunkIndex,
        content: item.content,
        tokenCount: item.tokenCount,
        metadata: item.metadata,
        similarity: item.similarity,
        textRank: 0.0,
        rrfScore: scoreContribution,
        createdAt: item.createdAt,
      },
      hasDense: true,
      hasText: false,
    });
  }

  // 2. Process lexical text search results (ranked 1..M)
  for (let idx = 0; idx < textResults.length; idx++) {
    const item = textResults[idx]!;
    const rank = idx + 1; // 1-based rank
    const scoreContribution = textWeight / (k + rank);

    const existing = entries.get(item.id);
    if (existing) {
      existing.chunk.rrfScore += scoreContribution;
      existing.chunk.textRank = item.rank;
      existing.hasText = true;
    } else {
      entries.set(item.id, {
        chunk: {
          id: item.id,
          documentId: item.documentId,
          documentSlug: item.documentSlug,
          documentTitle: item.documentTitle,
          documentCategory: item.documentCategory,
          chunkIndex: item.chunkIndex,
          content: item.content,
          tokenCount: item.tokenCount,
          metadata: item.metadata,
          similarity: 0.0,
          textRank: item.rank,
          rrfScore: scoreContribution,
          createdAt: item.createdAt,
        },
        hasDense: false,
        hasText: true,
      });
    }
  }

  // 3. Deterministic sorting:
  //    Primary: rrfScore descending
  //    Secondary: similarity descending
  //    Tertiary: textRank descending
  //    Quaternary: chunk id ascending (guarantees 100% deterministic order)
  const ranked = Array.from(entries.values())
    .map((e) => e.chunk)
    .sort((a, b) => {
      const scoreDiff = b.rrfScore - a.rrfScore;
      if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;

      const simDiff = b.similarity - a.similarity;
      if (Math.abs(simDiff) > 1e-9) return simDiff;

      const textDiff = b.textRank - a.textRank;
      if (Math.abs(textDiff) > 1e-9) return textDiff;

      return a.id.localeCompare(b.id);
    });

  return ranked.slice(0, topK);
}

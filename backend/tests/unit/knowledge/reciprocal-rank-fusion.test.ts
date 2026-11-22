import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from '../../../src/modules/knowledge/domain/reciprocal-rank-fusion.js';
import type { SimilarChunk, TextChunk } from '../../../src/modules/knowledge/domain/knowledge.types.js';

describe('Reciprocal Rank Fusion (RRF) Domain Service', () => {
  const mockDate = new Date('2026-11-20T10:00:00Z');

  const makeDenseChunk = (id: string, similarity: number, index = 0): SimilarChunk => ({
    id,
    documentId: `doc-${id}`,
    documentSlug: `slug-${id}`,
    documentTitle: `Title ${id}`,
    documentCategory: 'fitness',
    chunkIndex: index,
    content: `Content for ${id}`,
    tokenCount: 40,
    metadata: {},
    similarity,
    createdAt: mockDate,
  });

  const makeTextChunk = (id: string, rank: number, index = 0): TextChunk => ({
    id,
    documentId: `doc-${id}`,
    documentSlug: `slug-${id}`,
    documentTitle: `Title ${id}`,
    documentCategory: 'fitness',
    chunkIndex: index,
    content: `Content for ${id}`,
    tokenCount: 40,
    metadata: {},
    rank,
    createdAt: mockDate,
  });

  it('computes exact RRF scores when items appear in both lists', () => {
    // Dense: chunk-A (rank 1), chunk-B (rank 2)
    // Text: chunk-B (rank 1), chunk-A (rank 2)
    const dense = [makeDenseChunk('chunk-A', 0.95), makeDenseChunk('chunk-B', 0.85)];
    const text = [makeTextChunk('chunk-B', 0.8), makeTextChunk('chunk-A', 0.4)];

    const fused = reciprocalRankFusion(dense, text, { k: 60 });

    expect(fused).toHaveLength(2);

    // chunk-A: 1/(60+1) + 1/(60+2) = 1/61 + 1/62 = 0.0163934 + 0.0161290 = 0.0325224
    // chunk-B: 1/(60+2) + 1/(60+1) = 1/62 + 1/61 = 0.0325224
    expect(fused[0]!.rrfScore).toBeCloseTo(0.0325224, 6);
    expect(fused[1]!.rrfScore).toBeCloseTo(0.0325224, 6);

    // Tied RRF score: chunk-A has higher dense similarity (0.95 vs 0.85), so chunk-A ranks first
    expect(fused[0]!.id).toBe('chunk-A');
    expect(fused[1]!.id).toBe('chunk-B');
  });

  it('fuses dense-only and text-only results gracefully', () => {
    const dense = [makeDenseChunk('dense-only-1', 0.9), makeDenseChunk('dense-only-2', 0.8)];
    const text = [makeTextChunk('text-only-1', 0.95)];

    const fused = reciprocalRankFusion(dense, text, { k: 60, topK: 5 });

    expect(fused).toHaveLength(3);
    // dense-only-1: rank 1 => 1/61 = 0.0163934
    // text-only-1:  rank 1 => 1/61 = 0.0163934
    // dense-only-2: rank 2 => 1/62 = 0.0161290
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / 61, 6);
    expect(fused[1]!.rrfScore).toBeCloseTo(1 / 61, 6);
    expect(fused[2]!.rrfScore).toBeCloseTo(1 / 62, 6);
    expect(fused[2]!.id).toBe('dense-only-2');
  });

  it('applies custom weights for vector and text components', () => {
    const dense = [makeDenseChunk('chunk-D', 0.9)];
    const text = [makeTextChunk('chunk-T', 0.9)];

    // 2x weight on vector search
    const fused = reciprocalRankFusion(dense, text, {
      k: 60,
      vectorWeight: 2.0,
      textWeight: 1.0,
    });

    expect(fused[0]!.id).toBe('chunk-D');
    expect(fused[0]!.rrfScore).toBeCloseTo(2.0 / 61, 6);
    expect(fused[1]!.id).toBe('chunk-T');
    expect(fused[1]!.rrfScore).toBeCloseTo(1.0 / 61, 6);
  });

  it('filters out dense results below minSimilarity threshold', () => {
    const dense = [
      makeDenseChunk('high-sim', 0.85),
      makeDenseChunk('low-sim', 0.25), // should be filtered
    ];
    const text: TextChunk[] = [];

    const fused = reciprocalRankFusion(dense, text, { minSimilarity: 0.5 });

    expect(fused).toHaveLength(1);
    expect(fused[0]!.id).toBe('high-sim');
  });

  it('handles empty inputs deterministically', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
    expect(reciprocalRankFusion([makeDenseChunk('single', 0.7)], [])).toHaveLength(1);
    expect(reciprocalRankFusion([], [makeTextChunk('single', 0.5)])).toHaveLength(1);
  });

  it('enforces topK limit correctly', () => {
    const dense = Array.from({ length: 10 }, (_, i) => makeDenseChunk(`dense-${i}`, 0.9 - i * 0.05));
    const fused = reciprocalRankFusion(dense, [], { topK: 3 });

    expect(fused).toHaveLength(3);
    expect(fused[0]!.id).toBe('dense-0');
    expect(fused[1]!.id).toBe('dense-1');
    expect(fused[2]!.id).toBe('dense-2');
  });

  it('breaks ties deterministically using chunk id', () => {
    // Create symmetric chunks with identical RRF score and dense similarity
    const c1 = makeDenseChunk('chunk-Z', 0.8);
    const c2 = makeDenseChunk('chunk-A', 0.8);
    const t1 = makeTextChunk('chunk-A', 0.5);
    const t2 = makeTextChunk('chunk-Z', 0.5);

    // chunk-Z: dense rank 1 (1/61), text rank 2 (1/62) => score S
    // chunk-A: dense rank 2 (1/62), text rank 1 (1/61) => score S
    const symmetricFused = reciprocalRankFusion([c1, c2], [t1, t2], { k: 60 });
    expect(symmetricFused).toHaveLength(2);
    expect(symmetricFused[0]!.rrfScore).toBeCloseTo(symmetricFused[1]!.rrfScore, 8);
    // Alphabetical tie-break: chunk-A before chunk-Z
    expect(symmetricFused[0]!.id).toBe('chunk-A');
    expect(symmetricFused[1]!.id).toBe('chunk-Z');
  });
});

import { describe, expect, it } from 'vitest';
import { SemanticChunker } from '../../../src/modules/knowledge/domain/semantic-chunker.js';

describe('SemanticChunker', () => {
  const chunker = new SemanticChunker({
    targetTokens: 100, // ~400 characters
    overlapTokens: 10, // ~40 characters
    minChars: 30,
  });

  it('returns empty array for empty or whitespace content', () => {
    expect(chunker.chunk('')).toEqual([]);
    expect(chunker.chunk('   \n\n  ')).toEqual([]);
  });

  it('keeps short content in a single chunk', () => {
    const text = 'Barbell back squats recruit the quadriceps, glutes, and adductor magnus.';
    const chunks = chunker.chunk(text, {
      slug: 'squat-basics',
      title: 'Squat Basics',
      category: 'fitness',
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.content).toBe(text);
    expect(chunks[0]!.metadata.documentSlug).toBe('squat-basics');
    expect(chunks[0]!.metadata.category).toBe('fitness');
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it('splits long content across markdown section headers', () => {
    const markdown = `# Bench Press Mechanics

The barbell bench press is the standard compound movement for developing upper body horizontal pressing strength and muscular hypertrophy.

## Scapular Retraction and Setup

Retract and depress the scapulae into the bench pad to stabilize the shoulder girdle and elevate the sternum. Maintain 5-point contact.

## Elbow Angle and Touch Point

Maintain an elbow tuck angle of 45 to 75 degrees relative to the torso to protect the rotator cuff from subacromial impingement. Lower to the lower sternum.`;

    const chunks = chunker.chunk(markdown, {
      slug: 'bench-guide',
      title: 'Bench Guide',
      category: 'fitness',
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each chunk should have accurate metadata
    expect(chunks.every((c) => c.metadata.documentSlug === 'bench-guide')).toBe(true);
    expect(chunks.every((c) => c.tokenCount > 0)).toBe(true);
    // Section headers should be captured
    const headers = chunks.map((c) => c.metadata.sectionHeader).filter(Boolean);
    expect(headers.length).toBeGreaterThan(0);
  });

  it('applies contextual overlap across adjacent chunks', () => {
    const longParagraph =
      'Sentence one explains the physiological foundation of muscle protein synthesis and amino acid transport. ' +
      'Sentence two details the intracellular signaling cascade triggered by intracellular leucine saturation. ' +
      'Sentence three describes the translation initiation phase mediated by eukaryotic initiation factors. ' +
      'Sentence four discusses the post-exercise anabolic window and nutrient timing. ' +
      'Sentence five outlines the optimal per-meal protein bolus for resistance-trained athletes.';

    const chunks = chunker.chunk(longParagraph, { slug: 'mps-guide' });

    expect(chunks.length).toBeGreaterThan(1);
    // Chunk 1 should have overlap from Chunk 0
    expect(chunks[1]!.content).toContain('...');
  });

  it('estimates token counts proportional to character lengths', () => {
    expect(chunker.estimateTokens('abcd')).toBe(1);
    expect(chunker.estimateTokens('12345678')).toBe(2);
    expect(chunker.estimateTokens('a'.repeat(400))).toBe(100);
  });
});

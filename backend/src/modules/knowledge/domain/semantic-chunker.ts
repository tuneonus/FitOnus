import type { KnowledgeCategory } from './knowledge.types.js';

export interface ChunkOutput {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: {
    documentSlug?: string;
    documentTitle?: string;
    category?: KnowledgeCategory;
    sectionHeader?: string;
    charCount: number;
  };
}

export interface ChunkerOptions {
  /** Target token size per chunk (default: 500 tokens ~2000 chars). */
  targetTokens?: number;
  /** Overlap token count to preserve context across boundaries (default: 50 tokens ~200 chars). */
  overlapTokens?: number;
  /** Minimum characters to form a valid chunk (default: 50). */
  minChars?: number;
}

/**
 * Hierarchical, markdown- and sentence-aware recursive text chunker.
 * Matches the domain splitting logic of the Python SemanticTextChunker.
 */
export class SemanticChunker {
  private readonly targetChars: number;
  private readonly overlapChars: number;
  private readonly minChars: number;

  constructor(options: ChunkerOptions = {}) {
    const targetTokens = options.targetTokens ?? 400;
    const overlapTokens = options.overlapTokens ?? 50;
    // Approximating 1 token ~= 4 characters for English / multilingual Latin text
    this.targetChars = targetTokens * 4;
    this.overlapChars = overlapTokens * 4;
    this.minChars = options.minChars ?? 50;
  }

  /**
   * Fast deterministic estimation of token count matching the canonical heuristic.
   * English averages ~4 chars/token; Tamil/Tanglish averages ~3 chars/token.
   */
  estimateTokens(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const words = trimmed.split(/\s+/).length;
    const byChars = Math.max(1, Math.ceil(trimmed.length / 4));
    return Math.max(words, byChars);
  }

  /**
   * Chunks a document into semantic chunks with metadata and contextual overlap.
   */
  chunk(
    content: string,
    metadata: { slug?: string; title?: string; category?: KnowledgeCategory } = {},
  ): ChunkOutput[] {
    const trimmed = content.trim();
    if (!trimmed) return [];

    // If entire content is smaller than target chunk size, return single chunk
    if (trimmed.length <= this.targetChars) {
      return [
        {
          chunkIndex: 0,
          content: trimmed,
          tokenCount: this.estimateTokens(trimmed),
          metadata: {
            documentSlug: metadata.slug,
            documentTitle: metadata.title,
            category: metadata.category,
            charCount: trimmed.length,
          },
        },
      ];
    }

    const sections = this.splitIntoSections(trimmed);
    const rawChunks: { text: string; header?: string }[] = [];

    for (const section of sections) {
      if (section.text.length <= this.targetChars) {
        if (section.text.length >= this.minChars) {
          rawChunks.push({ text: section.text, header: section.header });
        }
      } else {
        const subChunks = this.splitParagraphs(section.text, section.header);
        rawChunks.push(...subChunks);
      }
    }

    // Apply sliding overlap across adjacent chunks
    const result: ChunkOutput[] = [];
    for (let i = 0; i < rawChunks.length; i++) {
      let chunkText = rawChunks[i]!.text;
      const header = rawChunks[i]!.header;

      // Add overlap from previous chunk if applicable
      if (i > 0 && this.overlapChars > 0) {
        const prevText = rawChunks[i - 1]!.text;
        const overlapSnippet = prevText.slice(-this.overlapChars).trim();
        if (overlapSnippet && !chunkText.startsWith(overlapSnippet)) {
          chunkText = `...${overlapSnippet}...\n${chunkText}`;
        }
      }

      result.push({
        chunkIndex: i,
        content: chunkText,
        tokenCount: this.estimateTokens(chunkText),
        metadata: {
          documentSlug: metadata.slug,
          documentTitle: metadata.title,
          category: metadata.category,
          sectionHeader: header,
          charCount: chunkText.length,
        },
      });
    }

    return result;
  }

  private splitIntoSections(text: string): { text: string; header?: string }[] {
    const lines = text.split('\n');
    const sections: { text: string; header?: string }[] = [];
    let currentHeader: string | undefined = undefined;
    let currentLines: string[] = [];

    for (const line of lines) {
      if (/^#{1,3}\s+/.test(line)) {
        if (currentLines.length > 0) {
          sections.push({ text: currentLines.join('\n').trim(), header: currentHeader });
          currentLines = [];
        }
        currentHeader = line.replace(/^#{1,3}\s+/, '').trim();
      }
      currentLines.push(line);
    }

    if (currentLines.length > 0) {
      sections.push({ text: currentLines.join('\n').trim(), header: currentHeader });
    }

    return sections.filter((s) => s.text.length > 0);
  }

  private splitParagraphs(text: string, header?: string): { text: string; header?: string }[] {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: { text: string; header?: string }[] = [];
    let current = '';

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if ((current + '\n\n' + trimmed).trim().length <= this.targetChars) {
        current = current ? `${current}\n\n${trimmed}` : trimmed;
      } else {
        if (current.length >= this.minChars) {
          chunks.push({ text: current, header });
        }
        if (trimmed.length > this.targetChars) {
          chunks.push(...this.splitSentences(trimmed, header));
          current = '';
        } else {
          current = trimmed;
        }
      }
    }

    if (current.trim().length >= this.minChars) {
      chunks.push({ text: current.trim(), header });
    }

    return chunks;
  }

  private splitSentences(text: string, header?: string): { text: string; header?: string }[] {
    // Splits on sentence terminators followed by uppercase letter, quote, or Tamil Unicode range (\u0B80-\u0BFF)
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\u0B80-\u0BFF])/);
    const chunks: { text: string; header?: string }[] = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if ((current + ' ' + trimmed).trim().length <= this.targetChars) {
        current = current ? `${current} ${trimmed}` : trimmed;
      } else {
        if (current.length >= this.minChars) {
          chunks.push({ text: current, header });
        }
        current = trimmed;
      }
    }

    if (current.trim().length >= this.minChars) {
      chunks.push({ text: current.trim(), header });
    }

    return chunks;
  }
}


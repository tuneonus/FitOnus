import { createRequire } from 'node:module';
import { AppError } from '../../../shared/errors/app-error.js';

const require = createRequire(import.meta.url);

export const MAX_DOCUMENT_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB
export const MIN_EXTRACTED_TEXT_LENGTH = 20;
export const MAX_EXTRACTED_CHARACTERS = 500_000;
export const PDF_EXTRACTION_TIMEOUT_MS = 10_000;

export type SupportedFileType = 'txt' | 'md' | 'pdf';

export interface ExtractTextInput {
  buffer: Buffer;
  contentType?: string | undefined;
  fileName?: string | undefined;
}

export interface ExtractTextResult {
  text: string;
  detectedType: SupportedFileType;
  byteLength: number;
  wordCount: number;
}

/**
 * Sanitizes an untrusted filename, stripping directory traversal sequences,
 * non-printable characters, and bounding length.
 */
export function sanitizeFileName(name?: string | null): string | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const cleaned = name
    .replace(/[/\\]+/g, '') // Remove path separators
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove ASCII control characters
    .replace(/^\.+/, '') // Remove leading dots
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 255);
}

/**
 * Checks whether buffer contains valid printable text (including multi-byte UTF-8
 * characters like Tamil, emoji, etc.). Disallows null bytes and unexpected control chars.
 */
export function isPrintableText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  // Sample up to 8KB
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i]!;
    // Disallow null bytes and non-printable control characters except \t, \n, \r
    if (byte === 0 || (byte < 9 && byte > 0) || (byte > 13 && byte < 32)) {
      return false;
    }
  }
  return true;
}

/**
 * Detects whether the buffer is a PDF, Markdown, or plain text based on magic bytes,
 * MIME type, or file name.
 */
export function detectFileType(input: {
  buffer: Buffer;
  contentType?: string | undefined;
  fileName?: string | undefined;
}): SupportedFileType {
  const { buffer, contentType, fileName } = input;

  // 1. PDF magic bytes check: %PDF (0x25 0x50 0x44 0x46)
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
    return 'pdf';
  }

  const mime = contentType?.toLowerCase().trim() ?? '';
  const name = fileName?.toLowerCase().trim() ?? '';

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    mime === 'text/markdown' ||
    mime === 'text/x-markdown' ||
    name.endsWith('.md') ||
    name.endsWith('.markdown')
  ) {
    return 'md';
  }

  if (mime === 'text/plain' || name.endsWith('.txt') || name.endsWith('.text')) {
    return 'txt';
  }

  // Fallback: If it's valid UTF-8 text without control characters, treat as text
  if (isPrintableText(buffer)) {
    return name.endsWith('.md') ? 'md' : 'txt';
  }

  throw new AppError(
    'validation',
    'VALIDATION_FAILED',
    `Unsupported file format (${contentType || fileName || 'unknown'}). Supported formats are PDF (.pdf), Markdown (.md), and Plain Text (.txt).`,
  );
}

interface PDFParseInstance {
  load(): Promise<void>;
  getText(): Promise<{ text?: string; pages?: unknown[]; total?: number }>;
  destroy(): Promise<void>;
}

type PDFParseConstructor = new (options: { data: Buffer }) => PDFParseInstance;

/**
 * Extracts plain text from a PDF buffer using `pdf-parse` with bounded execution timeout
 * and defense against malformed or encrypted documents.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  if (buffer.length < 4 || buffer.toString('ascii', 0, 4) !== '%PDF') {
    throw new AppError('validation', 'VALIDATION_FAILED', 'Invalid PDF file: Missing %PDF magic header.');
  }

  // Lazily resolve PDFParse from pdf-parse package with strict interface typing
  const { PDFParse } = require('pdf-parse') as { PDFParse: PDFParseConstructor };

  const executeExtraction = async (): Promise<string> => {
    const parser = new PDFParse({ data: buffer });
    try {
      await parser.load();
      const result = await parser.getText();
      const rawText = result && typeof result.text === 'string' ? result.text : '';

      // Strip page numbering artifacts inserted by pdf-parse: e.g. "\n\n-- 1 of 5 --\n\n"
      const cleaned = rawText
        .replace(/\n*--\s*\d+\s*of\s*\d+\s*--\n*/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return cleaned;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (/password|encrypted/i.test(message)) {
        throw new AppError(
          'validation',
          'VALIDATION_FAILED',
          'The uploaded PDF is password-protected or encrypted. Please upload an unencrypted PDF.',
        );
      }
      if (/invalid pdf|format|damaged|corrupt/i.test(message)) {
        throw new AppError(
          'validation',
          'VALIDATION_FAILED',
          `The uploaded PDF file is damaged or malformed: ${message}`,
        );
      }
      throw new AppError('validation', 'VALIDATION_FAILED', `Failed to parse PDF document: ${message}`);
    } finally {
      try {
        await parser.destroy();
      } catch {
        // Suppress cleanup errors
      }
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(
          'validation',
          'VALIDATION_FAILED',
          `PDF text extraction exceeded the timeout limit of ${PDF_EXTRACTION_TIMEOUT_MS / 1000}s. The file may be overly complex or contain unrenderable vector loops.`,
        ),
      );
    }, PDF_EXTRACTION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([executeExtraction(), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Extracts and cleans text from an uploaded buffer (PDF, Markdown, or Plain Text).
 */
export async function extractTextFromFile(input: ExtractTextInput): Promise<ExtractTextResult> {
  const { buffer, contentType } = input;
  const fileName = sanitizeFileName(input.fileName);

  if (buffer.length === 0) {
    throw new AppError('validation', 'VALIDATION_FAILED', 'Uploaded document file is empty (0 bytes).');
  }

  if (buffer.length > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new AppError(
      'validation',
      'VALIDATION_FAILED',
      `Uploaded document exceeds maximum size of ${MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024)} MiB.`,
    );
  }

  const detectedType = detectFileType({ buffer, contentType, fileName });
  let extractedText: string;

  if (detectedType === 'pdf') {
    extractedText = await extractTextFromPdf(buffer);
  } else {
    // Markdown or Plain Text
    let raw = buffer.toString('utf-8');
    // Remove UTF-8 BOM if present
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }
    extractedText = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  // Bound extracted text to prevent memory exhaustion
  if (extractedText.length > MAX_EXTRACTED_CHARACTERS) {
    extractedText = extractedText.slice(0, MAX_EXTRACTED_CHARACTERS).trim();
  }

  if (extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new AppError(
      'validation',
      'VALIDATION_FAILED',
      `Extracted content is too short (${extractedText.length} characters). At least ${MIN_EXTRACTED_TEXT_LENGTH} characters required. For PDFs, verify that the document contains selectable text and is not an image-only scan or password-protected.`,
    );
  }

  const wordCount = extractedText.split(/\s+/).filter(Boolean).length;

  return {
    text: extractedText,
    detectedType,
    byteLength: buffer.length,
    wordCount,
  };
}

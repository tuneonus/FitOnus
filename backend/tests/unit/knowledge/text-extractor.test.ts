import { describe, expect, it } from 'vitest';
import {
  detectFileType,
  extractTextFromFile,
  extractTextFromPdf,
  isPrintableText,
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_EXTRACTED_CHARACTERS,
  MIN_EXTRACTED_TEXT_LENGTH,
  sanitizeFileName,
} from '../../../src/modules/knowledge/interface/text-extractor.js';

function createTestPdf(content: string): Buffer {
  const streamContent = `BT\n/F1 12 Tf\n50 700 Td\n(${content}) Tj\nET\n`;
  const streamLength = Buffer.byteLength(streamContent, 'utf-8');
  const pdf = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    'endobj',
    '4 0 obj',
    `<< /Length ${streamLength} >>`,
    'stream',
    streamContent,
    'endstream',
    'endobj',
    'xref',
    '0 5',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000206 00000 n ',
    'trailer',
    '<< /Size 5 /Root 1 0 R >>',
    'startxref',
    '300',
    '%%EOF',
  ].join('\n');
  return Buffer.from(pdf, 'utf-8');
}

describe('text-extractor', () => {
  describe('detectFileType', () => {
    it('detects PDF from magic bytes %PDF', () => {
      const buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj');
      expect(detectFileType({ buffer })).toBe('pdf');
    });

    it('detects PDF from MIME type and filename', () => {
      const buffer = Buffer.from('test binary content');
      expect(detectFileType({ buffer, contentType: 'application/pdf' })).toBe('pdf');
      expect(detectFileType({ buffer, fileName: 'research.pdf' })).toBe('pdf');
    });

    it('detects Markdown from MIME type and filename', () => {
      const buffer = Buffer.from('# FitOnus Workout Guide\nThis is markdown text.');
      expect(detectFileType({ buffer, contentType: 'text/markdown' })).toBe('md');
      expect(detectFileType({ buffer, fileName: 'nutrition_guide.md' })).toBe('md');
    });

    it('detects Plain Text from MIME type and filename', () => {
      const buffer = Buffer.from('Simple plain text notes for fitness coach.');
      expect(detectFileType({ buffer, contentType: 'text/plain' })).toBe('txt');
      expect(detectFileType({ buffer, fileName: 'notes.txt' })).toBe('txt');
    });

    it('falls back to txt for valid UTF-8 string without explicit extension', () => {
      const buffer = Buffer.from('Regular UTF-8 fitness and hydration guidelines.');
      expect(detectFileType({ buffer })).toBe('txt');
    });

    it('rejects binary files with unsupported formats', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      expect(() => detectFileType({ buffer, fileName: 'app.exe' })).toThrow(/Unsupported file format/);
    });
  });

  describe('sanitizeFileName', () => {
    it('strips directory traversal paths', () => {
      expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('etcpasswd.pdf');
      expect(sanitizeFileName('..\\..\\secret.txt')).toBe('secret.txt');
    });

    it('removes control characters and leading dots', () => {
      expect(sanitizeFileName('..hidden\x00file.md')).toBe('hiddenfile.md');
      expect(sanitizeFileName('normal-guide.pdf')).toBe('normal-guide.pdf');
    });

    it('returns undefined for empty or invalid names', () => {
      expect(sanitizeFileName(null)).toBeUndefined();
      expect(sanitizeFileName('')).toBeUndefined();
      expect(sanitizeFileName('   ')).toBeUndefined();
    });
  });

  describe('isPrintableText', () => {
    it('accepts standard English and whitespace', () => {
      expect(isPrintableText(Buffer.from('Daily protein requirements for athletes: 1.6-2.2 g/kg.\n\t'))).toBe(
        true,
      );
    });

    it('accepts Unicode and Tamil text', () => {
      expect(isPrintableText(Buffer.from('உடற்பயிற்சி மற்றும் உணவு முறை வழிகாட்டி'))).toBe(true);
    });

    it('rejects binary buffers containing null bytes', () => {
      expect(isPrintableText(Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]))).toBe(false);
    });
  });

  describe('extractTextFromFile - TXT & MD', () => {
    it('extracts and cleans UTF-8 text from .txt buffer', async () => {
      const text = 'Hydration is essential for optimal workout recovery and cognitive performance.';
      const buffer = Buffer.from(text, 'utf-8');
      const result = await extractTextFromFile({ buffer, fileName: 'hydration.txt' });

      expect(result.detectedType).toBe('txt');
      expect(result.text).toBe(text);
      expect(result.wordCount).toBeGreaterThan(5);
      expect(result.byteLength).toBe(buffer.length);
    });

    it('removes UTF-8 BOM if present', async () => {
      const text = 'Resistance training stimulus produces neuromuscular adaptations.';
      const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf-8')]);
      const result = await extractTextFromFile({ buffer, fileName: 'training.txt' });

      expect(result.text).toBe(text);
      expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
    });

    it('normalizes CRLF newlines in Markdown', async () => {
      const md = '# Title\r\n\r\nLine 1\r\nLine 2 with fitness principles.';
      const buffer = Buffer.from(md, 'utf-8');
      const result = await extractTextFromFile({ buffer, fileName: 'guide.md' });

      expect(result.detectedType).toBe('md');
      expect(result.text).toContain('# Title\n\nLine 1\nLine 2');
    });

    it('bounds excessively large extracted text to MAX_EXTRACTED_CHARACTERS', async () => {
      const largeContent = 'A'.repeat(MAX_EXTRACTED_CHARACTERS + 1000);
      const buffer = Buffer.from(largeContent, 'utf-8');
      const result = await extractTextFromFile({ buffer, fileName: 'huge.txt' });

      expect(result.text.length).toBe(MAX_EXTRACTED_CHARACTERS);
    });

    it('rejects empty buffer with clear validation error', async () => {
      await expect(extractTextFromFile({ buffer: Buffer.alloc(0), fileName: 'empty.txt' })).rejects.toThrow(
        /empty \(0 bytes\)/,
      );
    });

    it('rejects text below minimum length', async () => {
      const shortBuffer = Buffer.from('Too short', 'utf-8');
      await expect(extractTextFromFile({ buffer: shortBuffer, fileName: 'short.txt' })).rejects.toThrow(
        new RegExp(`too short.*At least ${MIN_EXTRACTED_TEXT_LENGTH} characters`),
      );
    });

    it('rejects files exceeding maximum size limit', async () => {
      const bigBuffer = { length: MAX_DOCUMENT_UPLOAD_BYTES + 1 } as unknown as Buffer;
      await expect(extractTextFromFile({ buffer: bigBuffer, fileName: 'large.pdf' })).rejects.toThrow(
        /exceeds maximum size/,
      );
    });
  });

  describe('extractTextFromPdf', () => {
    it('extracts text from standard PDF using pdf-parse and cleans page markers', async () => {
      const content = 'Progressive overload is the foundation of muscle hypertrophy.';
      const buffer = createTestPdf(content);

      const text = await extractTextFromPdf(buffer);
      expect(text).toContain(content);
      expect(text).not.toContain('-- 1 of 1 --');
    });

    it('extracts text via extractTextFromFile with detectedType=pdf', async () => {
      const content = 'Periodization principles enhance athletic performance and prevent overtraining.';
      const buffer = createTestPdf(content);

      const result = await extractTextFromFile({ buffer, fileName: 'periodization.pdf' });
      expect(result.detectedType).toBe('pdf');
      expect(result.text).toContain(content);
      expect(result.wordCount).toBeGreaterThan(5);
    });

    it('throws validation error if buffer lacks %PDF magic header', async () => {
      const notPdf = Buffer.from('Not a real PDF file but has extension');
      await expect(extractTextFromPdf(notPdf)).rejects.toThrow(/Missing %PDF magic header/);
    });

    it('throws validation error if PDF structure is damaged or malformed', async () => {
      const malformedPdf = Buffer.from('%PDF-1.4\nBroken binary stream without xref or trailer\n%%EOF');
      await expect(extractTextFromPdf(malformedPdf)).rejects.toThrow(/damaged or malformed|Failed to parse/);
    });

    it('throws validation error if extracted PDF content is shorter than minimum length', async () => {
      const tinyContent = 'Hi';
      const buffer = createTestPdf(tinyContent);
      await expect(extractTextFromFile({ buffer, fileName: 'tiny.pdf' })).rejects.toThrow(/too short/);
    });
  });
});

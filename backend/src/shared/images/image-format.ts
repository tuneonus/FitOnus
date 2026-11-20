/**
 * Decides what a file really is from its own first bytes. The declared Content-Type and the file name are never
 * consulted. This runs before any decoder: a format that is not accepted here is refused without ever reaching an
 * image library, which keeps SVG (can reference other files), PDF, TIFF and the like away from libvips entirely.
 */

export type AcceptedFormat = 'jpeg' | 'png' | 'webp' | 'heic';
export type RejectedFormat = 'gif' | 'avif' | 'svg' | 'tiff' | 'bmp' | 'pdf' | 'unknown';
export type SniffedFormat =
  { accepted: true; format: AcceptedFormat } | { accepted: false; format: RejectedFormat };

const accepted = (format: AcceptedFormat): SniffedFormat => ({ accepted: true, format });
const rejected = (format: RejectedFormat): SniffedFormat => ({ accepted: false, format });

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  Buffer.from(bytes.subarray(from, to)).toString('latin1');

/** ISO-BMFF brands that mean an HEVC still image (what iPhones and many Android phones write). */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const GENERIC_HEIF_BRANDS = new Set(['mif1', 'msf1']);

function sniffIsoBmff(bytes: Uint8Array): SniffedFormat | null {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== 'ftyp') return null;
  const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  // The brand list ends at the end of the ftyp box; bound it so a lying size cannot make this read far.
  const end = Math.min(declared >= 16 ? declared : 16, 256, bytes.length);
  const brands = [ascii(bytes, 8, 12)];
  for (let at = 16; at + 4 <= end; at += 4) brands.push(ascii(bytes, at, at + 4));
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return rejected('avif');
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return accepted('heic');
  // A bare "mif1" file with no HEVC brand could hold any codec, so it is not accepted as HEIC.
  if (brands.some((brand) => GENERIC_HEIF_BRANDS.has(brand))) return rejected('unknown');
  return null;
}

export function sniffImageFormat(bytes: Uint8Array): SniffedFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return accepted('jpeg');
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return accepted('png');
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP')
    return accepted('webp');

  const iso = sniffIsoBmff(bytes);
  if (iso) return iso;

  if (bytes.length >= 4 && ascii(bytes, 0, 3) === 'GIF') return rejected('gif');
  if (bytes.length >= 4 && (ascii(bytes, 0, 4) === 'II*\0' || ascii(bytes, 0, 4) === 'MM\0*'))
    return rejected('tiff');
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === 'BM') return rejected('bmp');
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === '%PDF') return rejected('pdf');

  // SVG is text: after an optional BOM and whitespace it starts with "<", and mentions an svg element early on.
  const head = ascii(bytes, 0, 1024).replace(/^ï»¿/, '').trimStart();
  if (head.startsWith('<') && /<svg[\s>/]/i.test(head)) return rejected('svg');

  return rejected('unknown');
}

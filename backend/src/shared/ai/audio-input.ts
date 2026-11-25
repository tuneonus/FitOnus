/**
 * Audio and multimodal base64 validation rules shared by nutrition and coach endpoints.
 * The Python AI backend applies stricter deep header inspection again.
 */

/** A MIME type is accepted if it contains any of these, so `audio/x-m4a` and `audio/mp4; codecs=…` pass. */
export const SUPPORTED_AUDIO_FORMATS = ['m4a', 'mp4', 'aac', 'wav', 'webm', 'ogg', 'mpeg', '3gpp'] as const;

/** Maximum size, measured on the base64 text (as the voice meal endpoint always did). */
export const MAX_AUDIO_BASE64_CHARS = 15 * 1024 * 1024;

const DISALLOWED_MIME_PREFIXES = ['image/', 'text/', 'multipart/', 'font/'] as const;
const DANGEROUS_TEXT_MARKERS = ['<svg', '<html', '<!doctype', '<script', '<?xml', '%pdf-', '<?php'] as const;

export const isSupportedAudioMime = (mimeType: string): boolean => {
  const base = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!base || DISALLOWED_MIME_PREFIXES.some((prefix) => base.startsWith(prefix))) {
    return false;
  }
  return SUPPORTED_AUDIO_FORMATS.some((format) => base.includes(format));
};

export interface Base64PayloadInspection {
  ok: boolean;
  reason?: 'empty' | 'disguised';
}

/**
 * Inspect base64 media strings before quota charges so corrupted, empty, or disguised
 * payloads (HTML/SVG/PDF/ZIP/wrong-kind binary headers) are rejected free of cost.
 */
export function inspectSafeBase64Payload(
  base64Text: string,
  expectedKind: 'audio' | 'image',
): Base64PayloadInspection {
  const commaIdx = base64Text.indexOf(',');
  let payload = base64Text;

  if (commaIdx !== -1) {
    const header = base64Text.slice(0, commaIdx).toLowerCase();
    payload = base64Text.slice(commaIdx + 1);
    if (header.startsWith('data:')) {
      const dataMime = header.slice(5).split(';', 1)[0]?.trim() ?? '';
      if (dataMime && !dataMime.startsWith(`${expectedKind}/`)) {
        if (!(expectedKind === 'audio' && dataMime === 'application/ogg')) {
          return { ok: false, reason: 'disguised' };
        }
      }
      if (dataMime.includes('svg') || dataMime.includes('html') || dataMime.includes('xml')) {
        return { ok: false, reason: 'disguised' };
      }
    }
  }

  const decoded = Buffer.from(payload.trim(), 'base64');
  if (decoded.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // Reject ELF (\x7fELF), ZIP (PK\x03\x04), and script/HTML/PDF headers.
  if (
    (decoded.length >= 4 &&
      decoded[0] === 0x7f &&
      decoded[1] === 0x45 &&
      decoded[2] === 0x4c &&
      decoded[3] === 0x46) ||
    (decoded.length >= 4 &&
      decoded[0] === 0x50 &&
      decoded[1] === 0x4b &&
      decoded[2] === 0x03 &&
      decoded[3] === 0x04)
  ) {
    return { ok: false, reason: 'disguised' };
  }

  const asciiHead = decoded.subarray(0, 256).toString('latin1').trimStart().toLowerCase();
  if (DANGEROUS_TEXT_MARKERS.some((marker) => asciiHead.startsWith(marker) || asciiHead.includes(marker))) {
    return { ok: false, reason: 'disguised' };
  }

  if (expectedKind === 'audio') {
    const isJpeg = decoded.length >= 3 && decoded[0] === 0xff && decoded[1] === 0xd8 && decoded[2] === 0xff;
    const isPng =
      decoded.length >= 8 &&
      decoded[0] === 0x89 &&
      decoded[1] === 0x50 &&
      decoded[2] === 0x4e &&
      decoded[3] === 0x47;
    if (isJpeg || isPng || asciiHead.startsWith('gif8')) {
      return { ok: false, reason: 'disguised' };
    }
  }

  if (expectedKind === 'image' && asciiHead.startsWith('gif8')) {
    return { ok: false, reason: 'disguised' };
  }

  return { ok: true };
}

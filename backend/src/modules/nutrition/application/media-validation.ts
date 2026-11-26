import {
  inspectSafeBase64Payload,
  isSupportedAudioMime,
  MAX_AUDIO_BASE64_CHARS,
} from '../../../shared/ai/audio-input.js';
import { MAX_IMAGE_BASE64_CHARS } from '../../../shared/ai/body-limits.js';
import { AppError } from '../../../shared/errors/app-error.js';

export const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/** Validate and normalize base64 image input prior to quota consumption. */
export function validateImageMediaInput(
  imageBase64: string,
  rawMimeType?: string,
): { mimeType: string; base64: string } {
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'Image size exceeds the 10MB limit.');
  }
  const rawMime = (rawMimeType || 'image/jpeg').split(';', 1)[0]?.trim().toLowerCase() ?? 'image/jpeg';
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime === 'image/heif' ? 'image/heic' : rawMime;
  if (!(SUPPORTED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
    throw new AppError(
      'bad_request',
      'BAD_REQUEST',
      `Unsupported image format. Allowed formats: ${SUPPORTED_IMAGE_MIMES.join(', ')}`,
    );
  }
  const inspection = inspectSafeBase64Payload(imageBase64, 'image');
  if (!inspection.ok) {
    throw new AppError(
      'validation',
      'VALIDATION_FAILED',
      inspection.reason === 'empty'
        ? 'Image data is empty or unreadable.'
        : 'Image payload contains unsupported or unsafe content.',
    );
  }
  return { mimeType, base64: imageBase64 };
}

/** Validate and normalize base64 audio input prior to quota consumption. */
export function validateAudioMediaInput(
  audioBase64: string,
  rawMimeType?: string,
): { mimeType: string; base64: string } {
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', 'Audio size exceeds the 15MB limit.');
  }
  const mimeType = rawMimeType || 'audio/m4a';
  if (!isSupportedAudioMime(mimeType)) {
    throw new AppError(
      'bad_request',
      'BAD_REQUEST',
      `Unsupported audio format (${mimeType}). Supported formats: m4a, mp4, aac, wav, webm, ogg.`,
    );
  }
  const inspection = inspectSafeBase64Payload(audioBase64, 'audio');
  if (!inspection.ok) {
    throw new AppError(
      'validation',
      'VALIDATION_FAILED',
      inspection.reason === 'empty'
        ? 'Audio data is empty or unreadable.'
        : 'Audio payload contains unsupported or unsafe content.',
    );
  }
  return { mimeType, base64: audioBase64 };
}
